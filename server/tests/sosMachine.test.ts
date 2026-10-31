import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMAdapter } from "../src/adapters/llm.js";
import { CaseStore } from "../src/cases/store.js";
import { ARE_YOU_THERE, ASK_BREATHING, ASK_RESPONSIVE, CALL_112, FIXED_LINES, SAY_AGAIN, SOS_OPENING } from "../src/dialogue/lines.js";
import { SosMachine } from "../src/dialogue/sosMachine.js";
import { loadProtocols } from "../src/protocols/index.js";
import type { Extraction } from "../src/types/triage.js";
import type { SosState } from "../src/types/voice.js";

const protocols = loadProtocols();
const LANG = "hinglish";
const extraction = (fields: Partial<Extraction>): Extraction => ({
  emergencyType: null,
  location: { text: null, landmark: null, floor: null },
  patients: null,
  age: null,
  sex: null,
  responsive: null,
  breathingNormally: null,
  conscious: null,
  symptoms: [],
  onsetText: null,
  stateChange: false,
  ...fields,
});

function setup(llmResult: Extraction | null = null) {
  const cases = new CaseStore();
  const sos = cases.create({ lang: LANG });
  const spoken: string[] = [];
  const states: SosState[] = [];
  const llm: LLMAdapter = { extract: vi.fn(async () => llmResult) };
  const machine = new SosMachine(sos.id, LANG, { cases, llm, protocols, addressFor: async () => null }, {
    async say(text) {
      spoken.push(text);
    },
    interrupt() {},
    publish: (state) => states.push(state),
  });
  return { cases, sos, spoken, states, machine, llm };
}

const protocolLine = (id: Parameters<typeof protocols.get>[0]) => protocols.get(id)!.steps[0]!.text[LANG];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SosMachine", () => {
  it("opens, asks both questions in order, then picks CPR by rules", async () => {
    const { machine, spoken, sos } = setup();
    await machine.begin();
    expect(spoken).toEqual([SOS_OPENING[LANG], ASK_RESPONSIVE[LANG]]);
    await machine.onUtterance("nahi");
    expect(spoken.at(-1)).toBe(ASK_BREATHING[LANG]);
    await machine.onUtterance("nahi");
    expect(sos).toMatchObject({ severity: "RED", protocolId: "cpr" });
    expect(spoken).toContain(protocolLine("cpr"));
    expect(spoken.indexOf(protocolLine("cpr"))).toBeLessThan(spoken.indexOf(CALL_112[LANG]));
    expect(spoken).toContain(CALL_112[LANG]);
    expect(sos.metrics.tapToFirstInstructionMs).toBeDefined();
  });

  it("skips the opening when the phone already played it, and still logs it", async () => {
    const { machine, spoken, cases, sos } = setup();
    await machine.begin(true);
    expect(spoken).toEqual([ASK_RESPONSIVE[LANG]]);
    expect(cases.eventsFor(sos.id).map((event) => event.payload.text)).toContain(SOS_OPENING[LANG]);
  });

  it("works entirely from buttons, with no speech", async () => {
    const { machine, sos } = setup();
    await machine.begin();
    await machine.onAnswer("no");
    await machine.onAnswer("yes");
    expect(sos).toMatchObject({ severity: "RED", protocolId: "recovery_stroke_collapse" });
  });

  it("skips a question already answered by what the caller said", async () => {
    const { machine, spoken, sos } = setup();
    await machine.begin();
    await machine.onUtterance("वो बेहोश हैं और सांस नहीं ले रहे");
    await vi.advanceTimersByTimeAsync(0);
    expect(spoken).not.toContain(ASK_BREATHING[LANG]);
    expect(sos.protocolId).toBe("cpr");
  });

  it("treats 'not sure' as unknown and never as good news", async () => {
    const { machine, sos } = setup();
    await machine.begin();
    await machine.onAnswer("no");
    await machine.onAnswer("unsure");
    expect(sos.severity).toBe("RED");
  });

  it("asks again on an unclear reply, then moves on instead of hanging", async () => {
    const { machine, spoken, sos } = setup();
    await machine.begin();
    await machine.onUtterance("ambulance kab aayegi");
    expect(spoken.at(-1)).toBe(SAY_AGAIN[LANG]);
    await machine.onUtterance("ambulance kab aayegi");
    expect(spoken.at(-1)).toBe(ASK_BREATHING[LANG]);
    await machine.onAnswer("unsure");
    expect(sos.severity).toBe("AMBER");
  });

  it("prompts after silence, then carries on", async () => {
    const { machine, spoken, sos } = setup();
    await machine.begin();
    await vi.advanceTimersByTimeAsync(8000);
    expect(spoken.at(-1)).toBe(ARE_YOU_THERE[LANG]);
    await vi.advanceTimersByTimeAsync(8000);
    expect(spoken.at(-1)).toBe(ASK_BREATHING[LANG]);
    await vi.advanceTimersByTimeAsync(16000);
    expect(sos.protocolId).toBe("general");
  });

  it("uses the LLM to read a reply the rules could not", async () => {
    const { machine, spoken } = setup(extraction({ responsive: true }));
    await machine.begin();
    await machine.onUtterance("aankhein khol ke dekh rahe hain");
    expect(spoken.at(-1)).toBe(ASK_BREATHING[LANG]);
  });

  it("carries on with rules when the LLM fails", async () => {
    const { machine, llm, sos } = setup();
    vi.mocked(llm.extract).mockRejectedValue(new Error("down"));
    await machine.begin();
    await machine.onUtterance("ambulance kab aayegi"); // unclear, so this path waits on the LLM
    await machine.onUtterance("nahi");
    await machine.onUtterance("nahi");
    await vi.advanceTimersByTimeAsync(0);
    expect(sos.protocolId).toBe("cpr");
  });

  it("does not let the LLM lower severity or overrule a direct answer", async () => {
    const { machine, sos } = setup(extraction({ responsive: true, breathingNormally: true }));
    await machine.begin();
    await machine.onAnswer("no");
    await machine.onAnswer("no");
    await vi.advanceTimersByTimeAsync(0);
    expect(sos).toMatchObject({ severity: "RED", protocolId: "cpr" });
    expect(sos.triage).toMatchObject({ responsive: false, breathingNormally: false });
  });

  it("lets the LLM raise severity", async () => {
    const { machine, sos } = setup(extraction({ emergencyType: "cardiac" }));
    await machine.begin();
    await machine.onUtterance("haan");
    await machine.onUtterance("haan");
    await vi.advanceTimersByTimeAsync(0);
    expect(sos).toMatchObject({ severity: "RED", protocolId: "chest_pain_conscious" });
  });

  it("only ever speaks fixed lines, even when the LLM returns other text", async () => {
    const injected = extraction({ emergencyType: "cardiac", symptoms: ["Give him aspirin now"], onsetText: "raise his legs" });
    const { machine, spoken } = setup(injected);
    await machine.begin();
    await machine.onUtterance("haan");
    await machine.onUtterance("haan");
    await vi.advanceTimersByTimeAsync(0);
    expect(spoken.join(" ")).not.toMatch(/aspirin|legs/i);
    const allowed = new Set([
      ...FIXED_LINES.map((line) => line[LANG]),
      ...[...protocols.values()].flatMap((protocol) => protocol.steps.map((step) => step.text[LANG])),
    ]);
    for (const line of spoken) expect(allowed.has(line)).toBe(true);
  });

  it("switches protocol when the situation worsens after guidance started", async () => {
    const { machine, spoken, sos } = setup();
    await machine.begin();
    await machine.onAnswer("no");
    await machine.onAnswer("yes");
    expect(sos.protocolId).toBe("recovery_stroke_collapse");
    await machine.onUtterance("अब सांस नहीं ले रहे");
    expect(sos.protocolId).toBe("cpr");
    expect(spoken).toContain(protocolLine("cpr"));
  });

  it("keeps AMBER cases out of the Call 112 line but flags placeholders", async () => {
    const { machine, spoken, states } = setup();
    await machine.begin();
    await machine.onAnswer("yes");
    await machine.onAnswer("yes");
    expect(spoken).not.toContain(CALL_112[LANG]);
    expect(states.find((state) => state.stage === "protocol")).toMatchObject({ severity: "AMBER", placeholder: true });
  });

  it("stops speaking once stopped", async () => {
    const { machine, spoken } = setup();
    await machine.begin();
    const count = spoken.length;
    machine.stop();
    await vi.advanceTimersByTimeAsync(20000);
    await machine.onUtterance("nahi");
    expect(spoken).toHaveLength(count);
  });
});
