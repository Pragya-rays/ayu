import WebSocket from "ws";
import type { Lang } from "../types/voice.js";
import { PcmFramer } from "./pcmFramer.js";
import type { STTAdapter, SttEvents, SttSession } from "./types.js";

// Protocol source: docs.gnani.ai/api/STT/stt-websocket (read 2026-10-31).
const FRAME_BYTES = 1024;
const SAMPLE_RATE = 16000;
const MAX_QUEUED_FRAMES = 150; // about 5 s of audio while the socket opens
const IDLE_TIMEOUT_SEC = 120;

export interface PrismaOptions {
  url: string;
  apiKey: string;
  model: string;
  format: string;
  keyterms: string[];
  minSilenceMs: number;
}

// Live API (2026-10-31) rejects a language list on streaming despite the docs, so send one locale.
// Code-mixed speech is handled by format=codemix.
export function languageCodeFor(lang: Lang): string {
  return lang === "en" ? "en-IN" : "hi-IN";
}

export function buildHeaders(options: PrismaOptions, lang: Lang): Record<string, string> {
  const languageCode = languageCodeFor(lang);
  const headers: Record<string, string> = {
    "x-api-key-id": options.apiKey,
    "x-sample-rate": String(SAMPLE_RATE),
    "x-min-silence-ms": String(options.minSilenceMs),
    "x-idle-timeout-sec": String(IDLE_TIMEOUT_SEC),
    // TODO(verify): the reference page says language_code/model/format, the v3.0 changelog says
    // lang_code/x-model/x-format. Sending both is documented as safe, so remove one after the smoke test.
    language_code: languageCode,
    lang_code: languageCode,
    model: options.model,
    "x-model": options.model,
    format: options.format,
    "x-format": options.format,
  };
  if (options.model === "prisma-v3.0" && options.keyterms.length) {
    headers.keyterms = options.keyterms.join(",");
    headers["x-keyterms"] = headers.keyterms;
  }
  return headers;
}

export class PrismaAdapter implements STTAdapter {
  constructor(private readonly options: PrismaOptions) {}

  open({ lang }: { lang: Lang }, events: SttEvents): SttSession {
    const socket = new WebSocket(this.options.url, { headers: buildHeaders(this.options, lang) });
    const framer = new PcmFramer(FRAME_BYTES);
    const queue: Buffer[] = [];
    let closedByUs = false;

    const flush = () => {
      while (queue.length) socket.send(queue.shift()!, { binary: true });
    };

    socket.on("open", flush);

    socket.on("message", (raw) => {
      let message: Record<string, any>;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (message.type) {
        case "connected":
          events.onReady(message.config);
          break;
        case "speech_start":
          events.onSpeechStart();
          break;
        case "processing":
          events.onProcessing();
          break;
        case "transcript":
          events.onTranscript({
            text: String(message.text ?? ""),
            latencyMs: typeof message.latency === "number" ? message.latency : undefined,
            detectedLang: message.detected_language_code,
          });
          break;
        case "error":
          // Single-utterance failures keep the session open; a real end arrives as a close.
          events.onError({ code: "prisma_error", message: String(message.message ?? "Prisma error"), fatal: false });
          break;
      }
    });

    socket.on("unexpected-response", (_request, response) => {
      events.onError({ code: `prisma_http_${response.statusCode}`, message: "Prisma rejected the connection", fatal: true });
      socket.terminate();
    });

    socket.on("error", (error) => {
      if (!closedByUs) events.onError({ code: "prisma_socket", message: error.message, fatal: true });
    });

    socket.on("close", (code, reason) => {
      // 1001 = 15-minute session cap, 1008 = bad handshake header.
      if (!closedByUs && (code === 1001 || code === 1008)) {
        events.onError({ code: `prisma_close_${code}`, message: reason.toString() || "Prisma closed the session", fatal: true });
      }
      events.onClose();
    });

    return {
      sendAudio(pcm) {
        for (const frame of framer.push(pcm)) {
          if (socket.readyState === WebSocket.OPEN) socket.send(frame, { binary: true });
          else if (socket.readyState === WebSocket.CONNECTING && queue.length < MAX_QUEUED_FRAMES) queue.push(frame);
        }
      },
      commit() {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "commit" }));
      },
      close() {
        closedByUs = true;
        socket.close();
      },
    };
  }
}
