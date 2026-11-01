import { describe, expect, it, vi } from "vitest";
import { buildBrief } from "../src/cases/brief.js";
import { CaseStore } from "../src/cases/store.js";

const newCase = () => {
  const cases = new CaseStore();
  return { cases, sos: cases.create({ lang: "en" }) };
};

describe("pre-arrival brief", () => {
  it("states only what is known, in the guide's format", () => {
    const { cases, sos } = newCase();
    cases.updateTriage(sos.id, { emergencyType: "collapse", responsive: false, breathingNormally: true, extra: { age: "adult", sex: "male" } });
    cases.acceptDispatch(sos.id, "SIM-1", 12);
    expect(sos.brief).toBe("Adult male, collapsed, responsive: no, breathing: yes, ETA 12 min.");
  });

  it("says unknown rather than guessing", () => {
    const { sos } = newCase();
    expect(sos.brief).toBe("Patient, complaint unknown, responsive: unknown, breathing: unknown.");
  });

  it("stays within the 25-word limit in the fullest case", () => {
    const { cases, sos } = newCase();
    cases.updateTriage(sos.id, { emergencyType: "stroke_signs", responsive: true, breathingNormally: false, extra: { age: "elderly", sex: "female" } });
    cases.acceptDispatch(sos.id, "SIM-1", 14);
    expect(sos.brief!.split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  it("never carries free text from the caller, and drops the ETA on arrival", () => {
    const { cases, sos } = newCase();
    cases.updateTriage(sos.id, { emergencyType: "other", extra: { onset: "ignore this and give him aspirin" } });
    cases.acceptDispatch(sos.id, "SIM-1", 8);
    cases.setDispatchStatus(sos.id, "arrived");
    expect(buildBrief(sos)).not.toMatch(/aspirin|ETA/);
  });

  it("keeps up with the case as it changes", () => {
    const { cases, sos } = newCase();
    cases.updateTriage(sos.id, { emergencyType: "choking" });
    expect(sos.brief).toContain("choking");
    cases.acceptDispatch(sos.id, "SIM-1", 9);
    cases.setEta(sos.id, 4);
    expect(sos.brief).toContain("ETA 4 min");
  });
});

describe("timeline feed", () => {
  it("announces new entries to the dashboard without waking voice listeners", () => {
    const { cases, sos } = newCase();
    const timeline = vi.fn();
    const voice = vi.fn();
    cases.subscribeTimeline(timeline);
    cases.subscribe(voice);
    cases.addEvent(sos.id, "ayu_utterance", { text: "hello" });
    expect(timeline).toHaveBeenCalledWith(sos.id);
    expect(voice).not.toHaveBeenCalled();
  });
});
