import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Lang } from "../types/voice.js";
import type { TTSAdapter, TtsEvents, TtsHandle } from "./types.js";

const CHUNK_BYTES = 9600; // 200 ms at 24 kHz, 16-bit

export const AUDIO_DIR = resolve(import.meta.dirname, "../../src/audio");
export const audioFileName = (lang: Lang, text: string) =>
  `${createHash("sha1").update(`${lang}:${text}`).digest("hex").slice(0, 16)}.pcm`;

export interface AudioVoice {
  model: string;
  speed: number;
  sampleRate: number;
  voices: Record<Lang, string>;
}

/** Keeps fixed lines ready so they start instantly and spend no credits after generation. */
export class CachedTts implements TTSAdapter {
  private readonly cache = new Map<string, string[]>();

  constructor(private readonly inner: TTSAdapter) {}

  get sampleRate() {
    return this.inner.sampleRate;
  }

  synthesize(request: { text: string; lang: Lang; cacheable?: boolean }, events: TtsEvents): TtsHandle {
    if (!request.cacheable) return this.inner.synthesize(request, events);

    const key = audioFileName(request.lang, request.text);
    const cached = this.cache.get(key);
    if (cached) return this.replay(cached, events);

    const chunks: string[] = [];
    return this.inner.synthesize(request, {
      onAudio(data) {
        chunks.push(data);
        events.onAudio(data);
      },
      onEnd: () => {
        this.cache.set(key, chunks);
        events.onEnd();
      },
      onError: events.onError,
    });
  }

  /**
   * Loads audio made by `npm run gen:audio`, but only if it matches the configured voice.
   * A line with no file simply falls back to live Timbre.
   */
  loadPregenerated(voice: AudioVoice, dir = AUDIO_DIR) {
    const manifestPath = resolve(dir, "manifest.json");
    if (!existsSync(manifestPath)) return 0;
    if (readFileSync(manifestPath, "utf8").trim() !== JSON.stringify(voice)) return 0;
    const files = readdirSync(dir).filter((file) => file.endsWith(".pcm"));
    for (const file of files) {
      const pcm = readFileSync(resolve(dir, file));
      const chunks: string[] = [];
      for (let offset = 0; offset < pcm.length; offset += CHUNK_BYTES) {
        chunks.push(pcm.subarray(offset, offset + CHUNK_BYTES).toString("base64"));
      }
      this.cache.set(file, chunks);
    }
    return files.length;
  }

  /** Generates lines one at a time, because some accounts allow a single active request. */
  async warm(lines: { text: string; lang: Lang }[]) {
    for (const line of lines) {
      await new Promise<void>((resolve) => {
        this.synthesize({ ...line, cacheable: true }, {
          onAudio() {},
          onEnd: resolve,
          onError: () => resolve(),
        });
      });
    }
  }

  private replay(chunks: string[], events: TtsEvents): TtsHandle {
    let cancelled = false;
    setImmediate(() => {
      for (const chunk of chunks) {
        if (cancelled) return;
        events.onAudio(chunk);
      }
      if (!cancelled) events.onEnd();
    });
    return {
      cancel() {
        cancelled = true;
      },
    };
  }
}
