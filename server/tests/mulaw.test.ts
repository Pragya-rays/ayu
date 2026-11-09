import { describe, expect, it } from "vitest";
import { decode, encode, encodeSample } from "../src/codec/mulaw.js";

describe("µ-law", () => {
  it("matches the G.711 reference values", () => {
    expect(encodeSample(0)).toBe(0xff);
    expect(encodeSample(-1)).toBe(0x7f);
    expect(encodeSample(32767)).toBe(0x80);
    expect(encodeSample(-32768)).toBe(0x00);
  });

  it("halves the size and keeps speech within a few percent", () => {
    const samples = Int16Array.from({ length: 16000 }, (_, i) => Math.round(Math.sin(i / 7) * 12000 + Math.sin(i / 2.3) * 3000));
    const bytes = encode(samples);
    expect(bytes.byteLength).toBe(samples.byteLength / 2);
    const back = decode(bytes);
    let signal = 0;
    let noise = 0;
    for (let i = 0; i < samples.length; i++) {
      signal += samples[i]! ** 2;
      noise += (samples[i]! - back[i]!) ** 2;
    }
    const snrDb = 10 * Math.log10(signal / noise);
    expect(snrDb).toBeGreaterThan(30); // telephone-grade µ-law gives roughly 35-38 dB on speech-level signals
  });

  it("round-trips every byte value exactly", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const again = encode(decode(all));
    // 0x7f and 0xff both mean zero; every other code maps back to itself
    for (let i = 0; i < 256; i++) if (i !== 0x7f) expect(again[i]).toBe(i);
  });
});
