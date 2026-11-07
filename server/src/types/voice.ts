// Shared contract between the PWA and the voice gateway. Change only after telling the other person.
import type { Case, Severity } from "./case.js";
import type { NormalState } from "./normal.js";
import type { SosQuestion, TriageAnswer } from "./triage.js";

export type Lang = "hi" | "hinglish" | "en";

export interface SosState {
  stage: "opening" | "triage" | "protocol" | "waiting" | "arrived";
  question: SosQuestion | null;
  severity: Severity | null;
  protocolTitle: string | null;
  /** True until a protocol's wording has passed medical review. */
  placeholder: boolean;
  /** Taken from published guidance, and not reviewed by a doctor. */
  sourced: boolean;
  /** The phone plays the compression beat. It is local audio, so it survives a lost connection. */
  rhythm: boolean;
  /** The caller said this is not an emergency, so the phone offers to cancel and talk to Ayu. */
  falseAlarm: boolean;
  dispatchStatus: Case["dispatch"]["status"];
  etaMinutes: number | null;
  ambulanceId: string | null;
  locationStatus: NonNullable<Case["location"]>["status"] | null;
}

export type ClientMessage =
  | { type: "normal_text"; text: string }
  | { type: "normal_yes_no"; answer: "yes" | "no" }
  | { type: "normal_decline_sos" }
  | { type: "triage_answer"; answer: TriageAnswer }
  | { type: "start"; lang: Lang; echo?: boolean; openingPlayed?: boolean }
  | { type: "commit" }
  | { type: "say"; text: string; lang?: Lang }
  | { type: "stop_speaking" }
  | { type: "first_audio"; ms: number };

export type ServerMessage =
  | { type: "session.ready"; voiceMode: "real" | "mock" }
  | { type: "stt.ready" }
  | { type: "speech.start" }
  | { type: "transcript.processing" }
  | { type: "transcript.final"; text: string; latencyMs?: number; detectedLang?: string }
  | { type: "tts.start"; ttsId: number; sampleRate: number; text: string; interruptible: boolean }
  | { type: "tts.audio"; ttsId: number; data: string }
  | { type: "tts.end"; ttsId: number; firstAudioMs: number | null }
  | { type: "tts.stop" }
  | ({ type: "sos.state" } & SosState)
  | ({ type: "normal.state" } & NormalState)
  | { type: "error"; code: string; message: string; fatal: boolean };
