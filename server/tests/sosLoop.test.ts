import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coarse, NominatimGeocoder, parseAddress, type AddressResult } from "../src/adapters/geocode.js";
import type { Extraction } from "../src/types/triage.js";
import { CaseStore } from "../src/cases/store.js";
import {
  ALMOST_THERE, ARRIVED, ASK_ADDRESS, ASK_LANDMARK, ASK_RESPONSIVE, CALL_112, dispatched, etaUpdate, FALSE_ALARM_OFFER,
  LOCATION_UPDATED, locationConfirm, locationNear, NO_ACK, PRE_ACK, RECHECK_STARTED, RECHECK_STILL,
} from "../src/dialogue/lines.js";
import { parseLocationAnswer, saysFalseAlarm } from "../src/dialogue/ruleExtract.js";
import { SosMachine, type SosIo } from "../src/dialogue/sosMachine.js";
import { DispatchSimulator } from "../src/dispatch/simulator.js";
import { loadProtocols } from "../src/protocols/index.js";
import type { SosState } from "../src/types/voice.js";

const protocols = loadProtocols();
const LANG = "en";
const GOOD = { text: "Gomti Nagar, Lucknow", weak: false };
const position = { lat: 26.85, lng: 80.99, accuracyM: 25 };

function setup(options: {
  address?: AddressResult | null;
  location?: typeof position | null;
  extraction?: Partial<Extraction>;
} = {}) {
  const cases = new CaseStore();
  const location = options.location === null ? undefined : options.location ?? position;
  const sos = cases.create({ lang: LANG, location });
  const address = options.address === undefined ? GOOD : options.address;
  if (address) cases.setAddress(sos.id, address.text, address.weak);
  const spoken: string[] = [];
  const states: SosState[] = [];
  const hooks: { onSay?: (text: string) => void } = {};
  const io: SosIo = {
    async say(text) {
      spoken.push(text);
      hooks.onSay?.(text);
    },
    interrupt() {},
    publish: (state) => states.push(state),
  };
  const llm = {
    extract: vi.fn(async () => (options.extraction
      ? ({
        emergencyType: null, location: { text: null, landmark: null, floor: null }, patients: null, age: null, sex: null,
        responsive: null, breathingNormally: null, conscious: null, symptoms: [], onsetText: null, stateChange: false,
        ...options.extraction,
      } as Extraction)
      : null)),
  };
  const machine = new SosMachine(sos.id, LANG, { cases, llm, protocols, addressFor: async () => address }, io);
  const dispatch = new DispatchSimulator(cases, {
    ackTimeoutMs: 60000, autoAckSeconds: 0, simMinuteMs: 1000, minEtaMinutes: 8, maxEtaMinutes: 8,
  });
  cases.subscribe((updated) => {
    if (updated.id === sos.id && !updated.closedAt) void machine.onCaseChanged(updated);
  });
  dispatch.track(sos.id);
  return { cases, sos, spoken, states, machine, dispatch, io, hooks };
}

/** Runs triage to CPR and stops at the location question. */
async function toLocation(context: ReturnType<typeof setup>) {
  await context.machine.begin();
  await context.machine.onAnswer("no");
  await context.machine.onAnswer("no");
}

async function toWaiting(context: ReturnType<typeof setup>) {
  await toLocation(context);
  await context.machine.onAnswer("yes");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("location read-back", () => {
  it("reads the area after the protocol, never before it", async () => {
    const context = setup();
    await toLocation(context);
    const { spoken } = context;
    expect(spoken.at(-1)).toBe(locationConfirm(LANG, GOOD.text));
    expect(spoken.indexOf(CALL_112[LANG])).toBeLessThan(spoken.indexOf(locationConfirm(LANG, GOOD.text)));
    expect(context.sos.location?.status).toBe("confirming");
  });

  it("marks the location verified on yes", async () => {
    const context = setup();
    await toLocation(context);
    await context.machine.onUtterance("haan sahi hai");
    expect(context.sos.location?.status).toBe("verified");
    expect(context.spoken.at(-1)).toBe(PRE_ACK[LANG]);
  });

  it("asks for a landmark on no, and flags the location as updated", async () => {
    const context = setup();
    await toLocation(context);
    await context.machine.onUtterance("nahi galat hai");
    expect(context.spoken.at(-1)).toBe(ASK_LANDMARK[LANG]);
    await context.machine.onUtterance("Gate number 2, petrol pump ke paas");
    expect(context.sos.location).toMatchObject({ status: "updated", spokenText: "Gate number 2, petrol pump ke paas" });
    expect(context.spoken).toContain(LOCATION_UPDATED[LANG]);
    expect(context.cases.eventsFor(context.sos.id).map((event) => event.type)).toContain("location_updated");
  });

  it("takes a correction spoken straight away, without a yes or no", async () => {
    const context = setup({ extraction: { location: { text: null, landmark: "petrol pump", floor: "3" } } });
    await toLocation(context);
    await context.machine.onUtterance("hum teesri manzil par hain petrol pump ke paas wali building mein");
    expect(context.sos.location).toMatchObject({ status: "updated", landmark: "petrol pump", floor: "3" });
  });

  it("skips read-back and asks for a landmark when GPS is poor", async () => {
    const context = setup({ location: { ...position, accuracyM: 500 } });
    await toLocation(context);
    expect(context.spoken.at(-1)).toBe(locationNear(LANG, GOOD.text));
    expect(context.spoken).not.toContain(locationConfirm(LANG, GOOD.text));
  });

  it("does not read out a city-only address as if it were the location", async () => {
    const context = setup({ address: { text: "Lucknow", weak: true } });
    await toLocation(context);
    expect(context.spoken.at(-1)).toBe(locationNear(LANG, "Lucknow"));
  });

  it("asks for the address when GPS or geocoding failed, and keeps what is said", async () => {
    const context = setup({ location: null, address: null });
    await toLocation(context);
    expect(context.spoken.at(-1)).toBe(ASK_ADDRESS[LANG]);
    await context.machine.onUtterance("Hazratganj chauraha ke paas");
    expect(context.sos.location).toMatchObject({ lat: null, spokenText: "Hazratganj chauraha ke paas", status: "updated" });
  });

  it("moves on instead of hanging when nobody answers", async () => {
    const context = setup();
    await toLocation(context);
    await vi.advanceTimersByTimeAsync(40000);
    expect(context.states.at(-1)?.question === "location").toBe(false);
    expect(context.states.at(-1)?.stage).toBe("waiting");
  });

  it.each([
    ["sahi hai", "yes"], ["हाँ", "yes"], ["नहीं", "no"], ["galat hai", "no"], ["पता नहीं", "unsure"],
    ["Hazratganj chauraha ke paas hum khade hain", null],
  ] as const)("reads %s", (text, expected) => {
    expect(parseLocationAnswer(text)).toBe(expected);
  });
});

describe("simulated dispatch", () => {
  it("only says dispatched after acceptance, and never before", async () => {
    const context = setup();
    await toWaiting(context);
    expect(context.spoken.join(" ")).not.toMatch(/dispatched/i);
    expect(context.spoken.at(-1)).toBe(PRE_ACK[LANG]);
    context.dispatch.accept(context.sos.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.spoken.at(-1)).toBe(dispatched(LANG, 8));
    expect(context.sos.dispatch).toMatchObject({ status: "accepted", etaMinutes: 8, simulated: true });
  });

  it("tells the caller to call 112 after 60 seconds with no acknowledgement", async () => {
    const context = setup();
    await toWaiting(context);
    await vi.advanceTimersByTimeAsync(60000);
    expect(context.sos.dispatch.status).toBe("unacknowledged");
    expect(context.spoken).toContain(NO_ACK[LANG]);
  });

  it("does not time out once accepted", async () => {
    const context = setup();
    await toWaiting(context);
    context.dispatch.accept(context.sos.id);
    await vi.advanceTimersByTimeAsync(60000);
    expect(context.spoken).not.toContain(NO_ACK[LANG]);
  });

  it("counts down, updates at 5 and 2 minutes, then arrives", async () => {
    const context = setup();
    await toWaiting(context);
    context.dispatch.accept(context.sos.id);
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.sos.dispatch.status).toBe("en_route");
    await vi.advanceTimersByTimeAsync(2000);
    expect(context.spoken).toContain(etaUpdate(LANG, 5));
    await vi.advanceTimersByTimeAsync(3000);
    expect(context.spoken).toContain(ALMOST_THERE[LANG]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(context.sos.dispatch).toMatchObject({ status: "arrived", etaMinutes: 0 });
    expect(context.spoken.at(-1)).toBe(ARRIVED[LANG]);
    expect(context.states.at(-1)?.stage).toBe("arrived");
  });

  it("holds status updates during triage and speaks them afterwards", async () => {
    const context = setup();
    await context.machine.begin();
    context.dispatch.accept(context.sos.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(context.spoken).not.toContain(dispatched(LANG, 8));
    await context.machine.onAnswer("no");
    await context.machine.onAnswer("no");
    await context.machine.onAnswer("yes");
    expect(context.spoken).toContain(dispatched(LANG, 8));
    expect(context.spoken.indexOf(ASK_RESPONSIVE[LANG])).toBeLessThan(context.spoken.indexOf(dispatched(LANG, 8)));
    expect(context.spoken).not.toContain(PRE_ACK[LANG]);
  });

  it("stops all timers when the case closes", async () => {
    const context = setup();
    context.cases.cancel(context.sos.id);
    await vi.advanceTimersByTimeAsync(120000);
    expect(context.sos.dispatch.status).toBe("cancelled");
  });

  it("keeps arrived status when the caller closes after handover", async () => {
    const context = setup();
    context.dispatch.setStatus(context.sos.id, "arrived");
    context.cases.cancel(context.sos.id);
    expect(context.sos.dispatch.status).toBe("arrived");
    expect(context.sos.closedAt).toBeDefined();
  });
});

describe("waiting loop", () => {
  it("re-checks breathing and switches protocol if it changes", async () => {
    const context = setup();
    await context.machine.begin();
    await context.machine.onAnswer("no");
    await context.machine.onAnswer("yes"); // collapsed, breathing
    await context.machine.onAnswer("yes"); // location correct
    await vi.advanceTimersByTimeAsync(45000);
    expect(context.spoken.at(-1)).toBe(RECHECK_STILL[LANG]);
    await context.machine.onUtterance("nahi");
    expect(context.sos.protocolId).toBe("cpr");
    expect(context.spoken).toContain(protocols.get("cpr")!.steps[0]!.text[LANG]);
  });

  it("asks the right question when the person was not breathing", async () => {
    const context = setup();
    await toWaiting(context);
    await vi.advanceTimersByTimeAsync(45000);
    expect(context.spoken.at(-1)).toBe(RECHECK_STARTED[LANG]);
  });

  it("never lowers severity on a good re-check", async () => {
    const context = setup();
    await toWaiting(context);
    await vi.advanceTimersByTimeAsync(45000);
    await context.machine.onAnswer("yes");
    expect(context.sos.severity).toBe("RED");
  });

  it("keeps re-checking after an unanswered one", async () => {
    const context = setup();
    await toWaiting(context);
    await vi.advanceTimersByTimeAsync(45000 + 16000 + 45000);
    const asked = context.spoken.filter((line) => line === RECHECK_STARTED[LANG]);
    expect(asked.length).toBeGreaterThanOrEqual(2);
  });

  it("says one waiting step between re-checks", async () => {
    const context = setup();
    await context.machine.begin();
    await context.machine.onAnswer("no");
    await context.machine.onAnswer("yes"); // collapsed, breathing
    const waiting = protocols.get("recovery_stroke_collapse")!.waiting.map((step) => step.text[LANG]);
    expect(context.spoken).not.toContain(waiting[0]);
    await context.machine.onAnswer("yes"); // location correct
    await vi.advanceTimersByTimeAsync(20000);
    expect(context.spoken.at(-1)).toBe(waiting[0]);
    await vi.advanceTimersByTimeAsync(25000);
    expect(context.spoken.at(-1)).toBe(RECHECK_STILL[LANG]);
    await context.machine.onAnswer("yes");
    await vi.advanceTimersByTimeAsync(20000);
    expect(context.spoken.at(-1)).toBe(waiting[1]);
  });

  it("gives each protocol only steps that fit it", () => {
    const words = (id: "cpr" | "choking" | "severe_bleeding") => protocols.get(id)!.waiting.map((step) => step.text.en).join(" ");
    for (const id of ["cpr", "choking", "severe_bleeding"] as const) expect(words(id)).not.toMatch(/Do not move/);
    expect(words("cpr")).not.toMatch(/food|medicine|Loosen/);
    expect(protocols.get("cpr")!.waiting.filter((step) => step.repeat)).toHaveLength(1);
  });

  it("keeps encouraging during CPR after the list runs out", async () => {
    const context = setup();
    await toWaiting(context);
    const keepGoing = protocols.get("cpr")!.waiting.find((step) => step.repeat)!.text[LANG];
    for (let cycle = 0; cycle < 6; cycle++) {
      await vi.advanceTimersByTimeAsync(45000);
      await context.machine.onAnswer("no");
    }
    expect(context.spoken.filter((line) => line === keepGoing).length).toBeGreaterThanOrEqual(2);
    expect(context.spoken.filter((line) => line === protocols.get("cpr")!.waiting[0]!.text[LANG])).toHaveLength(1);
  });

  it("starts the beat during CPR only, and stops it when breathing returns", async () => {
    const context = setup();
    await toLocation(context);
    expect(context.states.at(-1)?.rhythm).toBe(true);
    const firstOn = context.states.findIndex((state) => state.rhythm);
    expect(context.states.slice(0, firstOn).every((state) => state.protocolTitle === null || state.protocolTitle === "CPR")).toBe(true);
    await context.machine.onAnswer("yes");
    await vi.advanceTimersByTimeAsync(45000);
    await context.machine.onAnswer("yes"); // started breathing
    expect(context.sos.protocolId).toBe("recovery_stroke_collapse");
    expect(context.states.at(-1)?.rhythm).toBe(false);
  });

  it("never starts the beat outside CPR", async () => {
    const context = setup();
    await context.machine.begin();
    await context.machine.onAnswer("no");
    await context.machine.onAnswer("yes");
    expect(context.states.some((state) => state.rhythm)).toBe(false);
  });

  it("stops the beat and the remaining steps when the ambulance arrives", async () => {
    const context = setup();
    const steps = protocols.get("cpr")!.steps.map((step) => step.text[LANG]);
    await context.machine.begin();
    await context.machine.onAnswer("no");
    context.hooks.onSay = (text) => {
      if (text === steps[7]) context.dispatch.setStatus(context.sos.id, "arrived");
    };
    await context.machine.onAnswer("no");
    await vi.advanceTimersByTimeAsync(0);
    expect(context.spoken.at(-1)).toBe(ARRIVED[LANG]);
    expect(context.spoken).not.toContain(steps[8]);
    expect(context.spoken).not.toContain(locationConfirm(LANG, GOOD.text));
    expect(context.states.at(-1)?.rhythm).toBe(false);
  });

  it("stops re-checking on arrival", async () => {
    const context = setup();
    await toWaiting(context);
    context.dispatch.setStatus(context.sos.id, "arrived");
    await vi.advanceTimersByTimeAsync(0);
    const count = context.spoken.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(context.spoken).toHaveLength(count);
  });
});

describe("reconnecting", () => {
  it("stays silent while disconnected, then re-asks the pending question", async () => {
    const context = setup();
    await context.machine.begin();
    context.machine.detach();
    await vi.advanceTimersByTimeAsync(30000);
    const count = context.spoken.length;
    expect(count).toBe(2);
    await context.machine.attach(context.io);
    expect(context.spoken.slice(count)).toEqual([ASK_RESPONSIVE[LANG]]);
  });

  it("says an update it held back during the drop", async () => {
    const context = setup();
    await toWaiting(context);
    context.machine.detach();
    context.dispatch.accept(context.sos.id);
    await vi.advanceTimersByTimeAsync(0);
    await context.machine.attach(context.io);
    expect(context.spoken).toContain(dispatched(LANG, 8));
  });

  it("repeats the step cut off by a drop, then finishes the rest in order", async () => {
    const context = setup();
    const steps = protocols.get("cpr")!.steps.map((step) => step.text[LANG]);
    await context.machine.begin();
    await context.machine.onAnswer("no");
    context.hooks.onSay = (text) => {
      if (text === steps[2]) context.machine.detach();
    };
    await context.machine.onAnswer("no");
    await vi.advanceTimersByTimeAsync(0);
    expect(context.spoken.at(-1)).toBe(steps[2]);

    context.hooks.onSay = undefined;
    const count = context.spoken.length;
    await context.machine.attach(context.io);
    expect(context.spoken.slice(count)).toEqual([...steps.slice(2), CALL_112[LANG], locationConfirm(LANG, GOOD.text)]);
  });

  it("does not record a step as spoken while disconnected", async () => {
    const context = setup();
    const steps = protocols.get("cpr")!.steps;
    await context.machine.begin();
    await context.machine.onAnswer("no");
    context.hooks.onSay = (text) => {
      if (text === steps[1]!.text[LANG]) context.machine.detach();
    };
    await context.machine.onAnswer("no");
    await vi.advanceTimersByTimeAsync(0);
    const recorded = context.cases.eventsFor(context.sos.id).filter((event) => event.type === "instruction_spoken");
    expect(recorded).toHaveLength(2);
  });
});

describe("false alarm", () => {
  it.each([
    "galti se dab gaya", "गलती से दब गया", "pressed it by mistake", "sab theek hai", "सब ठीक है", "कुछ नहीं हुआ", "false alarm",
    "I pressed it accidentally", "main theek hoon", "मैं ठीक हूँ", "I'm fine",
  ])("hears %s", (text) => {
    expect(saysFalseAlarm(text)).toBe(true);
  });

  it.each([
    "sab theek nahi hai", "सब ठीक नहीं है", "galti se gir gaye", "accident ho gaya", "kuch nahi hua par saans nahi le rahe",
    "sab theek tha phir behosh ho gaye", "theek hai", "haan", "nahi", "mujhe madad chahiye", "I am not fine",
  ])("does not take %s as a false alarm", (text) => {
    expect(saysFalseAlarm(text)).toBe(false);
  });

  it("offers the button but keeps dispatch and the question going, and voice cancels nothing", async () => {
    const context = setup();
    await context.machine.begin();
    await context.machine.onUtterance("galti se dab gaya");
    expect(context.spoken.slice(-2)).toEqual([FALSE_ALARM_OFFER[LANG], ASK_RESPONSIVE[LANG]]);
    expect(context.states.at(-1)).toMatchObject({ falseAlarm: true, question: "responsive", dispatchStatus: "requested" });
    expect(context.sos.closedAt).toBeUndefined();
    expect(context.cases.eventsFor(context.sos.id).map((event) => event.type)).toContain("false_alarm_reported");
  });

  it("offers once, and a repeat is handled as an ordinary reply", async () => {
    const context = setup();
    await context.machine.begin();
    await context.machine.onUtterance("galti se dab gaya");
    await context.machine.onUtterance("sab theek hai");
    expect(context.spoken.filter((line) => line === FALSE_ALARM_OFFER[LANG])).toHaveLength(1);
  });

  it("takes the offer back if the answers show a real emergency", async () => {
    const context = setup();
    await context.machine.begin();
    await context.machine.onUtterance("galti se dab gaya");
    await context.machine.onAnswer("no");
    await context.machine.onAnswer("no");
    expect(context.sos.severity).toBe("RED");
    expect(context.states.at(-1)?.falseAlarm).toBe(false);
  });

  it("does not offer on a case already RED", async () => {
    const context = setup();
    await toWaiting(context);
    await context.machine.onUtterance("sab theek hai");
    expect(context.spoken).not.toContain(FALSE_ALARM_OFFER[LANG]);
    expect(context.states.at(-1)?.falseAlarm).toBe(false);
  });

  it("never lets a worsening patient wait behind the offer", async () => {
    const context = setup();
    await context.machine.begin();
    await context.machine.onUtterance("sab theek tha phir saans band ho gayi");
    expect(context.spoken).not.toContain(FALSE_ALARM_OFFER[LANG]);
  });
});

describe("Nominatim", () => {
  it("sends only area-level coordinates, identifies itself, and caches", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ address: { suburb: "Gomti Nagar", city: "Lucknow" } })));
    vi.stubGlobal("fetch", fetchMock);
    const geocoder = new NominatimGeocoder("https://example.test");
    const first = geocoder.reverse(26.84674, 80.94621);
    await vi.advanceTimersByTimeAsync(0);
    expect(await first).toEqual({ text: "Gomti Nagar, Lucknow", weak: false });
    await geocoder.reverse(26.84681, 80.94619); // same area
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain(`lat=${coarse(26.84674)}&lon=${coarse(80.94621)}`);
    expect(url).not.toContain("26.84674");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^Ayu-prototype/);
    vi.unstubAllGlobals();
  });

  it("spaces requests at least a second apart", async () => {
    const times: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      times.push(Date.now());
      return new Response(JSON.stringify({ address: { suburb: "A" } }));
    }));
    const geocoder = new NominatimGeocoder("https://example.test");
    void geocoder.reverse(1, 1);
    void geocoder.reverse(2, 2);
    void geocoder.reverse(3, 3);
    await vi.advanceTimersByTimeAsync(3000);
    expect(times).toHaveLength(3);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(1000);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(1000);
    vi.unstubAllGlobals();
  });

  it("returns null rather than failing when the service is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("down");
    }));
    const geocoder = new NominatimGeocoder("https://example.test");
    const result = geocoder.reverse(1, 1);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBeNull();
    vi.unstubAllGlobals();
  });

  it("marks a city-only result as weak", () => {
    expect(parseAddress({ address: { city: "Lucknow" } })).toEqual({ text: "Lucknow", weak: true });
    expect(parseAddress({ address: { road: "MG Road", city: "Lucknow" } })).toEqual({ text: "MG Road, Lucknow", weak: false });
    expect(parseAddress({ error: "Unable to geocode" })).toBeNull();
  });
});
