import { describe, expect, it } from "vitest";
import { TimbreAdapter } from "../src/adapters/timbre.js";
import { ENGLISH_WORDS, isConverted, toSpokenHinglish } from "../src/dialogue/hinglishSpeech.js";
import { dispatched, etaUpdate, FIXED_LINES, locationConfirm, locationNear } from "../src/dialogue/lines.js";
import { NORMAL_FIXED_LINES } from "../src/dialogue/normalContent.js";
import { loadHomeCare } from "../src/homecare/index.js";
import { loadProtocols } from "../src/protocols/index.js";

describe("Hinglish speech", () => {
  it("fixes the words the team reported", () => {
    expect(toSpokenHinglish("Aapko kya takleef hai? Kya seene mein dard hai?")).toBe("आपको क्या तकलीफ़ है? क्या सीने में दर्द है?");
  });

  it("keeps English words, numbers, punctuation and unknown names", () => {
    expect(toSpokenHinglish("Kripya doctor ko dikhayein, 112 par call karein.")).toBe("कृपया doctor को दिखाएँ, 112 पर call करें.");
    expect(toSpokenHinglish("Aapki location Gomti Nagar hai")).toBe("आपकी location Gomti Nagar है");
  });

  it("leaves no untreated Hindi word in any line Ayu can say", () => {
    const lines = [
      ...FIXED_LINES.map((line) => line.hinglish),
      ...NORMAL_FIXED_LINES.map((line) => line.hinglish),
      dispatched("hinglish", 8), etaUpdate("hinglish", 5), locationConfirm("hinglish", ""), locationNear("hinglish", ""),
    ];
    const missed = lines.flatMap((line) => line.match(/[A-Za-z]+/g) ?? [])
      .filter((word) => !isConverted(word) && !ENGLISH_WORDS.has(word.toLowerCase()));
    expect([...new Set(missed)]).toEqual([]);
  });

  it("reads first-aid and home-care steps from their Hindi text", () => {
    const steps = [
      ...[...loadProtocols().values()].flatMap((protocol) => protocol.steps.map((step) => step.text)),
      ...[...loadHomeCare().values()].flatMap((card) => card.steps),
    ];
    expect(steps.length).toBeGreaterThan(40);
    for (const step of steps) expect(toSpokenHinglish(step.hinglish)).toBe(step.hi);
  });

  it("converts only what is sent to Timbre, and only for Hinglish", () => {
    const adapter = new TimbreAdapter({
      url: "", apiKey: "", model: "timbre-v2.5", speed: 1, sampleRate: 24000, voices: { hi: "Yashvi", hinglish: "Poorvi", en: "Kaveri" },
    });
    expect(adapter.buildRequest("dard hai", "hinglish").text).toBe("दर्द है");
    expect(adapter.buildRequest("to the door", "en").text).toBe("to the door");
    expect(adapter.buildRequest("Gale mein dard?", "hinglish", "गले में दर्द?").text).toBe("गले में दर्द?");
    expect(adapter.buildRequest("Kya chakkar aa rahe hain?", "hinglish", "Kya चक्कर aa rahe hain?").text).toBe("क्या चक्कर आ रहे हैं?");
  });
});
