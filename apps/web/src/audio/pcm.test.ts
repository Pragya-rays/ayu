import { describe, expect, it } from "vitest";
import { BargeGate, Downsampler, floatToInt16, FrameBuffer, PcmDecoder } from "./pcm";

describe("Downsampler", () => {
  it("produces the right sample count across chunk boundaries", () => {
    const downsampler = new Downsampler(48000, 16000);
    let total = 0;
    for (let i = 0; i < 100; i++) total += downsampler.process(new Float32Array(128).fill(0.5)).length;
    expect(total).toBe(Math.floor((100 * 128) / 3));
  });

  it("handles non-integer ratios", () => {
    const output = new Downsampler(44100, 16000).process(new Float32Array(44100));
    expect(Math.abs(output.length - 16000)).toBeLessThanOrEqual(1);
  });

  it("averages samples", () => {
    expect([...new Downsampler(48000, 16000).process(Float32Array.from([0, 0.3, 0.6]))][0]).toBeCloseTo(0.3);
  });
});

describe("floatToInt16", () => {
  it("clamps out-of-range samples", () => {
    expect([...floatToInt16(Float32Array.from([-2, 0, 2]))]).toEqual([-32768, 0, 32767]);
  });
});

describe("FrameBuffer", () => {
  it("emits exact frames and keeps the remainder", () => {
    const frames: Int16Array[] = [];
    const buffer = new FrameBuffer(512, (frame) => frames.push(frame));
    buffer.push(new Int16Array(300));
    expect(frames).toHaveLength(0);
    buffer.push(new Int16Array(1000));
    expect(frames).toHaveLength(2);
    expect(frames[0]).toHaveLength(512);
  });
});

describe("BargeGate", () => {
  const loud = () => new Int16Array(512).fill(8000);
  const quiet = () => new Int16Array(512).fill(200);

  it("triggers only on sustained loud frames and returns them", () => {
    const gate = new BargeGate(0.06, 3);
    expect(gate.push(loud())).toBeNull();
    expect(gate.push(loud())).toBeNull();
    expect(gate.push(loud())).toHaveLength(3);
  });

  it("ignores quiet echo and short bursts", () => {
    const gate = new BargeGate(0.06, 3);
    expect(gate.push(quiet())).toBeNull();
    gate.push(loud());
    gate.push(loud());
    gate.push(quiet());
    expect(gate.push(loud())).toBeNull();
  });
});

describe("PcmDecoder", () => {
  it("rebuilds a sample split across two chunks", () => {
    const decoder = new PcmDecoder();
    const first = decoder.decode(btoa(String.fromCharCode(0x00, 0x40, 0x00)));
    const second = decoder.decode(btoa(String.fromCharCode(0xc0)));
    expect([...first]).toEqual([0.5]);
    expect([...second]).toEqual([-0.5]);
  });
});
