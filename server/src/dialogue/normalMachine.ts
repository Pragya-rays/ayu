import type { NormalClassifier } from "../adapters/llm.js";
import type { HomeCareCard } from "../homecare/index.js";
import type { NormalState, NormalSummary } from "../types/normal.js";
import type { Lang } from "../types/voice.js";
import {
  ISSUE_QUESTIONS, NORMAL_ACKS, NORMAL_CLOSING, NORMAL_GREETING, NORMAL_NO_MATCH, NORMAL_PROMPT, NORMAL_SAY_YES_NO,
  NORMAL_SEE_DOCTOR_NOW, NORMAL_SERIOUS, QUESTIONS, type IssueId, type QuestionId,
} from "./normalContent.js";
import { findIssue, findRedFlags } from "./normalRules.js";
import { parseLocationAnswer } from "./ruleExtract.js";

const SILENCE_PROMPT_MS = 10000;
const MAX_QUESTIONS = 6;
const MAX_ATTEMPTS = 2;
const CONTEXT_LINES = 10;

export interface NormalIo {
  say(text: string, options: { lang: Lang; cacheable: boolean; interruptible: boolean; spoken?: string }): Promise<void>;
  publish(state: NormalState): void;
}

export interface NormalDeps {
  classifier: NormalClassifier;
  cards: Map<IssueId, HomeCareCard>;
}

/**
 * Normal mode (Dev Guide 5.2). Warning-sign questions always come from the fixed list and advice
 * only from home-care cards. The LLM names a likely issue, spots warning signs, and may phrase
 * the everyday follow-ups, which pass `checkQuestion` first and fall back to the fixed list.
 */
export class NormalMachine {
  private stage: NormalState["stage"] = "greeting";
  private question: QuestionId | "open" | "followup" | null = null;
  private readonly conversation: string[] = [];
  private suggested: { text: string; spoken?: string } | null = null;
  private lastWasWarning = false;
  private acks = 0;
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
    this.conversation.push(`Person: ${text}`);
    const flags = findRedFlags(text);
    const classified = this.deps.classifier.classify(this.conversation.slice(-CONTEXT_LINES), this.lang).catch(() => null);

    return this.run(async () => {
      if (this.stage !== "collect" || !this.question) return;
      this.clearSilence();
      const asked = this.question;

      const fixedQuestion = asked === "open" || asked === "followup" ? null : QUESTIONS[asked];
      const reply = fixedQuestion ? parseLocationAnswer(text) : null;
      const details = fixedQuestion;
      const saidYesToFlag = details?.redFlag && reply === "yes";
      const unclearWarningReply = details?.redFlag && !reply;
      // A warning sign goes straight to the SOS prompt, and an unclear reply to "yes or no".
      if (!flags.length && !saidYesToFlag && !unclearWarningReply) {
        await this.speak(NORMAL_ACKS[this.acks++ % NORMAL_ACKS.length]![this.lang]);
      }
      // Keywords win over a parsed "no": "saans nahi aa rahi" is a warning sign, not a denial.
      flags.forEach((flag) => this.redFlags.add(flag));
      if (saidYesToFlag) this.redFlags.add(asked);

      const result = await classified;
      this.issue ??= result?.issueId ?? findIssue(text);
      result?.redFlags.forEach((flag) => this.redFlags.add(flag));
      this.suggested = result?.question ? { text: result.question, spoken: result.spoken ?? undefined } : null;

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

  private async speak(text: string, cacheable = true, spoken?: string) {
    if (!this.stopped) await this.io.say(text, { lang: this.lang, cacheable, interruptible: true, spoken });
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
          if (waitingOn && waitingOn !== "open" && waitingOn !== "followup" && QUESTIONS[waitingOn].redFlag) this.unansweredRedFlag = true;
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

    // After a warning-sign question, a fitted follow-up keeps it sounding like a conversation.
    // Every remaining warning-sign question keeps its place within the limit.
    if (this.lastWasWarning && this.hasRoomForExtra()) {
      const extra = this.takeSuggestion();
      if (extra) return this.askGenerated(extra);
    }

    let next = this.plan.shift();
    while (next && !QUESTIONS[next].redFlag && !this.hasRoomForExtra()) next = this.plan.shift();
    if (!next || this.asked >= MAX_QUESTIONS) return this.finish();

    // Warning-sign questions are never reworded. An everyday one may use the checked suggestion.
    const generated = QUESTIONS[next].redFlag ? null : this.takeSuggestion();
    if (generated) return this.askGenerated(generated);
    this.question = next;
    await this.ask(QUESTIONS[next].text[this.lang], true);
    this.lastWasWarning = QUESTIONS[next].redFlag;
  }

  private hasRoomForExtra() {
    const warningsLeft = this.plan.filter((id) => QUESTIONS[id].redFlag).length;
    return this.asked + warningsLeft < MAX_QUESTIONS;
  }

  private async askGenerated(generated: { text: string; spoken?: string }) {
    this.question = "followup";
    this.lastWasWarning = false;
    await this.ask(generated.text, false, generated.spoken);
  }

  private async ask(line: string, cacheable: boolean, spoken?: string) {
    const asking = this.question;
    this.asked++;
    this.attempts = 0;
    this.publish();
    this.conversation.push(`Ayu: ${line}`);
    await this.speak(line, cacheable, spoken);
    if (this.question === asking) this.armSilence();
  }

  /** Skips a suggestion that merely repeats something already asked. */
  private takeSuggestion() {
    const suggestion = this.suggested;
    this.suggested = null;
    return suggestion && !this.conversation.includes(`Ayu: ${suggestion.text}`) ? suggestion : null;
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
    const question = this.question && this.question !== "open" && this.question !== "followup" ? QUESTIONS[this.question] : null;
    this.io.publish({
      stage: this.stage,
      expectsYesNo: Boolean(question?.yesNo),
      offerSos: this.stage === "offer_sos",
      summary: this.summary,
    });
  }
}
