import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { audioFileName, CachedTts } from "../src/adapters/cachedTts.js";
import { trimSilence } from "../src/adapters/pcmTrim.js";

const RATE = 24000;

/** Silence, then a tone, then silence. */
function line(beforeMs: number, toneMs: number, afterMs: number) {
  const count = (ms: number) => Math.round((RATE * ms) / 1000);
  const samples = new Int16Array(count(beforeMs) + count(toneMs) + count(afterMs));
  for (let i = 0; i < count(toneMs); i++) samples[count(beforeMs) + i] = Math.sin(i / 5) * 12000;
  return Buffer.from(samples.buffer);
}
const ms = (pcm: Buffer) => (pcm.length / 2 / RATE) * 1000;

describe("trimSilence", () => {
  it("removes dead air and keeps a little either side", () => {
    expect(ms(trimSilence(line(150, 800, 300), RATE))).toBeCloseTo(800 + 30 + 60, -1);
  });

  it("never cuts into speech", () => {
    const trimmed = trimSilence(line(150, 800, 300), RATE);
    const samples = new Int16Array(trimmed.buffer.slice(trimmed.byteOffset, trimmed.byteOffset + trimmed.length));
    const loud = samples.filter((sample) => Math.abs(sample) > 1000).length;
    const original = new Int16Array(line(150, 800, 300).buffer).filter((sample) => Math.abs(sample) > 1000).length;
    expect(loud).toBeGreaterThanOrEqual(original);
  });

  it("keeps a quiet ending that follows loud speech", () => {
    const loud = line(0, 500, 0);
    const quietSamples = new Int16Array(RATE / 5).map((_, i) => Math.sin(i / 5) * 1500);
    const trimmed = trimSilence(Buffer.concat([loud, Buffer.from(quietSamples.buffer), line(300, 0, 0)]), RATE);
    expect(ms(trimmed)).toBeGreaterThan(690);
  });

  it("leaves pure silence alone instead of emptying it", () => {
    const silent = line(200, 0, 0);
    expect(trimSilence(silent, RATE)).toBe(silent);
  });

  it("does not throw on a line shorter than one window", () => {
    expect(() => trimSilence(Buffer.alloc(10), RATE)).not.toThrow();
  });
});

describe("stored audio", () => {
  it("plays trimmed, so the machine and the phone agree on how long a line lasts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ayu-audio-"));
    const voice = { model: "m", speed: 1, sampleRate: RATE, voices: { hi: "a", hinglish: "b", en: "c" } };
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(voice));
    writeFileSync(join(dir, audioFileName("en", "hello")), line(150, 800, 300));
    const inner = { sampleRate: RATE, synthesize: vi.fn() };
    const tts = new CachedTts(inner);
    expect(tts.loadPregenerated(voice, dir)).toBe(1);

    let bytes = 0;
    await new Promise<void>((done) => {
      tts.synthesize({ text: "hello", lang: "en", cacheable: true }, {
        onAudio: (data) => {
          bytes += Buffer.byteLength(data, "base64");
        },
        onEnd: done,
        onError: () => done(),
      });
    });
    expect((bytes / 2 / RATE) * 1000).toBeCloseTo(890, -1);
    expect(inner.synthesize).not.toHaveBeenCalled();
  });
});
