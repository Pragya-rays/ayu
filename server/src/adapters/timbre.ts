import WebSocket from "ws";
import { toSpokenHinglish } from "../dialogue/hinglishSpeech.js";
import type { Lang } from "../types/voice.js";
import type { TTSAdapter, TtsEvents, TtsHandle } from "./types.js";

// Protocol source: docs.gnani.ai/api/TTS/tts-websocket (read 2026-10-31).
export interface TimbreOptions {
  url: string;
  apiKey: string;
  model: string;
  speed: number;
  sampleRate: number;
  voices: Record<Lang, string>;
  stallMs?: number;
}

const LANGUAGE: Record<Lang, string> = { hi: "hi-IN", hinglish: "hi-en", en: "en-IN" };
// The SOS conversation waits for each line to end, so a silent Timbre must never hold it up for good.
const STALL_MS = 8000;

export class TimbreAdapter implements TTSAdapter {
  readonly sampleRate: number;

  constructor(private readonly options: TimbreOptions) {
    this.sampleRate = options.sampleRate;
  }

  buildRequest(text: string, lang: Lang, spoken?: string) {
    // Gemini's spelling is often only part Devanagari, so the word list still runs over it.
    const line = spoken ?? text;
    return {
      text: lang === "hinglish" ? toSpokenHinglish(line) : line,
      model: this.options.model,
      voice: this.options.voices[lang],
      language: LANGUAGE[lang],
      speed: this.options.speed,
      audio_config: {
        sample_rate: this.options.sampleRate,
        num_channels: 1,
        sample_width: 2,
        encoding: "linear_pcm",
        container: "raw",
      },
    };
  }

  synthesize({ text, lang, spoken }: { text: string; lang: Lang; spoken?: string }, events: TtsEvents): TtsHandle {
    const socket = new WebSocket(this.options.url, { headers: { "X-API-Key-ID": this.options.apiKey } });
    let finished = false;
    let stallTimer: NodeJS.Timeout | undefined;

    const finish = () => {
      finished = true;
      clearTimeout(stallTimer);
      socket.close();
    };
    const fail = (code: string, message: string) => {
      if (finished) return;
      finish();
      events.onError({ code, message });
    };
    const watchForStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        fail("timbre_timeout", "Timbre stopped responding");
        socket.terminate();
      }, this.options.stallMs ?? STALL_MS);
    };
    watchForStall();

    socket.on("open", () => socket.send(JSON.stringify(this.buildRequest(text, lang, spoken))));

    socket.on("message", (raw) => {
      if (finished) return;
      watchForStall();
      let message: Record<string, any>;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === "audio" && message.data?.audio) {
        events.onAudio(message.data.audio);
      } else if (message.type === "complete") {
        finish();
        events.onEnd();
      } else if (message.type === "error") {
        fail("timbre_error", String(message.message ?? "Timbre error"));
      }
    });

    socket.on("unexpected-response", (_request, response) => {
      fail(`timbre_http_${response.statusCode}`, "Timbre rejected the connection");
      socket.terminate();
    });
    socket.on("error", (error) => fail("timbre_socket", error.message));
    socket.on("close", () => fail("timbre_closed", "Timbre closed before the audio finished"));

    return {
      // Timbre documents no cancel message, so closing the per-request socket is the interrupt.
      cancel() {
        if (finished) return;
        finished = true;
        clearTimeout(stallTimer);
        if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
        else socket.close();
      },
    };
  }
}
