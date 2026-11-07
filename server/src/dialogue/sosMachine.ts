import type { LLMAdapter } from "../adapters/llm.js";
import type { AddressResult } from "../adapters/geocode.js";
import type { CaseStore } from "../cases/store.js";
import type { Protocol } from "../protocols/index.js";
import type { Case, Severity } from "../types/case.js";
import type { Extraction, ProtocolId, SosQuestion, TriageAnswer, TriageFacts, TriageQuestion } from "../types/triage.js";
import type { Lang, SosState } from "../types/voice.js";
import {
  ALMOST_THERE, ARE_YOU_THERE, ARRIVED, ASK_ADDRESS, ASK_BREATHING, ASK_LANDMARK, ASK_RESPONSIVE, CALL_112, dispatched,
  etaUpdate, FALSE_ALARM_OFFER, LOCATION_UPDATED, locationConfirm, locationNear, NO_ACK, PRE_ACK, RECHECK_STARTED, RECHECK_STILL,
  SAY_AGAIN, SOS_OPENING,
} from "./lines.js";
import { extractFacts, parseAnswer, parseLocationAnswer, replyTopic, saysFalseAlarm } from "./ruleExtract.js";
import { higherSeverity, triage, type TriageResult } from "./triageRules.js";

const SILENCE_PROMPT_MS = 8000;
const RECHECK_MS = 45000;
const WAITING_STEP_MS = 20000;
const MAX_ATTEMPTS = 2;
const POOR_ACCURACY_M = 100;
const ETA_SPOKEN_AT = 5;
const ALMOST_THERE_AT = 2;
const RANK: Record<Severity, number> = { GREEN: 0, AMBER: 1, RED: 2 };

export interface SosIo {
  /** Resolves when the line has finished playing, or was interrupted. */
  say(text: string, options: { lang: Lang; cacheable: boolean; interruptible: boolean }): Promise<void>;
  interrupt(): void;
  publish(state: SosState): void;
  pause?(ms: number): Promise<void>;
}

export interface SosDeps {
  cases: CaseStore;
  llm: LLMAdapter;
  protocols: Map<ProtocolId, Protocol>;
  addressFor(caseId: string): Promise<AddressResult | null>;
}

const definedOnly = (facts: TriageFacts): TriageFacts =>
  Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== null && value !== undefined));

/**
 * Voice track of the SOS state machine (Dev Guide 5.1). Rules decide; the LLM only fills gaps
 * and can raise severity. All spoken text comes from fixed lines or protocol files.
 * Status updates wait for protocol steps and questions, so nothing cuts across an instruction.
 */
export class SosMachine {
  private stage: SosState["stage"] = "opening";
  private question: SosQuestion | null = null;
  private attempts = 0;
  private stopped = false;
  private io: SosIo | null;
  private ruleFacts: TriageFacts = {};
  private llmFacts: TriageFacts = {};
  private details: Record<string, string> = {};
  private readonly skipped = new Set<TriageQuestion>();
  private readonly heard: string[] = [];
  private silenceTimer: NodeJS.Timeout | undefined;
  private recheckTimer: NodeJS.Timeout | undefined;
  private waitingStepTimer: NodeJS.Timeout | undefined;
  private queue: Promise<void> = Promise.resolve();
  private current: TriageResult | null = null;
  private steps: { protocol: Protocol; next: number; first: boolean } | null = null;
  private rhythm = false;
  private falseAlarmOffered = false;
  private readonly saidWaiting = new Set<string>();
  private heldUpdates: { text: string; cacheable: boolean }[] = [];
  private lastDispatchStatus: Case["dispatch"]["status"] = "requested";
  private lastSpokenEta = Number.POSITIVE_INFINITY;
  private lastSpokenRed = false;
  private preAckSpoken = false;

  constructor(
    private readonly caseId: string,
    private readonly lang: Lang,
    private readonly deps: SosDeps,
    io: SosIo,
  ) {
    this.io = io;
  }

  /** `openingPlayed` means the phone already played the opening from its local copy. */
  begin(openingPlayed = false) {
    return this.run(async () => {
      if (openingPlayed) this.deps.cases.addEvent(this.caseId, "ayu_utterance", { text: SOS_OPENING[this.lang], local: true });
      else await this.speak(SOS_OPENING[this.lang]);
      await this.askNext();
    });
  }

  /** The connection dropped. Timers keep state but nothing is spoken until the phone returns. */
  detach() {
    this.io = null;
    this.clearSilenceTimer();
    this.clearWaitingTimers();
  }

  /** The phone reconnected: restore the screen and pick up whatever was in progress. */
  attach(io: SosIo) {
    this.io = io;
    this.publish();
    return this.run(async () => {
      await this.finishSteps();
      if (this.question) await this.ask(this.question);
      else if (this.stage === "waiting") await this.enterWaiting();
    });
  }

  /** Spoken input. Rules run at once; the LLM runs alongside and can only fill gaps or raise. */
  onUtterance(text: string) {
    this.heard.push(text);
    const facts = definedOnly(extractFacts(text));
    this.ruleFacts = { ...this.ruleFacts, ...facts };
    const extraction = this.deps.llm.extract(this.heard.slice(-3)).catch(() => null);

    return this.run(async () => {
      const asked = this.question;
      // A worsening patient outranks any question: "he stopped breathing" is never an address.
      if (this.current && this.protocolShouldChange()) {
        this.clearQuestion();
        await this.reassess();
        if (asked) await this.ask(asked);
        return;
      }
      if (!this.falseAlarmOffered && this.current?.severity !== "RED" && saysFalseAlarm(text)) {
        void extraction.then((result) => this.afterExtraction(result));
        await this.offerFalseAlarm(asked);
        return;
      }
      if (asked === "location" || asked === "landmark") return this.handlePlaceReply(asked, text, extraction);
      if (asked === "recheck") return this.handleRecheckReply(text, extraction);
      if (asked && this.stage === "triage") return this.handleTriageReply(asked, text, extraction);
      void extraction.then((result) => this.afterExtraction(result));
      if (this.stage === "waiting" || this.stage === "protocol") await this.reassess();
    });
  }

  /** Prisma returned nothing usable for a pending question. */
  onEmptyTranscript() {
    return this.run(async () => {
      if (this.question) await this.retry(this.question, SAY_AGAIN[this.lang]);
    });
  }

  /** Yes / No / Not sure buttons. Cuts off any line in progress so a tap never waits. */
  onAnswer(answer: TriageAnswer) {
    const asked = this.question;
    if (!asked || asked === "landmark") return Promise.resolve();
    this.clearSilenceTimer();
    this.io?.interrupt();
    return this.run(async () => {
      if (this.question !== asked) return;
      if (asked === "location") await this.acceptLocation(answer);
      else if (asked === "recheck") await this.acceptRecheck(answer);
      else await this.acceptAnswer(asked as TriageQuestion, answer, "button");
    });
  }

  /** Dispatch or location changed elsewhere. Updates the screen, then queues anything worth saying. */
  onCaseChanged(updated: Case) {
    this.publish();
    const { status, etaMinutes } = updated.dispatch;
    const statusChanged = status !== this.lastDispatchStatus;
    this.lastDispatchStatus = status;

    let line: { text: string; cacheable: boolean } | null = null;
    if (statusChanged && status === "unacknowledged") line = { text: NO_ACK[this.lang], cacheable: true };
    else if (statusChanged && status === "accepted") line = { text: dispatched(this.lang, etaMinutes ?? 0), cacheable: false };
    else if (statusChanged && status === "arrived") return this.handleArrival();
    else if (etaMinutes !== undefined && etaMinutes < this.lastSpokenEta) {
      if (etaMinutes <= ALMOST_THERE_AT && this.lastSpokenEta > ALMOST_THERE_AT) line = { text: ALMOST_THERE[this.lang], cacheable: true };
      else if (etaMinutes <= ETA_SPOKEN_AT && this.lastSpokenEta > ETA_SPOKEN_AT) line = { text: etaUpdate(this.lang, etaMinutes), cacheable: false };
    }
    if (line) this.lastSpokenEta = etaMinutes ?? this.lastSpokenEta;
    if (!line) return Promise.resolve();

    this.heldUpdates.push(line);
    return this.run(() => this.sayHeldUpdates());
  }

  stop() {
    this.stopped = true;
    this.clearSilenceTimer();
    this.clearWaitingTimers();
  }

  private run(step: () => Promise<void>) {
    this.queue = this.queue.then(async () => {
      if (!this.stopped) await step();
    }).catch(() => undefined);
    return this.queue;
  }

  private async speak(text: string, options: { cacheable?: boolean; interruptible?: boolean } = {}) {
    if (this.stopped || !this.io) return;
    await this.io.say(text, { lang: this.lang, cacheable: options.cacheable ?? true, interruptible: options.interruptible ?? true });
  }

  /**
   * Priority rule: protocol steps, then status, then re-checks. So a status line waits for
   * triage and read-back but not for a routine re-check, and it stays queued while disconnected.
   */
  private async sayHeldUpdates() {
    const blocked = () => !this.io || this.stage !== "waiting" || (this.question !== null && this.question !== "recheck");
    while (this.heldUpdates.length && !blocked()) {
      const { text, cacheable } = this.heldUpdates.shift()!;
      await this.speak(text, { cacheable });
    }
  }

  private known(question: TriageQuestion) {
    const field = question === "responsive" ? "responsive" : "breathingNormally";
    return this.ruleFacts[field] ?? this.llmFacts[field] ?? null;
  }

  private isKnown(question: TriageQuestion) {
    return this.known(question) !== null;
  }

  private async askNext() {
    const next = (["responsive", "breathing"] as const).find((item) => !this.isKnown(item) && !this.skipped.has(item));
    if (next) await this.ask(next);
    else await this.decide();
  }

  private lineFor(question: SosQuestion): { text: string; cacheable: boolean } {
    switch (question) {
      case "responsive":
        return { text: ASK_RESPONSIVE[this.lang], cacheable: true };
      case "breathing":
        return { text: ASK_BREATHING[this.lang], cacheable: true };
      case "recheck":
        return { text: this.known("breathing") === false ? RECHECK_STARTED[this.lang] : RECHECK_STILL[this.lang], cacheable: true };
      case "landmark":
        return { text: ASK_LANDMARK[this.lang], cacheable: true };
      case "location": {
        const area = this.deps.cases.get(this.caseId)?.location?.addressText ?? "";
        return { text: locationConfirm(this.lang, area), cacheable: false };
      }
    }
  }

  private async ask(question: SosQuestion, line = this.lineFor(question)) {
    if (question === "responsive" || question === "breathing") this.stage = "triage";
    this.question = question;
    this.publish();
    await this.speak(line.text, { cacheable: line.cacheable });
    if (this.question === question && this.io) this.armSilenceTimer(question);
  }

  private armSilenceTimer(question: SosQuestion) {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      void this.run(async () => {
        if (this.question === question && this.io) await this.retry(question, ARE_YOU_THERE[this.lang]);
      });
    }, SILENCE_PROMPT_MS);
  }

  private clearSilenceTimer() {
    clearTimeout(this.silenceTimer);
  }

  /** Never hang on an unclear reply: after two tries, carry on without the answer. */
  private async retry(question: SosQuestion, line: string) {
    this.attempts++;
    if (this.attempts >= MAX_ATTEMPTS) return this.giveUp(question);
    await this.speak(line);
    if (this.question === question) this.armSilenceTimer(question);
  }

  private async giveUp(question: SosQuestion) {
    if (question === "location") await this.acceptLocation("unsure");
    else if (question === "recheck") await this.acceptRecheck("unsure");
    else if (question === "landmark") {
      this.clearQuestion();
      await this.enterWaiting();
    } else await this.acceptAnswer(question, "unsure", "timeout");
  }

  private clearQuestion() {
    this.clearSilenceTimer();
    this.question = null;
    this.attempts = 0;
  }

  private async handleTriageReply(asked: SosQuestion, text: string, extraction: Promise<Extraction | null>) {
    const triageQuestion = asked as TriageQuestion;
    // A reply about the other question answers that one, and this one is then asked again.
    const topic = replyTopic(text);
    if (topic && topic !== triageQuestion) {
      const offTopic = parseAnswer(topic, text);
      if (offTopic && offTopic !== "unsure") {
        void extraction.then((result) => this.afterExtraction(result));
        await this.acceptAnswer(topic, offTopic, "voice");
        return;
      }
    }
    const answer = parseAnswer(triageQuestion, text);
    if (answer) {
      void extraction.then((result) => this.afterExtraction(result));
      await this.acceptAnswer(triageQuestion, answer, "voice");
      return;
    }
    this.clearSilenceTimer();
    this.mergeExtraction(await extraction);
    if (this.isKnown(triageQuestion)) {
      this.clearQuestion();
      await this.askNext();
    } else {
      await this.retry(triageQuestion, SAY_AGAIN[this.lang]);
    }
  }

  private async acceptAnswer(question: TriageQuestion, answer: TriageAnswer, source: string) {
    this.clearQuestion();
    if (answer === "unsure") {
      this.skipped.add(question);
    } else {
      // A direct answer outranks what the LLM inferred.
      const field = question === "responsive" ? "responsive" : "breathingNormally";
      this.ruleFacts = { ...this.ruleFacts, [field]: answer === "yes" };
    }
    this.deps.cases.addEvent(this.caseId, "triage_answer", { question, answer, source });
    this.saveFacts();
    await this.askNext();
  }

  private assess(): TriageResult {
    const byRules = triage(this.ruleFacts);
    const merged = triage({ ...this.llmFacts, ...this.ruleFacts });
    const raised = triage({ ...this.ruleFacts, emergencyType: this.llmFacts.emergencyType ?? this.ruleFacts.emergencyType });
    return [merged, raised].reduce((best, item) => (RANK[item.severity] > RANK[best.severity] ? item : best), byRules);
  }

  private async decide() {
    const first = this.current === null;
    await this.deliver(this.assess());
    if (first && this.stage !== "arrived") await this.confirmLocation();
  }

  private async deliver(result: TriageResult) {
    const { cases, protocols } = this.deps;
    const severity = higherSeverity(this.current?.severity ?? null, result.severity);
    const protocol = protocols.get(result.protocolId)!;
    const first = this.current === null;
    this.current = { severity, protocolId: result.protocolId };
    this.stage = "protocol";
    this.question = null;
    this.rhythm = false;
    this.steps = { protocol, next: 0, first };
    this.saveFacts();
    cases.setAssessment(this.caseId, severity, protocol.id);
    this.publish();
    await this.finishSteps();
  }

  /** Carries on from the next unheard step, so a dropped connection never loses an instruction. */
  private async finishSteps() {
    const progress = this.steps;
    if (!progress) return;
    const { cases } = this.deps;
    const { protocol } = progress;
    const stillCurrent = () => this.steps === progress && this.io !== null;

    while (stillCurrent() && progress.next < protocol.steps.length) {
      const step = protocol.steps[progress.next]!;
      if (progress.next === 0 && progress.first) cases.recordFirstInstruction(this.caseId);
      cases.addEvent(this.caseId, "instruction_spoken", { protocolId: protocol.id, stepId: step.id });
      if (step.startsRhythm && !this.rhythm) {
        this.rhythm = true;
        this.publish();
      }
      await this.speak(step.text[this.lang], { interruptible: step.interruptible });
      if (!stillCurrent()) return; // cut off, so this step is said again on return
      progress.next++;
      // A moment to act before the next step.
      if (progress.next < protocol.steps.length) await this.io?.pause?.(step.pauseAfterMs);
    }
    if (!stillCurrent()) return;
    if (this.current?.severity === "RED" && protocol.callEmergencyLine && !this.lastSpokenRed) {
      await this.speak(CALL_112[this.lang]);
      if (!stillCurrent()) return;
      this.lastSpokenRed = true;
    }
    this.steps = null;
  }

  /** Location read-back. Poor GPS or a weak address always goes to a spoken landmark instead. */
  private async confirmLocation() {
    const { cases, addressFor } = this.deps;
    const address = await addressFor(this.caseId);
    const location = cases.get(this.caseId)?.location;
    if (this.stopped) return;

    if (!location || !address) {
      await this.ask("landmark", { text: ASK_ADDRESS[this.lang], cacheable: true });
      return;
    }
    if (address.weak || (location.accuracyM ?? 0) > POOR_ACCURACY_M) {
      await this.ask("landmark", { text: locationNear(this.lang, address.text), cacheable: false });
      return;
    }
    cases.setLocationConfirming(this.caseId);
    await this.ask("location");
  }

  /**
   * Summary 7.5. Dispatch and the conversation both carry on: someone can be wrong about a
   * patient, or be pressed to say it is fine, so only the caller's own tap ends an SOS.
   */
  private async offerFalseAlarm(asked: SosQuestion | null) {
    this.falseAlarmOffered = true;
    this.clearSilenceTimer();
    this.deps.cases.addEvent(this.caseId, "false_alarm_reported", {});
    this.publish();
    await this.speak(FALSE_ALARM_OFFER[this.lang]);
    if (asked) await this.ask(asked);
  }

  private async handlePlaceReply(asked: SosQuestion, text: string, extraction: Promise<Extraction | null>) {
    if (asked === "location") {
      const answer = parseLocationAnswer(text);
      if (answer) return this.acceptLocation(answer);
    }
    this.clearSilenceTimer();
    const result = await extraction;
    this.mergeExtraction(result);
    this.clearQuestion();
    const { landmark, floor, text: place } = result?.location ?? { landmark: null, floor: null, text: null };
    this.deps.cases.updateSpokenLocation(this.caseId, {
      spokenText: place ?? text,
      landmark: landmark ?? undefined,
      floor: floor ?? undefined,
    });
    await this.speak(LOCATION_UPDATED[this.lang]);
    await this.enterWaiting();
  }

  private async acceptLocation(answer: TriageAnswer) {
    this.clearQuestion();
    if (answer === "yes") {
      this.deps.cases.confirmLocation(this.caseId);
      await this.enterWaiting();
    } else {
      await this.ask("landmark");
    }
  }

  private async enterWaiting() {
    this.stage = "waiting";
    this.question = null;
    this.publish();
    if (!this.preAckSpoken && this.lastDispatchStatus === "requested") {
      this.preAckSpoken = true;
      await this.speak(PRE_ACK[this.lang]);
    }
    await this.sayHeldUpdates();
    this.armRecheck();
  }

  private armRecheck() {
    this.clearWaitingTimers();
    const idle = () => this.stage === "waiting" && !this.question && this.io !== null;
    this.waitingStepTimer = setTimeout(() => {
      void this.run(async () => {
        if (idle()) await this.sayWaitingStep();
      });
    }, WAITING_STEP_MS);
    this.recheckTimer = setTimeout(() => {
      void this.run(async () => {
        if (idle()) await this.ask("recheck");
      });
    }, RECHECK_MS);
  }

  private clearWaitingTimers() {
    clearTimeout(this.recheckTimer);
    clearTimeout(this.waitingStepTimer);
  }

  /** One useful thing to do between re-checks, from the fixed list for this protocol. */
  private async sayWaitingStep() {
    const steps = this.current ? this.deps.protocols.get(this.current.protocolId)?.waiting ?? [] : [];
    const step = steps.find((item) => !this.saidWaiting.has(item.id)) ?? steps.find((item) => item.repeat);
    if (!step) return;
    this.saidWaiting.add(step.id);
    await this.speak(step.text[this.lang]);
  }

  private async handleRecheckReply(text: string, extraction: Promise<Extraction | null>) {
    void extraction.then((result) => this.afterExtraction(result));
    const answer = parseAnswer("breathing", text);
    if (answer) await this.acceptRecheck(answer);
    else await this.retry("recheck", SAY_AGAIN[this.lang]);
  }

  private async acceptRecheck(answer: TriageAnswer) {
    this.clearQuestion();
    this.deps.cases.addEvent(this.caseId, "recheck", { answer });
    if (answer !== "unsure") {
      this.ruleFacts = { ...this.ruleFacts, breathingNormally: answer === "yes" };
      this.saveFacts();
      await this.reassess();
    }
    if (this.stage === "protocol") this.stage = "waiting";
    this.publish();
    await this.sayHeldUpdates();
    this.armRecheck();
  }

  private handleArrival() {
    this.heldUpdates = [];
    this.clearQuestion();
    this.clearWaitingTimers();
    this.steps = null;
    this.rhythm = false;
    this.stage = "arrived";
    this.publish();
    this.io?.interrupt();
    return this.run(() => this.speak(ARRIVED[this.lang]));
  }

  private protocolShouldChange() {
    if (!this.current) return false;
    const next = this.assess();
    return RANK[next.severity] >= RANK[this.current.severity] && next.protocolId !== this.current.protocolId;
  }

  /** A new fact can move the case to a different protocol. Severity still never drops. */
  private async reassess() {
    if (!this.protocolShouldChange()) return;
    const inWaiting = this.stage === "waiting";
    await this.deliver(this.assess());
    if (inWaiting) this.stage = "waiting";
  }

  private afterExtraction(result: Extraction | null) {
    this.mergeExtraction(result);
    this.saveFacts();
    return this.run(() => this.reassess());
  }

  private mergeExtraction(result: Extraction | null) {
    if (!result) return;
    const emergencyType = result.emergencyType === "unknown" || result.emergencyType === "other" ? null : result.emergencyType;
    this.llmFacts = {
      ...this.llmFacts,
      ...definedOnly({
        responsive: result.responsive,
        breathingNormally: result.breathingNormally,
        emergencyType,
      }),
      symptoms: result.symptoms,
    };
    const details = { age: result.age, sex: result.sex, onset: result.onsetText };
    const known = Object.entries(details).filter((entry): entry is [string, string] => Boolean(entry[1]));
    this.details = { ...this.details, ...Object.fromEntries(known) };
  }

  private saveFacts() {
    const facts = { ...this.llmFacts, ...this.ruleFacts };
    this.deps.cases.updateTriage(this.caseId, {
      responsive: facts.responsive ?? undefined,
      breathingNormally: facts.breathingNormally ?? undefined,
      emergencyType: facts.emergencyType ?? undefined,
      extra: this.details,
    });
  }

  private publish() {
    const protocol = this.current ? this.deps.protocols.get(this.current.protocolId) : undefined;
    const item = this.deps.cases.get(this.caseId);
    this.io?.publish({
      stage: this.stage,
      question: this.question,
      severity: this.current?.severity ?? null,
      protocolTitle: protocol?.title[this.lang] ?? null,
      placeholder: protocol?.status === "placeholder",
      sourced: protocol?.status === "sourced",
      rhythm: this.rhythm,
      falseAlarm: this.falseAlarmOffered && this.current?.severity !== "RED" && this.stage !== "arrived",
      dispatchStatus: item?.dispatch.status ?? "requested",
      etaMinutes: item?.dispatch.etaMinutes ?? null,
      ambulanceId: item?.dispatch.ambulanceId ?? null,
      locationStatus: item?.location?.status ?? null,
    });
  }
}
