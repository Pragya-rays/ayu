import type { NormalClassifier } from "../adapters/llm.js";
import type { HomeCareCard } from "../homecare/index.js";
import type { NormalState, NormalSummary } from "../types/normal.js";
import type { Lang } from "../types/voice.js";
import {
  ISSUE_QUESTIONS, NORMAL_CLOSING, NORMAL_GREETING, NORMAL_NO_MATCH, NORMAL_PROMPT, NORMAL_SAY_YES_NO, NORMAL_SEE_DOCTOR_NOW,
  NORMAL_SERIOUS, QUESTIONS, type IssueId, type QuestionId,
} from "./normalContent.js";
import { findIssue, findRedFlags } from "./normalRules.js";
import { parseLocationAnswer } from "./ruleExtract.js";

const SILENCE_PROMPT_MS = 10000;
const MAX_QUESTIONS = 6;
const MAX_ATTEMPTS = 2;

export interface NormalIo {
  say(text: string, options: { lang: Lang; cacheable: boolean; interruptible: boolean }): Promise<void>;
  publish(state: NormalState): void;
}

export interface NormalDeps {
  classifier: NormalClassifier;
  cards: Map<IssueId, HomeCareCard>;
}

/**
 * Normal mode (Dev Guide 5.2). Every spoken line is fixed: questions come from a set list, and
 * advice comes only from home-care cards. The LLM names a likely issue and spots warning signs.
 */
export class NormalMachine {
  private stage: NormalState["stage"] = "greeting";
  private question: QuestionId | "open" | null = null;
  private plan: QuestionId[] = [];
  private asked = 0;
  private attempts = 0;
  private issue: IssueId | null = null;
  private readonly redFlags = new Set<string>();
  private unansweredRedFlag = false;
  private readonly said: string[] = [];
  private summary: NormalSummary | null = null;
  private stopped = false;
  private silenceTimer: NodeJS.Timeout | undefined;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly lang: Lang, private readonly deps: NormalDeps, private readonly io: NormalIo) {}

  begin() {
    return this.run(async () => {
      this.question = "open";
      this.stage = "collect";
      this.publish();
      await this.speak(NORMAL_GREETING[this.lang]);
      this.armSilence();
    });
  }

  /** Spoken or typed input. Warning signs are checked before anything else. */
  onInput(text: string) {
    this.said.push(text);
    const flags = findRedFlags(text);
    const classified = this.deps.classifier.classify(this.said.slice(-3)).catch(() => null);

    return this.run(async () => {
      if (this.stage !== "collect" || !this.question) return;
      this.clearSilence();
      const asked = this.question;

      const reply = asked === "open" ? null : parseLocationAnswer(text);
      const details = asked === "open" ? null : QUESTIONS[asked];
      const saidYesToFlag = details?.redFlag && reply === "yes";
      // Keywords win over a parsed "no": "saans nahi aa rahi" is a warning sign, not a denial.
      flags.forEach((flag) => this.redFlags.add(flag));
      if (saidYesToFlag) this.redFlags.add(asked);

      const result = await classified;
      this.issue ??= result?.issueId ?? findIssue(text);
      result?.redFlags.forEach((flag) => this.redFlags.add(flag));

      if (this.redFlags.size) return this.offerSos();

      if (details?.redFlag && reply !== "no" && reply !== "yes" && flags.length === 0) {
        this.attempts++;
        if (this.attempts < MAX_ATTEMPTS) {
          await this.speak(NORMAL_SAY_YES_NO[this.lang]);
          this.armSilence();
          return;
        }
        this.unansweredRedFlag = true; // an unclear reply is never read as a no
      }
      await this.nextQuestion(asked === "open");
    });
  }

  /** Yes / No buttons, for when speech is not working. */
  onYesNo(answer: "yes" | "no") {
    return this.onInput(answer === "yes" ? "haan" : "nahi");
  }

  /** The caller chose not to switch to SOS. Advice stays withheld: a warning sign was raised. */
  declineSos() {
    return this.run(async () => {
      if (this.stage === "offer_sos") await this.finish();
    });
  }

  stop() {
    this.stopped = true;
    this.clearSilence();
  }

  private run(step: () => Promise<void>) {
    this.queue = this.queue.then(async () => {
      if (!this.stopped) await step();
    }).catch(() => undefined);
    return this.queue;
  }

  private async speak(text: string) {
    if (!this.stopped) await this.io.say(text, { lang: this.lang, cacheable: true, interruptible: true });
  }

  private armSilence() {
    this.clearSilence();
    const waitingOn = this.question;
    this.silenceTimer = setTimeout(() => {
      void this.run(async () => {
        if (this.question !== waitingOn || this.stage !== "collect") return;
        this.attempts++;
        if (this.attempts >= MAX_ATTEMPTS) {
          // Silence on a warning-sign question must not end in reassurance.
          if (waitingOn !== "open" && waitingOn && QUESTIONS[waitingOn].redFlag) this.unansweredRedFlag = true;
          await this.finish();
          return;
        }
        await this.speak(NORMAL_PROMPT[this.lang]);
        this.armSilence();
      });
    }, SILENCE_PROMPT_MS);
  }

  private clearSilence() {
    clearTimeout(this.silenceTimer);
  }

  private async nextQuestion(firstReply: boolean) {
    if (firstReply) this.plan = [...ISSUE_QUESTIONS[this.issue ?? "unknown"]];
    const next = this.plan.shift();
    if (!next || this.asked >= MAX_QUESTIONS) return this.finish();
    this.asked++;
    this.attempts = 0;
    this.question = next;
    this.publish();
    await this.speak(QUESTIONS[next].text[this.lang]);
    if (this.question === next) this.armSilence();
  }

  private async offerSos() {
    this.stage = "offer_sos";
    this.question = null;
    this.publish();
    await this.speak(NORMAL_SERIOUS[this.lang]);
  }

  private async finish() {
    this.clearSilence();
    this.question = null;
    this.stage = "advice";
    const urgent = this.redFlags.size > 0 || this.unansweredRedFlag;
    const card = !urgent && this.issue ? this.deps.cards.get(this.issue) : undefined;
    this.publish();

    if (urgent) await this.speak(NORMAL_SEE_DOCTOR_NOW[this.lang]);
    else if (card) for (const step of card.steps) await this.speak(step[this.lang]);
    else await this.speak(NORMAL_NO_MATCH[this.lang]);

    this.summary = {
      said: this.said.filter((line) => parseLocationAnswer(line) === null), // bare yes/no replies mean nothing on a card
      title: card?.title[this.lang] ?? null,
      steps: card ? card.steps.map((step) => step[this.lang]) : [],
      seeDoctorIf: card ? card.seeDoctorIf.map((item) => item[this.lang]) : [],
      urgent,
      placeholder: card?.status === "placeholder",
    };
    this.stage = "summary";
    this.publish();
    await this.speak(NORMAL_CLOSING[this.lang]);
  }

  private publish() {
    const question = this.question && this.question !== "open" ? QUESTIONS[this.question] : null;
    this.io.publish({
      stage: this.stage,
      expectsYesNo: Boolean(question?.yesNo),
      offerSos: this.stage === "offer_sos",
      summary: this.summary,
    });
  }
}
