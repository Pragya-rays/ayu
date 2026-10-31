import type { LLMAdapter } from "../adapters/llm.js";
import type { CaseStore } from "../cases/store.js";
import type { Protocol } from "../protocols/index.js";
import type { Severity } from "../types/case.js";
import type { ProtocolId, TriageAnswer, TriageFacts, TriageQuestion } from "../types/triage.js";
import type { Lang, SosState } from "../types/voice.js";
import { ARE_YOU_THERE, ASK_BREATHING, ASK_RESPONSIVE, CALL_112, SAY_AGAIN, SOS_OPENING } from "./lines.js";
import { extractFacts, parseAnswer } from "./ruleExtract.js";
import { higherSeverity, triage, type TriageResult } from "./triageRules.js";

const SILENCE_PROMPT_MS = 8000;
const MAX_ATTEMPTS = 2;
const RANK: Record<Severity, number> = { GREEN: 0, AMBER: 1, RED: 2 };

export interface SosIo {
  /** Resolves when the line has finished playing, or was interrupted. */
  say(text: string, options: { lang: Lang; cacheable: boolean }): Promise<void>;
  interrupt(): void;
  publish(state: SosState): void;
}

const definedOnly = (facts: TriageFacts): TriageFacts =>
  Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== null && value !== undefined));

/**
 * Voice track of the SOS state machine (Dev Guide 5.1). Rules decide; the LLM only fills gaps
 * and can raise severity. All spoken text comes from fixed lines or protocol files.
 */
export class SosMachine {
  private stage: SosState["stage"] = "opening";
  private question: TriageQuestion | null = null;
  private attempts = 0;
  private stopped = false;
  private ruleFacts: TriageFacts = {};
  private llmFacts: TriageFacts = {};
  private readonly skipped = new Set<TriageQuestion>();
  private readonly heard: string[] = [];
  private silenceTimer: NodeJS.Timeout | undefined;
  private queue: Promise<void> = Promise.resolve();
  private current: TriageResult | null = null;

  constructor(
    private readonly caseId: string,
    private readonly lang: Lang,
    private readonly deps: { cases: CaseStore; llm: LLMAdapter; protocols: Map<ProtocolId, Protocol>; io: SosIo },
  ) {}

  /** `openingPlayed` means the phone already played the opening from its local copy. */
  begin(openingPlayed = false) {
    return this.run(async () => {
      if (openingPlayed) this.deps.cases.addEvent(this.caseId, "ayu_utterance", { text: SOS_OPENING[this.lang], local: true });
      else await this.speak(SOS_OPENING[this.lang]);
      await this.askNext();
    });
  }

  /** Spoken input. Rules run at once; the LLM runs alongside and can only fill gaps or raise. */
  onUtterance(text: string) {
    this.heard.push(text);
    const facts = definedOnly(extractFacts(text));
    this.ruleFacts = { ...this.ruleFacts, ...facts };
    const extraction = this.deps.llm.extract(this.heard.slice(-3)).catch(() => null);

    return this.run(async () => {
      if (this.stage === "triage" && this.question) {
        const asked = this.question;
        const answer = parseAnswer(asked, text);
        if (answer) {
          void extraction.then((result) => this.afterExtraction(result));
          await this.acceptAnswer(asked, answer, "voice");
          return;
        }
        this.clearSilenceTimer();
        this.mergeExtraction(await extraction);
        if (this.isKnown(asked)) {
          this.question = null;
          this.attempts = 0;
          await this.askNext();
        } else {
          await this.retry(asked, SAY_AGAIN[this.lang]);
        }
        return;
      }
      void extraction.then((result) => this.afterExtraction(result));
      if (this.stage === "protocol") await this.reassess();
    });
  }

  /** Yes / No / Not sure buttons. Cuts off any line in progress so a tap never waits. */
  onAnswer(answer: TriageAnswer) {
    const asked = this.question;
    if (!asked) return Promise.resolve();
    this.clearSilenceTimer();
    this.deps.io.interrupt();
    return this.run(async () => {
      if (this.question === asked) await this.acceptAnswer(asked, answer, "button");
    });
  }

  stop() {
    this.stopped = true;
    this.clearSilenceTimer();
  }

  private run(step: () => Promise<void>) {
    this.queue = this.queue.then(async () => {
      if (!this.stopped) await step();
    }).catch(() => undefined);
    return this.queue;
  }

  private async speak(text: string) {
    if (!this.stopped) await this.deps.io.say(text, { lang: this.lang, cacheable: true });
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

  private async ask(question: TriageQuestion) {
    this.stage = "triage";
    this.question = question;
    this.publish();
    await this.speak(question === "responsive" ? ASK_RESPONSIVE[this.lang] : ASK_BREATHING[this.lang]);
    if (this.question === question) this.armSilenceTimer(question);
  }

  private armSilenceTimer(question: TriageQuestion) {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      void this.run(async () => {
        if (this.question === question) await this.retry(question, ARE_YOU_THERE[this.lang]);
      });
    }, SILENCE_PROMPT_MS);
  }

  private clearSilenceTimer() {
    clearTimeout(this.silenceTimer);
  }

  /** Never hang on an unclear reply: after two tries, carry on and treat the answer as unknown. */
  private async retry(question: TriageQuestion, line: string) {
    this.attempts++;
    if (this.attempts >= MAX_ATTEMPTS) {
      await this.acceptAnswer(question, "unsure", "timeout");
      return;
    }
    await this.speak(line);
    if (this.question === question) this.armSilenceTimer(question);
  }

  private async acceptAnswer(question: TriageQuestion, answer: TriageAnswer, source: string) {
    this.clearSilenceTimer();
    this.question = null;
    this.attempts = 0;
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
    await this.deliver(this.assess());
  }

  private async deliver(result: TriageResult) {
    const { cases, protocols } = this.deps;
    const severity = higherSeverity(this.current?.severity ?? null, result.severity);
    const protocol = protocols.get(result.protocolId)!;
    const first = this.current === null;
    this.current = { severity, protocolId: result.protocolId };
    this.stage = "protocol";
    this.question = null;
    this.saveFacts();
    cases.setAssessment(this.caseId, severity, protocol.id);
    this.publish();

    for (const [index, step] of protocol.steps.entries()) {
      if (index === 0 && first) cases.recordFirstInstruction(this.caseId);
      cases.addEvent(this.caseId, "instruction_spoken", { protocolId: protocol.id, stepId: step.id });
      await this.speak(step.text[this.lang]);
    }
    if (severity === "RED" && protocol.callEmergencyLine) await this.speak(CALL_112[this.lang]);
  }

  /** A new fact can move the case to a different protocol. Severity still never drops. */
  private async reassess() {
    if (!this.current) return;
    const next = this.assess();
    const outranks = RANK[next.severity] >= RANK[this.current.severity];
    if (outranks && next.protocolId !== this.current.protocolId) await this.deliver(next);
  }

  private afterExtraction(result: Awaited<ReturnType<LLMAdapter["extract"]>>) {
    this.mergeExtraction(result);
    this.saveFacts();
    return this.run(() => this.reassess());
  }

  private mergeExtraction(result: Awaited<ReturnType<LLMAdapter["extract"]>>) {
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
  }

  private saveFacts() {
    const facts = { ...this.llmFacts, ...this.ruleFacts };
    this.deps.cases.updateTriage(this.caseId, {
      responsive: facts.responsive ?? undefined,
      breathingNormally: facts.breathingNormally ?? undefined,
      emergencyType: facts.emergencyType ?? undefined,
    });
  }

  private publish() {
    const protocol = this.current ? this.deps.protocols.get(this.current.protocolId) : undefined;
    this.deps.io.publish({
      stage: this.stage,
      question: this.question,
      severity: this.current?.severity ?? null,
      protocolTitle: protocol?.title[this.lang] ?? null,
      placeholder: protocol?.status === "placeholder",
    });
  }
}
