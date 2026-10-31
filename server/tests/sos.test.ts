import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CachedTts } from "../src/adapters/cachedTts.js";
import { MockPrisma, MockTimbre } from "../src/adapters/mocks.js";
import type { TTSAdapter, TtsEvents } from "../src/adapters/types.js";
import { buildApp } from "../src/app.js";
import { CaseStore } from "../src/cases/store.js";
import { waitFor } from "./helpers.js";

const position = { lat: 26.85, lng: 80.99, accuracyM: 25 };
let app: Awaited<ReturnType<typeof buildApp>>;
let cases: CaseStore;

const post = (url: string, payload?: object, cookie?: string) =>
  app.inject({ method: "POST", url, payload, headers: cookie ? { cookie } : undefined });

const login = async () => {
  const response = await post("/api/dashboard/login", { secret: "secret" });
  return String(response.headers["set-cookie"]).split(";")[0]!;
};

beforeEach(async () => {
  cases = new CaseStore();
  app = await buildApp({
    stt: new MockPrisma(),
    tts: new MockTimbre(),
    cases,
    voiceMode: "mock",
    voiceLab: false,
    limits: { maxSessions: 2, sessionMaxSeconds: 60, maxTtsChars: 20 },
    dashboardSecret: "secret",
    production: false,
  });
});

afterEach(() => app.close());

describe("SOS routes", () => {
  it("creates a simulated dispatch immediately, with location", async () => {
    const response = await post("/api/sos/start", { lang: "hinglish", consent: true, ...position });
    expect(response.statusCode).toBe(201);
    const created = cases.get(response.json().caseId)!;
    expect(created.dispatch).toMatchObject({ status: "requested", simulated: true });
    expect(created.location).toMatchObject({ ...position, status: "captured" });
  });

  it("never blocks on GPS: starts without location and accepts it later", async () => {
    const { caseId } = (await post("/api/sos/start", { lang: "hi", consent: true })).json();
    expect(cases.get(caseId)!.location).toBeNull();
    expect((await post(`/api/sos/${caseId}/location`, position)).statusCode).toBe(200);
    expect(cases.get(caseId)!.location).toMatchObject(position);
  });

  it("requires consent and validates input", async () => {
    expect((await post("/api/sos/start", { lang: "hi", consent: false })).statusCode).toBe(400);
    expect((await post("/api/sos/start", { lang: "fr", consent: true })).statusCode).toBe(400);
    expect((await post("/api/sos/start", { lang: "hi", consent: true, lat: 200, lng: 0 })).statusCode).toBe(400);
  });

  it("rate limits repeated starts from one address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await post("/api/sos/start", { lang: "en", consent: true })).statusCode);
    expect(statuses.at(9)).toBe(201);
    expect(statuses.at(10)).toBe(429);
  });

  it("cancels a case and returns 404 for unknown ids", async () => {
    const { caseId } = (await post("/api/sos/start", { lang: "en", consent: true })).json();
    expect((await post(`/api/sos/${caseId}/cancel`)).statusCode).toBe(200);
    expect(cases.get(caseId)).toMatchObject({ dispatch: { status: "cancelled" } });
    expect(cases.get(caseId)!.closedAt).toBeDefined();
    expect((await post("/api/sos/missing/cancel")).statusCode).toBe(404);
  });
});

describe("dashboard access", () => {
  it("keeps cases private without the password", async () => {
    expect((await app.inject({ url: "/api/cases" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/cases/stream" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/cases", headers: { cookie: "ayu_dashboard=guess" } })).statusCode).toBe(401);
    expect((await post("/api/dashboard/login", { secret: "wrong" })).statusCode).toBe(401);
  });

  it("lists cases and a timeline after sign-in, without exposing the secret", async () => {
    const cookie = await login();
    expect(cookie).not.toContain("secret");
    const { caseId } = (await post("/api/sos/start", { lang: "en", consent: true })).json();
    const list = await app.inject({ url: "/api/cases", headers: { cookie } });
    expect(list.json()).toHaveLength(1);
    const detail = await app.inject({ url: `/api/cases/${caseId}`, headers: { cookie } });
    expect(detail.json().timeline.map((event: { type: string }) => event.type)).toContain("dispatch_requested");
  });

  it("streams a new case to a connected dashboard", async () => {
    const cookie = await login();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/cases/stream`;
    const controller = new AbortController();
    const response = await fetch(url, { headers: { cookie }, signal: controller.signal });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    const reading = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        received += decoder.decode(value);
      }
    })().catch(() => undefined);

    await waitFor(() => received.includes("event: snapshot"));
    const { caseId } = (await post("/api/sos/start", { lang: "en", consent: true })).json();
    await waitFor(() => received.includes(caseId));
    expect(received).toContain("event: case");
    controller.abort();
    await reading;
  });
});

describe("CachedTts", () => {
  const inner = () => {
    const synthesize = vi.fn((_request: unknown, events: TtsEvents) => {
      events.onAudio("AAA=");
      events.onEnd();
      return { cancel() {} };
    });
    return { sampleRate: 24000, synthesize } satisfies TTSAdapter;
  };
  const capture = () => {
    const audio: string[] = [];
    let ended = false;
    return { audio, ended: () => ended, events: { onAudio: (data: string) => audio.push(data), onEnd: () => { ended = true; }, onError() {} } };
  };

  it("spends one request per fixed line and replays it", async () => {
    const backend = inner();
    const tts = new CachedTts(backend);
    await tts.warm([{ text: "line", lang: "hi" }]);
    const listener = capture();
    tts.synthesize({ text: "line", lang: "hi", cacheable: true }, listener.events);
    await waitFor(listener.ended);
    expect(listener.audio).toEqual(["AAA="]);
    expect(backend.synthesize).toHaveBeenCalledTimes(1);
  });

  it("does not cache dynamic text or failed lines", async () => {
    const backend = inner();
    const tts = new CachedTts(backend);
    tts.synthesize({ text: "dynamic", lang: "en" }, capture().events);
    tts.synthesize({ text: "dynamic", lang: "en" }, capture().events);
    expect(backend.synthesize).toHaveBeenCalledTimes(2);

    backend.synthesize.mockImplementationOnce((_request, events) => {
      events.onError({ code: "x", message: "y" });
      return { cancel() {} };
    });
    tts.synthesize({ text: "flaky", lang: "en", cacheable: true }, capture().events);
    tts.synthesize({ text: "flaky", lang: "en", cacheable: true }, capture().events);
    expect(backend.synthesize).toHaveBeenCalledTimes(4);
  });
});
