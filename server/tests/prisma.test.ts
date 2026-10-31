import { afterEach, describe, expect, it, vi } from "vitest";
import { PcmFramer } from "../src/adapters/pcmFramer.js";
import { buildHeaders, languageCodeFor, PrismaAdapter, type PrismaOptions } from "../src/adapters/prisma.js";
import type { SttEvents } from "../src/adapters/types.js";
import { fakeServer, waitFor } from "./helpers.js";

const options: PrismaOptions = {
  url: "",
  apiKey: "test-key",
  model: "prisma-v3.0",
  format: "codemix",
  keyterms: ["Gomti Nagar", "petrol pump"],
  minSilenceMs: 800,
};

const events = (): SttEvents => ({
  onReady: vi.fn(),
  onSpeechStart: vi.fn(),
  onProcessing: vi.fn(),
  onTranscript: vi.fn(),
  onError: vi.fn(),
  onClose: vi.fn(),
});

let cleanup: (() => unknown) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("PcmFramer", () => {
  it("emits exact 1024-byte frames and carries the remainder", () => {
    const framer = new PcmFramer(1024);
    expect(framer.push(Buffer.alloc(1000))).toHaveLength(0);
    const frames = framer.push(Buffer.alloc(2100));
    expect(frames).toHaveLength(3);
    expect(frames.every((frame) => frame.length === 1024)).toBe(true);
  });
});

describe("Prisma headers", () => {
  it("sends documented connection settings", () => {
    const headers = buildHeaders(options, "hinglish");
    expect(headers["x-api-key-id"]).toBe("test-key");
    expect(headers["x-sample-rate"]).toBe("16000");
    expect(headers["x-min-silence-ms"]).toBe("800");
    expect(headers.language_code).toBe("hi-IN");
    expect(headers["x-model"]).toBe("prisma-v3.0");
    expect(headers.keyterms).toBe("Gomti Nagar,petrol pump");
  });

  it("uses a single language and no keyterms on v2.5", () => {
    expect(languageCodeFor("hinglish")).toBe("hi-IN");
    expect(buildHeaders({ ...options, model: "prisma-v2.5" }, "hi").keyterms).toBeUndefined();
  });
});

describe("PrismaAdapter", () => {
  it("frames audio, sends commit and maps server events", async () => {
    const received: Array<Buffer | string> = [];
    const server = await fakeServer((socket) => {
      socket.send(JSON.stringify({ type: "connected", config: { sample_rate: 16000, chunk_size: 512 } }));
      socket.on("message", (data, isBinary) => {
        received.push(isBinary ? (data as Buffer) : data.toString());
        if (!isBinary) {
          socket.send(JSON.stringify({ type: "speech_start" }));
          socket.send(JSON.stringify({ type: "processing" }));
          socket.send(JSON.stringify({ type: "transcript", text: "haan", latency: 420, detected_language_code: "hi-IN", is_final: true }));
        }
      });
    });
    cleanup = server.close;

    const handlers = events();
    const session = new PrismaAdapter({ ...options, url: server.url }).open({ lang: "hinglish" }, handlers);
    session.sendAudio(Buffer.alloc(3000)); // before open: must be queued, not lost
    await waitFor(() => vi.mocked(handlers.onReady).mock.calls.length === 1);
    session.commit();

    await waitFor(() => vi.mocked(handlers.onTranscript).mock.calls.length === 1);
    expect(handlers.onSpeechStart).toHaveBeenCalled();
    expect(handlers.onProcessing).toHaveBeenCalled();
    expect(handlers.onTranscript).toHaveBeenCalledWith({ text: "haan", latencyMs: 420, detectedLang: "hi-IN" });
    const frames = received.filter((item): item is Buffer => Buffer.isBuffer(item));
    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => frame.length === 1024)).toBe(true);
    expect(received.at(-1)).toBe('{"type":"commit"}');
    session.close();
  });

  it("keeps recoverable errors non-fatal and flags the 15-minute close as fatal", async () => {
    const server = await fakeServer((socket) => {
      socket.send(JSON.stringify({ type: "error", message: "utterance failed" }));
      socket.close(1001, "session limit");
    });
    cleanup = server.close;

    const handlers = events();
    new PrismaAdapter({ ...options, url: server.url }).open({ lang: "hi" }, handlers);
    await waitFor(() => vi.mocked(handlers.onClose).mock.calls.length === 1);
    expect(handlers.onError).toHaveBeenNthCalledWith(1, { code: "prisma_error", message: "utterance failed", fatal: false });
    expect(handlers.onError).toHaveBeenNthCalledWith(2, { code: "prisma_close_1001", message: "session limit", fatal: true });
  });
});
