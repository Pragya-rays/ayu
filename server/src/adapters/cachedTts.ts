import type { Lang } from "../types/voice.js";
import type { TTSAdapter, TtsEvents, TtsHandle } from "./types.js";

/** Keeps fixed lines in memory so they start instantly and spend credits only once per server start. */
export class CachedTts implements TTSAdapter {
  private readonly cache = new Map<string, string[]>();

  constructor(private readonly inner: TTSAdapter) {}

  get sampleRate() {
    return this.inner.sampleRate;
  }

  synthesize(request: { text: string; lang: Lang; cacheable?: boolean }, events: TtsEvents): TtsHandle {
    if (!request.cacheable) return this.inner.synthesize(request, events);

    const key = `${request.lang}:${request.text}`;
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
