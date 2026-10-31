import type { Lang } from "../types/voice.js";

export interface SttEvents {
  onReady(serverConfig?: Record<string, unknown>): void;
  onSpeechStart(): void;
  onProcessing(): void;
  onTranscript(result: { text: string; latencyMs?: number; detectedLang?: string }): void;
  onError(error: { code: string; message: string; fatal: boolean }): void;
  onClose(): void;
}

export interface SttSession {
  /** 16 kHz mono s16le PCM of any length; adapters re-frame it as their backend requires. */
  sendAudio(pcm: Buffer): void;
  /** End the current utterance now instead of waiting for silence. */
  commit(): void;
  close(): void;
}

export interface STTAdapter {
  open(options: { lang: Lang }, events: SttEvents): SttSession;
}

export interface TtsEvents {
  /** Base64 raw 16-bit mono PCM at `sampleRate`, delivered in order. */
  onAudio(base64Pcm: string): void;
  onEnd(): void;
  onError(error: { code: string; message: string }): void;
}

export interface TtsHandle {
  cancel(): void;
}

export interface TTSAdapter {
  readonly sampleRate: number;
  synthesize(request: { text: string; lang: Lang; cacheable?: boolean }, events: TtsEvents): TtsHandle;
}
