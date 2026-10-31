import { afterEach, describe, expect, it, vi } from "vitest";
import { TimbreAdapter, type TimbreOptions } from "../src/adapters/timbre.js";
import type { TtsEvents } from "../src/adapters/types.js";
import { fakeServer, waitFor } from "./helpers.js";

const options: TimbreOptions = {
  url: "",
  apiKey: "test-key",
  model: "timbre-v2.5",
  speed: 1,
  sampleRate: 24000,
  voices: { hi: "Yashvi", hinglish: "Poorvi", en: "Kaveri" },
};

const events = (): TtsEvents => ({ onAudio: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });

let cleanup: (() => unknown) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("TimbreAdapter", () => {
  it("maps language to a voice and asks for raw PCM", () => {
    const request = new TimbreAdapter(options).buildRequest("namaste", "hinglish");
    expect(request).toMatchObject({ voice: "Poorvi", language: "hi-en", model: "timbre-v2.5" });
    expect(request.audio_config).toMatchObject({ container: "raw", encoding: "linear_pcm", sample_rate: 24000 });
  });

  it("streams audio then ends, authenticating with the documented header", async () => {
    let apiKey: unknown;
    let sent: any;
    const server = await fakeServer((socket, headers) => {
      apiKey = headers["x-api-key-id"];
      socket.on("message", (data) => {
        sent = JSON.parse(data.toString());
        socket.send(JSON.stringify({ type: "start", message: "ok", request_id: "r1" }));
        socket.send(JSON.stringify({ type: "audio", data: { chunk_index: 0, audio: "AAA=", is_final: false } }));
        socket.send(JSON.stringify({ type: "complete", data: { chunk_index: 1, audio: "", is_final: true } }));
      });
    });
    cleanup = server.close;

    const handlers = events();
    new TimbreAdapter({ ...options, url: server.url }).synthesize({ text: "namaste", lang: "hi" }, handlers);
    await waitFor(() => vi.mocked(handlers.onEnd).mock.calls.length === 1);
    expect(apiKey).toBe("test-key");
    expect(sent.voice).toBe("Yashvi");
    expect(handlers.onAudio).toHaveBeenCalledWith("AAA=");
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("reports server errors once and treats an early close as a failure", async () => {
    const server = await fakeServer((socket) => socket.close());
    cleanup = server.close;
    const handlers = events();
    new TimbreAdapter({ ...options, url: server.url }).synthesize({ text: "x", lang: "en" }, handlers);
    await waitFor(() => vi.mocked(handlers.onError).mock.calls.length === 1);
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it("stays silent after cancel", async () => {
    const server = await fakeServer((socket) => {
      socket.on("message", () => socket.send(JSON.stringify({ type: "audio", data: { audio: "AAA=" } })));
    });
    cleanup = server.close;
    const handlers = events();
    const handle = new TimbreAdapter({ ...options, url: server.url }).synthesize({ text: "x", lang: "en" }, handlers);
    handle.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(handlers.onAudio).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });
});
