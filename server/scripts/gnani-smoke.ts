// One short live check of every Gnani path Ayu depends on. Spends a few seconds of credits.
// Usage: npm run gnani:smoke
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaAdapter } from "../src/adapters/prisma.js";
import { TimbreAdapter } from "../src/adapters/timbre.js";
import { config } from "../src/config.js";

const SAMPLE = "Mere papa gir gaye hain, Gomti Nagar mein petrol pump ke paas hain.";
const { apiKey } = config.gnani;
if (!apiKey) throw new Error("Set GNANI_API_KEY in .env first");

const outDir = resolve(import.meta.dirname, "../../eval/results");
mkdirSync(outDir, { recursive: true });

const results: Array<[string, "PASS" | "FAIL", string]> = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push([name, ok ? "PASS" : "FAIL", detail]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
};

async function ttsRest(): Promise<Buffer | null> {
  const started = performance.now();
  const response = await fetch(config.gnani.ttsRestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key-ID": apiKey },
    body: JSON.stringify({
      text: SAMPLE,
      model: config.timbre.model,
      voice: config.timbre.voices.hinglish,
      language: "hi-en",
      audio_config: { sample_rate: 16000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" },
    }),
  });
  if (!response.ok) {
    record("Timbre REST", false, `HTTP ${response.status} ${await response.text()}`);
    return null;
  }
  const wav = Buffer.from(await response.arrayBuffer());
  writeFileSync(resolve(outDir, "smoke-timbre.wav"), wav);
  record("Timbre REST", true, `${wav.length} bytes in ${Math.round(performance.now() - started)} ms`);
  return wav;
}

function ttsStream(label = "Timbre stream") {
  const adapter = new TimbreAdapter({ url: config.gnani.ttsUrl, apiKey, ...config.timbre });
  return new Promise<void>((done) => {
    const started = performance.now();
    let firstAudio = 0;
    let bytes = 0;
    adapter.synthesize({ text: SAMPLE, lang: "hinglish" }, {
      onAudio(data) {
        firstAudio ||= performance.now() - started;
        bytes += Buffer.from(data, "base64").length;
      },
      onEnd() {
        record(label, bytes > 0, `first audio ${Math.round(firstAudio)} ms, ${bytes} bytes`);
        done();
      },
      onError({ code, message }) {
        record(label, false, `${code} ${message}`);
        done();
      },
    });
  });
}

// Some accounts allow one active request at a time. SOS needs Ayu to speak while Prisma listens.
function speakWhileListening() {
  const adapter = new PrismaAdapter({ url: config.gnani.sttUrl, apiKey, ...config.prisma });
  return new Promise<void>((done) => {
    const session = adapter.open({ lang: "hinglish" }, {
      async onReady() {
        await ttsStream("Timbre during open Prisma session");
        session.close();
        done();
      },
      onSpeechStart() {},
      onProcessing() {},
      onTranscript() {},
      onError({ code, message, fatal }) {
        if (!fatal) return;
        record("Timbre during open Prisma session", false, `${code} ${message}`);
        done();
      },
      onClose() {},
    });
  });
}

async function sttRest(wav: Buffer) {
  const form = new FormData();
  form.append("audio_file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "smoke.wav");
  form.append("language_code", "hi-IN");
  form.append("model", config.prisma.model);
  form.append("format", config.prisma.format);
  const response = await fetch(config.gnani.sttRestUrl, { method: "POST", headers: { "X-API-Key-ID": apiKey }, body: form });
  const body = await response.text();
  record("Prisma REST", response.ok, response.ok ? JSON.parse(body).transcript : `HTTP ${response.status} ${body}`);
}

function sttStream(wav: Buffer) {
  const adapter = new PrismaAdapter({ url: config.gnani.sttUrl, apiKey, ...config.prisma });
  const pcm = wav.subarray(44); // canonical 44-byte WAV header
  return new Promise<void>((done) => {
    const finish = (ok: boolean, detail: string) => {
      clearTimeout(timeout);
      clearInterval(pump);
      record("Prisma stream", ok, detail);
      session.close();
      done();
    };
    const timeout = setTimeout(() => finish(false, "no transcript within 30 s"), 30000);
    let offset = 0;
    let pump: NodeJS.Timeout;
    const session = adapter.open({ lang: "hinglish" }, {
      onReady(serverConfig) {
        console.log(`      connected config: ${JSON.stringify(serverConfig)}`);
        pump = setInterval(() => {
          session.sendAudio(pcm.subarray(offset, offset + 1024));
          offset += 1024;
          if (offset >= pcm.length) {
            clearInterval(pump);
            session.commit();
          }
        }, 32); // real-time pace, as Prisma requires
      },
      onSpeechStart: () => console.log("      speech_start received"),
      onProcessing: () => console.log("      processing received"),
      onTranscript: ({ text, latencyMs, detectedLang }) =>
        finish(Boolean(text), `"${text}" (${latencyMs} ms, ${detectedLang ?? "no language reported"})`),
      onError: ({ code, message, fatal }) => {
        if (fatal) finish(false, `${code} ${message}`);
        else console.log(`      recoverable: ${code} ${message}`);
      },
      onClose() {},
    });
  });
}

console.log(`Prisma ${config.prisma.model}/${config.prisma.format}, Timbre ${config.timbre.model}\n`);
await ttsStream();
const wav = await ttsRest();
if (wav) {
  await sttRest(wav);
  await sttStream(wav);
}
await speakWhileListening();
const failed = results.filter(([, status]) => status === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed. Paste this output into PLAN.md section 6.`);
process.exit(failed ? 1 : 0);
