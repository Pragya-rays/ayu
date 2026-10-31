// Shared contract between the PWA and the voice gateway. Change only after telling the other person.
export type Lang = "hi" | "hinglish" | "en";

export type ClientMessage =
  | { type: "start"; lang: Lang; echo?: boolean }
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
  | { type: "error"; code: string; message: string; fatal: boolean };
