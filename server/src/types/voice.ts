// Shared contract between the PWA and the voice gateway. Change only after telling the other person.
import type { Severity } from "./case.js";
import type { TriageAnswer, TriageQuestion } from "./triage.js";

export type Lang = "hi" | "hinglish" | "en";

export interface SosState {
  stage: "opening" | "triage" | "protocol";
  question: TriageQuestion | null;
  severity: Severity | null;
  protocolTitle: string | null;
  /** True until a protocol's wording has passed medical review. */
  placeholder: boolean;
}

export type ClientMessage =
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
  | { type: "tts.start"; ttsId: number; sampleRate: number; text: string }
  | { type: "tts.audio"; ttsId: number; data: string }
  | { type: "tts.end"; ttsId: number; firstAudioMs: number | null }
  | { type: "tts.stop" }
  | ({ type: "sos.state" } & SosState)
  | { type: "error"; code: string; message: string; fatal: boolean };
