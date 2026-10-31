import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { MockPrisma, MockTimbre } from "../src/adapters/mocks.js";
import { buildApp, type AppDeps } from "../src/app.js";
import { CaseStore } from "../src/cases/store.js";
import { SOS_OPENING } from "../src/dialogue/lines.js";
import type { ClientMessage, ServerMessage } from "../src/types/voice.js";
import { waitFor } from "./helpers.js";

const limits = { maxSessions: 1, sessionMaxSeconds: 60, maxTtsChars: 20 };
let app: Awaited<ReturnType<typeof buildApp>>;

const testDeps = (overrides: Partial<AppDeps> = {}): AppDeps => ({
  stt: new MockPrisma(),
  tts: new MockTimbre(),
  cases: new CaseStore(),
  voiceMode: "mock",
  voiceLab: true,
  limits,
  dashboardSecret: "secret",
  production: false,
  ...overrides,
});

async function connect(overrides: Partial<AppDeps> = {}, sessionId = "test") {
  app = await buildApp(testDeps(overrides));
  await app.listen({ port: 0, host: "127.0.0.1" });
  return client(`ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws/voice/${sessionId}`);
}

function client(url: string) {
  const socket = new WebSocket(url);
  const messages: ServerMessage[] = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  const has = (type: ServerMessage["type"]) => messages.some((message) => message.type === type);
  return {
    socket,
    messages,
    has,
    send: (message: ClientMessage) => socket.send(JSON.stringify(message)),
    until: (type: ServerMessage["type"]) => waitFor(() => has(type)),
  };
}

const speech = () => {
  const frame = Buffer.alloc(1024);
  for (let i = 0; i < 512; i++) frame.writeInt16LE(i % 2 ? 8000 : -8000, i * 2);
  return frame;
};

afterEach(() => app.close());

describe("voice gateway", () => {
  it("reports health without exposing secrets", async () => {
    app = await buildApp(testDeps());
    const response = await app.inject({ url: "/api/health" });
    expect(response.json()).toEqual({ ok: true, voiceMode: "mock", voiceLab: true });
  });

  it("runs mic audio to transcript to spoken echo", async () => {
    const voice = await connect();
    await voice.until("session.ready");
    voice.send({ type: "start", lang: "hinglish", echo: true });
    await voice.until("stt.ready");

    voice.socket.send(speech());
    await voice.until("speech.start");
    voice.send({ type: "commit" });
    await voice.until("transcript.final");
    await voice.until("tts.audio");
    await voice.until("tts.end");

    const order = voice.messages.map((message) => message.type);
    expect(order.indexOf("transcript.processing")).toBeLessThan(order.indexOf("transcript.final"));
    expect(order.indexOf("tts.start")).toBeGreaterThan(order.indexOf("transcript.final"));
    const end = voice.messages.find((message) => message.type === "tts.end");
    expect(end).toMatchObject({ type: "tts.end" });
    expect((end as { firstAudioMs: number }).firstAudioMs).toBeGreaterThan(0);
  });

  it("stops audio on stop_speaking and caps text length", async () => {
    const voice = await connect();
    await voice.until("session.ready");
    voice.send({ type: "say", text: "x".repeat(100), lang: "en" });
    await voice.until("tts.audio");
    voice.send({ type: "stop_speaking" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const count = voice.messages.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(voice.messages.length).toBe(count);
    const start = voice.messages.find((message) => message.type === "tts.start");
    expect((start as { text: string }).text).toHaveLength(20);
  });

  it("refuses sessions with no case when the voice lab is off", async () => {
    const voice = await connect({ voiceLab: false });
    await voice.until("error");
    expect(voice.messages[0]).toMatchObject({ code: "not_allowed", fatal: true });
  });

  it("speaks the fixed opening for an SOS case, ignores client text and logs turns", async () => {
    const cases = new CaseStore();
    const sos = cases.create({ lang: "hi" });
    const voice = await connect({ cases, voiceLab: false }, sos.id);
    await voice.until("session.ready");
    voice.send({ type: "start", lang: "en" });
    await voice.until("tts.start");
    expect(voice.messages.find((message) => message.type === "tts.start")).toMatchObject({ text: SOS_OPENING.hi });
    await voice.until("tts.end");

    voice.send({ type: "say", text: "anything", lang: "en" });
    voice.send({ type: "first_audio", ms: 321.4 });
    voice.socket.send(speech());
    await voice.until("speech.start");
    voice.send({ type: "commit" });
    await voice.until("transcript.final");
    await waitFor(() => sos.metrics.turns === 1);

    expect(voice.messages.filter((message) => message.type === "tts.start")).toHaveLength(1);
    expect(sos.metrics.activationToFirstLineMs).toBe(321);
    expect(cases.eventsFor(sos.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(["sos_tap", "dispatch_requested", "ayu_utterance", "user_utterance"]),
    );
  });

  it("closes the voice session when the case is cancelled, and refuses to reopen it", async () => {
    const cases = new CaseStore();
    const sos = cases.create({ lang: "en" });
    const voice = await connect({ cases }, sos.id);
    await voice.until("session.ready");
    cases.cancel(sos.id);
    await waitFor(() => voice.socket.readyState === voice.socket.CLOSED);

    const again = client(voice.socket.url);
    await again.until("error");
    expect(again.messages[0]).toMatchObject({ code: "not_allowed" });
  });

  it("rejects sessions over the limit and frees the slot on close", async () => {
    const first = await connect();
    await first.until("session.ready");
    const url = first.socket.url;

    const second = client(url);
    await second.until("error");
    expect(second.messages[0]).toMatchObject({ code: "busy", fatal: true });

    first.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const third = client(url);
    await third.until("session.ready");
  });
});
