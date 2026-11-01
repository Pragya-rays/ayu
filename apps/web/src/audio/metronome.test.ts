import { describe, expect, it } from "vitest";
import { beatSamples, BEATS_PER_MINUTE } from "./metronome";

describe("CPR metronome", () => {
  it("stays inside the 100 to 120 per minute target", () => {
    expect(BEATS_PER_MINUTE).toBeGreaterThanOrEqual(100);
    expect(BEATS_PER_MINUTE).toBeLessThanOrEqual(120);
  });

  it.each([44100, 48000])("keeps exact time at %i Hz", (rate) => {
    const perMinute = (rate * 60) / beatSamples(rate).length;
    expect(perMinute).toBeCloseTo(BEATS_PER_MINUTE, 1);
  });

  it("is a short click followed by silence, quieter than Ayu's voice", () => {
    const samples = beatSamples(48000);
    const lastSound = samples.findLastIndex((sample) => sample !== 0);
    expect(lastSound / 48000).toBeLessThan(0.04);
    expect(Math.max(...samples.subarray(0, 2000))).toBeLessThan(0.3);
  });
});
