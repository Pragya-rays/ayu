import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GeminiAdapter, parseExtraction } from "../src/adapters/llm.js";
import { extractFacts, parseAnswer } from "../src/dialogue/ruleExtract.js";
import { higherSeverity, triage } from "../src/dialogue/triageRules.js";
import { loadProtocols, validateProtocol } from "../src/protocols/index.js";
import { PROTOCOL_IDS, type TriageFacts } from "../src/types/triage.js";

describe("triage rules", () => {
  const table: [string, TriageFacts, string, string][] = [
    ["unresponsive, not breathing", { responsive: false, breathingNormally: false }, "RED", "cpr"],
    ["unresponsive, breathing (E1)", { responsive: false, breathingNormally: true }, "RED", "recovery_stroke_collapse"],
    ["choking", { emergencyType: "choking" }, "RED", "choking"],
    ["choking, responsive", { responsive: true, breathingNormally: true, emergencyType: "choking" }, "RED", "choking"],
    ["bleeding", { emergencyType: "bleeding" }, "RED", "severe_bleeding"],
    ["accident, severe bleeding", { emergencyType: "accident", symptoms: ["severe_bleeding"] }, "RED", "severe_bleeding"],
    ["stroke signs", { emergencyType: "stroke_signs" }, "RED", "stroke"],
    ["conscious chest pain", { responsive: true, emergencyType: "cardiac" }, "RED", "chest_pain_conscious"],
    ["unresponsive cardiac, breathing unknown, stays RED", { responsive: false, emergencyType: "cardiac" }, "RED", "general"],
    ["unresponsive, breathing unknown", { responsive: false }, "RED", "general"],
    ["not breathing, response unknown", { breathingNormally: false }, "RED", "general"],
    ["fine and breathing", { responsive: true, breathingNormally: true }, "AMBER", "general"],
    ["everything unknown", {}, "AMBER", "general"],
    ["accident with no bleeding detail", { emergencyType: "accident" }, "AMBER", "general"],
  ];

  it.each(table)("%s", (_name, facts, severity, protocolId) => {
    expect(triage(facts)).toEqual({ severity, protocolId });
  });

  it("gives CPR priority over any named emergency when unresponsive and not breathing", () => {
    expect(triage({ responsive: false, breathingNormally: false, emergencyType: "choking" }).protocolId).toBe("cpr");
  });

  it("never lowers severity", () => {
    expect(higherSeverity("RED", "AMBER")).toBe("RED");
    expect(higherSeverity("AMBER", "RED")).toBe("RED");
    expect(higherSeverity(null, "AMBER")).toBe("AMBER");
  });
});

describe("spoken answers", () => {
  it.each([
    ["responsive", "हाँ", "yes"],
    ["responsive", "नहीं", "no"],
    ["responsive", "haan ji", "yes"],
    ["responsive", "nahi", "no"],
    ["responsive", "जवाब नहीं दे रहे", "no"],
    ["responsive", "bol rahe hain", "yes"],
    ["responsive", "पता नहीं", "unsure"],
    ["breathing", "saans le rahe hain", "yes"],
    ["breathing", "सांस नहीं ले रहे", "no"],
    ["breathing", "haanf rahe hain", "no"],
    ["breathing", "हाँ लेकिन रुक रुक के", "no"],
    ["breathing", "ajeeb tarah se saans", "no"],
    ["breathing", "नहीं पता", "unsure"],
    ["responsive", "ambulance kab aayegi", null],
    ["responsive", "खाना खाते हुए गले में कुछ अटक गया, बोल नहीं पा रहा", null],
    ["responsive", "नहीं वो मेरी बात का जवाब नहीं दे रहे", "no"],
    ["breathing", "गाड़ी नहीं आई अभी तक कहाँ है ambulance", null],
    ["breathing", "नहीं वो बिल्कुल भी सांस नहीं ले रहे", "no"],
  ] as const)("%s: %s", (question, text, expected) => {
    expect(parseAnswer(question, text)).toBe(expected);
  });
});

describe("rule extraction", () => {
  it.each([
    ["मेरे पापा गिर गए हैं", "collapse"],
    ["खाना गले में अटक गया", "choking"],
    ["accident हो गया, बहुत खून निकल रहा है", "bleeding"],
    ["सीने में दर्द है", "cardiac"],
    ["मुँह टेढ़ा हो गया", "stroke_signs"],
  ] as const)("%s", (text, emergencyType) => {
    expect(extractFacts(text).emergencyType).toBe(emergencyType);
  });

  it("reads stated facts and leaves the rest unset", () => {
    expect(extractFacts("वो सांस नहीं ले रहे, बेहोश हैं")).toMatchObject({ breathingNormally: false, responsive: false });
    const unclear = extractFacts("pata nahi kya hua");
    expect(unclear.responsive).toBeUndefined();
    expect(unclear.emergencyType).toBeNull();
  });
});

describe("LLM output validation", () => {
  const valid = {
    emergencyType: "cardiac",
    location: { text: null, landmark: "petrol pump", floor: null },
    patients: null,
    age: "adult",
    sex: null,
    responsive: true,
    breathingNormally: null,
    conscious: null,
    symptoms: ["chest pain"],
    onsetText: null,
    stateChange: false,
  };

  it("accepts schema-valid output", () => {
    expect(parseExtraction(valid)).toMatchObject({ emergencyType: "cardiac", responsive: true });
  });

  it.each([
    ["free text", "Give the patient aspirin"],
    ["null", null],
    ["unknown emergency type", { ...valid, emergencyType: "flu" }],
    ["string boolean", { ...valid, responsive: "true" }],
    ["missing field", { ...valid, stateChange: undefined }],
    ["non-string symptoms", { ...valid, symptoms: [1] }],
    ["no location", { ...valid, location: null }],
    ["bad patient count", { ...valid, patients: -1 }],
  ])("rejects %s", (_name, raw) => {
    expect(parseExtraction(raw)).toBeNull();
  });

  it("drops anything outside the schema, such as advice", () => {
    expect(parseExtraction({ ...valid, advice: "Raise his legs" })).not.toHaveProperty("advice");
  });

  it("returns null when the service fails, so callers fall back to rules", async () => {
    const adapter = new GeminiAdapter({ apiKey: "x", model: "m", timeoutMs: 200, baseUrl: "http://127.0.0.1:9" });
    await expect(adapter.extract(["test"])).resolves.toBeNull();
  });
});

describe("protocol library", () => {
  it("loads all protocols, and none is falsely marked reviewed", () => {
    const protocols = loadProtocols();
    expect([...protocols.keys()].sort()).toEqual([...PROTOCOL_IDS].sort());
    for (const protocol of protocols.values()) {
      if (protocol.status === "reviewed") {
        expect(protocol.reviewedBy).not.toBe("TODO");
        expect(protocol.sources.length).toBeGreaterThan(0);
      }
    }
  });

  const cpr = JSON.parse(readFileSync(resolve(import.meta.dirname, "../src/protocols/cpr.json"), "utf8"));

  it("refuses to mark an unreviewed protocol as reviewed", () => {
    const problems = validateProtocol({ ...cpr, status: "reviewed" }, "cpr");
    expect(problems).toEqual(expect.arrayContaining(["reviewed protocol needs reviewedBy", "reviewed protocol needs sources"]));
  });

  it("rejects a step missing a language", () => {
    const bad = { ...cpr, steps: [{ ...cpr.steps[0], text: { en: "x" } }] };
    expect(validateProtocol(bad, "cpr")).toContain("step 1 needs en, hi and hinglish");
  });

  it("stops startup on an invalid or missing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "ayu-protocols-"));
    writeFileSync(join(dir, "cpr.json"), JSON.stringify({ ...cpr, steps: [] }));
    expect(() => loadProtocols(dir)).toThrow(/Invalid protocol cpr.json/);
    writeFileSync(join(dir, "cpr.json"), JSON.stringify(cpr));
    expect(() => loadProtocols(dir)).toThrow(/Missing protocols/);
  });
});
