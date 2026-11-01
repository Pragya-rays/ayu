// Scorecard from SYNTHETIC calls: Timbre speech mixed with generated noise, sent through real Prisma,
// Gemini and the SOS machine. It measures the pipeline, not real panicked callers. Spends credits.
// Usage: npm run eval:synthetic -w server   Writes eval/results/scorecard-synthetic.md
// Add -- --stream to send whole calls, answers included, through the live Prisma stream the app uses.
// That runs in real time, so it takes about 15 minutes. Writes eval/results/scorecard-stream.md
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GeminiAdapter, NoLLM } from "../src/adapters/llm.js";
import { PrismaAdapter } from "../src/adapters/prisma.js";
import { CaseStore } from "../src/cases/store.js";
import { config } from "../src/config.js";
import { parseAnswer } from "../src/dialogue/ruleExtract.js";
import { SosMachine } from "../src/dialogue/sosMachine.js";
import { loadProtocols } from "../src/protocols/index.js";

const { apiKey, sttRestUrl, ttsRestUrl } = config.gnani;
if (!apiKey || !config.gemini.apiKey) throw new Error("Set GNANI_API_KEY and GEMINI_API_KEY in .env first");

const RATE = 16000;
const GEMINI_GAP_MS = 4500; // free tier allows 15 requests a minute
const STREAM = process.argv.includes("--stream");
const FRAME_BYTES = 1024;
const FRAME_MS = 32;
const TRAILING_SILENCE_MS = 1200;
const TRANSCRIPT_WAIT_MS = 2500;

const SCENARIOS = [
  { id: "E1", text: "मेरे दोस्त को अचानक तेज़ सिर दर्द हुआ और वो गिर गया, हम हज़रतगंज चौराहे के पास हैं", answers: ["नहीं जवाब नहीं दे रहा", "हाँ सांस ले रहा है"], protocol: "recovery_stroke_collapse", landmark: /हज़रतगंज|हजरतगंज|hazratganj/i },
  { id: "E2", text: "पापा गिर गए हैं, गोमती नगर में petrol pump के पास, जल्दी आइए", answers: ["नहीं", "नहीं सांस नहीं ले रहे"], protocol: "cpr", landmark: /गोमती|gomti/i },
  { id: "E3", text: "खाना खाते हुए गले में कुछ अटक गया है, बोल नहीं पा रहा, अमीनाबाद में हैं", answers: ["हाँ सुन रहा है", "पता नहीं"], protocol: "choking", landmark: /अमीनाबाद|aminabad/i },
  { id: "E4", text: "road accident हो गया है, बहुत खून निकल रहा है, अलीगंज के पास, मेरा नंबर है 9876543210", answers: ["हाँ", "हाँ"], protocol: "severe_bleeding", landmark: /अलीगंज|aliganj/i, number: "9876543210" },
  { id: "E5", text: "सीने में बहुत दबाव है और पसीना आ रहा है, इंदिरा नगर में हैं", answers: ["हाँ बात कर रहे हैं", "हाँ"], protocol: "chest_pain_conscious", landmark: /इंदिरा|indira/i },
];
const SHORT_WORDS = [{ text: "हाँ", expected: "yes" }, { text: "नहीं", expected: "no" }] as const;
const VOICES = [{ voice: "Poorvi", language: "hi-en" }, { voice: "Yashvi", language: "hi-IN" }];

let seed = 12345;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const rms = (samples: Float64Array) => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) || 1;

function fanNoise(length: number) {
  const noise = new Float64Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) noise[i] = last = 0.98 * last + (random() * 2 - 1) * 0.2;
  return noise;
}

function streetNoise(length: number) {
  const noise = fanNoise(length);
  for (let i = 0; i < length; i++) noise[i] = noise[i]! + (random() * 2 - 1) * 0.15;
  for (let horn = 0; horn < length / RATE / 2; horn++) {
    const start = Math.floor(random() * length);
    const frequency = 400 + random() * 400;
    for (let i = 0; i < RATE * 0.4 && start + i < length; i++) noise[start + i] = noise[start + i]! + Math.sin((2 * Math.PI * frequency * i) / RATE) * 0.5;
  }
  return noise;
}

function mix(speech: Float64Array, noise: Float64Array, snrDb: number) {
  const gain = rms(speech) / rms(noise) / 10 ** (snrDb / 20);
  return speech.map((value, index) => value + noise[index]! * gain);
}

const CONDITIONS: { name: string; rate: number; apply(speech: Float64Array): Float64Array }[] = [
  { name: "clean", rate: RATE, apply: (speech) => speech },
  { name: "fan, 10 dB", rate: RATE, apply: (speech) => mix(speech, fanNoise(speech.length), 10) },
  { name: "street, 5 dB", rate: RATE, apply: (speech) => mix(speech, streetNoise(speech.length), 5) },
  { name: "phone 8 kHz, street 10 dB", rate: 8000, apply: (speech) => mix(speech, streetNoise(speech.length), 10) },
];

function toWav(samples: Float64Array, rate: number) {
  const step = RATE / rate;
  const count = Math.floor(samples.length / step);
  const data = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += samples[i * step + j]!;
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / step))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function speak(text: string, voice: { voice: string; language: string }) {
  const response = await fetch(ttsRestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key-ID": apiKey },
    body: JSON.stringify({
      text,
      model: "timbre-v2.5",
      ...voice,
      audio_config: { sample_rate: RATE, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "raw" },
    }),
  });
  if (!response.ok) throw new Error(`Timbre ${response.status}: ${await response.text()}`);
  const pcm = Buffer.from(await response.arrayBuffer());
  return Float64Array.from({ length: Math.floor(pcm.length / 2) }, (_, index) => pcm.readInt16LE(index * 2));
}

async function transcribe(wav: Buffer) {
  const form = new FormData();
  form.append("audio_file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "call.wav");
  form.append("language_code", "hi-IN");
  form.append("model", config.prisma.model);
  form.append("format", config.prisma.format);
  form.append("keyterms", config.prisma.keyterms.join(","));
  const started = performance.now();
  const response = await fetch(sttRestUrl, { method: "POST", headers: { "X-API-Key-ID": apiKey }, body: form });
  const body = (await response.json()) as { transcript?: string };
  return { text: response.ok ? body.transcript ?? "" : `ERROR ${response.status}`, ms: Math.round(performance.now() - started) };
}

/** Real-time 16 kHz PCM. Phone quality is kept by averaging to 8 kHz, then holding each sample. */
function toStreamPcm(samples: Float64Array, rate: number) {
  const step = RATE / rate;
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const start = i - (i % step);
    let sum = 0;
    for (let j = 0; j < step; j++) sum += samples[start + j] ?? 0;
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / step))), i * 2);
  }
  return pcm;
}

/** Sends one utterance at real-time pace, as a phone does, with the app's own Prisma settings. */
function transcribeStream(samples: Float64Array, rate: number) {
  const adapter = new PrismaAdapter({ url: config.gnani.sttUrl, apiKey, ...config.prisma });
  const pcm = Buffer.concat([toStreamPcm(samples, rate), Buffer.alloc((TRAILING_SILENCE_MS / 1000) * RATE * 2)]);
  const texts: string[] = [];
  const started = performance.now();
  let latency = 0;
  return new Promise<{ text: string; ms: number }>((done) => {
    let offset = 0;
    let pump: NodeJS.Timeout | undefined;
    let finished = false;
    const finish = (error?: string) => {
      if (finished) return;
      finished = true;
      clearInterval(pump);
      clearTimeout(limit);
      session.close();
      done({ text: error ? `ERROR ${error}` : texts.join(" ").trim(), ms: latency || Math.round(performance.now() - started) });
    };
    const limit = setTimeout(() => finish(), (pcm.length / 2 / RATE) * 1000 + 10000);
    const session = adapter.open({ lang: "hinglish" }, {
      onReady() {
        pump = setInterval(() => {
          session.sendAudio(pcm.subarray(offset, offset + FRAME_BYTES));
          offset += FRAME_BYTES;
          if (offset >= pcm.length) {
            clearInterval(pump);
            setTimeout(() => finish(), TRANSCRIPT_WAIT_MS);
          }
        }, FRAME_MS);
      },
      onSpeechStart() {},
      onProcessing() {},
      onTranscript({ text, latencyMs }) {
        if (text.trim()) texts.push(text.trim());
        latency = latencyMs ?? latency;
      },
      onError({ code, message, fatal }) {
        if (fatal) finish(`${code} ${message}`);
      },
      onClose() {},
    });
  });
}

const NUMBER_WORDS: Record<string, string> = {
  "शून्य": "0", "ज़ीरो": "0", "जीरो": "0", "एक": "1", "दो": "2", "तीन": "3", "चार": "4", "पाँच": "5", "पांच": "5",
  "छह": "6", "छः": "6", "छे": "6", "सात": "7", "आठ": "8", "नौ": "9", zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const digitsIn = (text: string) => text.toLowerCase().split(/[\s,.।-]+/).map((word) => NUMBER_WORDS[word] ?? word.replace(/\D/g, "")).join("");

async function runMachine(transcript: string, answers: string[]) {
  const cases = new CaseStore();
  const sos = cases.create({ lang: "hi" });
  const gemini = new GeminiAdapter(config.gemini);
  let first = true;
  const noLlm = new NoLLM();
  // One Gemini call per clip keeps within the free limit. Follow-up answers here are typed, not heard.
  const llm = { extract: (lines: string[]) => (first ? ((first = false), gemini.extract(lines)) : noLlm.extract()) };
  const machine = new SosMachine(sos.id, "hi", { cases, llm, protocols, addressFor: async () => null }, {
    async say() {},
    interrupt() {},
    publish() {},
  });
  await machine.begin();
  await machine.onUtterance(transcript);
  for (const answer of answers) {
    if (answer.trim()) await machine.onUtterance(answer);
    else await machine.onEmptyTranscript();
  }
  await new Promise((done) => setTimeout(done, 1500));
  await machine.onUtterance("");
  machine.stop();
  return sos;
}

const clips = new Map<string, Float64Array>();
async function spokenClip(text: string, voice: { voice: string; language: string }) {
  const key = `${voice.voice}:${text}`;
  const known = clips.get(key);
  if (known) return known;
  const speech = await speak(text, voice);
  clips.set(key, speech);
  return speech;
}

const hear = (speech: Float64Array, condition: (typeof CONDITIONS)[number]) => {
  const noisy = condition.apply(speech);
  return STREAM ? transcribeStream(noisy, condition.rate) : transcribe(toWav(noisy, condition.rate));
};

async function sequentially<T, R>(items: T[], run: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (const item of items) results.push(await run(item));
  return results;
}

const protocols = loadProtocols();
const percent = (hits: number, total: number) => `${hits}/${total} (${Math.round((hits / total) * 100)}%)`;
const callRows: string[] = [];
const failures: string[] = [];
const tally: Record<string, { calls: number; protocol: number; landmark: number; number: number; numberTotal: number; ms: number[] }> = {};
const shortTally: Record<string, { total: number; correct: number }> = {};

for (const voice of VOICES) {
  for (const scenario of SCENARIOS) {
    const speech = await spokenClip(scenario.text, voice);
    for (const condition of CONDITIONS) {
      const { text, ms } = await hear(speech, condition);
      // In stream mode the answers go through the same noise and the same live path.
      const answers = STREAM
        ? await sequentially(scenario.answers, async (answer) => (await hear(await spokenClip(answer, voice), condition)).text)
        : scenario.answers;
      const sos = await runMachine(text, answers);
      const protocolOk = sos.protocolId === scenario.protocol;
      const landmarkOk = scenario.landmark.test(text);
      const numberOk = scenario.number ? digitsIn(text).includes(scenario.number) : null;
      const row = (tally[condition.name] ??= { calls: 0, protocol: 0, landmark: 0, number: 0, numberTotal: 0, ms: [] });
      row.calls++;
      row.protocol += Number(protocolOk);
      row.landmark += Number(landmarkOk);
      row.ms.push(ms);
      if (numberOk !== null) {
        row.numberTotal++;
        row.number += Number(numberOk);
      }
      const passed = protocolOk && landmarkOk && numberOk !== false;
      console.log(`${passed ? "PASS" : "MISS"} ${scenario.id} ${voice.voice} ${condition.name}: ${sos.protocolId} | ${text}`);
      if (!passed) {
        const why = [!protocolOk && `protocol ${sos.protocolId} instead of ${scenario.protocol}`, !landmarkOk && "landmark lost", numberOk === false && "number wrong"].filter(Boolean).join("; ");
        const heard = STREAM ? `${text} // answers: ${answers.join(" / ") || "none"}` : text;
        failures.push(`| ${scenario.id} | ${voice.voice} | ${condition.name} | ${why} | ${heard.replaceAll("|", "/")} |`);
      }
      callRows.push(`| ${scenario.id} | ${voice.voice} | ${condition.name} | ${sos.protocolId} | ${protocolOk ? "yes" : "no"} | ${landmarkOk ? "yes" : "no"} |`);
      await new Promise((done) => setTimeout(done, GEMINI_GAP_MS));
    }
  }
  for (const word of SHORT_WORDS) {
    const speech = await spokenClip(word.text, voice);
    for (const condition of CONDITIONS) {
      const { text } = await hear(speech, condition);
      const row = (shortTally[condition.name] ??= { total: 0, correct: 0 });
      row.total++;
      const correct = parseAnswer("responsive", text) === word.expected;
      row.correct += Number(correct);
      if (!correct) failures.push(`| "${word.text}" | ${voice.voice} | ${condition.name} | short answer misread | ${text.replaceAll("|", "/")} |`);
    }
  }
}

const sumOf = (pick: (row: (typeof tally)[string]) => number) => Object.values(tally).reduce((sum, row) => sum + pick(row), 0);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const lines = [
  "# Ayu synthetic scorecard",
  "",
  `**Generated ${new Date().toISOString().slice(0, 10)}. These are SYNTHETIC calls, not real people.** Speech came from two Timbre voices, and the noise was generated by script. Real panicked callers will perform worse, so treat this as a pipeline check, not as proof of field accuracy.`,
  "",
  `Pipeline: Timbre speech, generated noise, Prisma ${config.prisma.model} (${config.prisma.format}), Gemini ${config.gemini.model}, then Ayu's triage rules. ${STREAM
    ? "Whole calls, including every answer, went through noise and the live Prisma stream the app uses, at real-time pace with the app's own settings. Phone quality was simulated by reducing audio to 8 kHz. A microphone and a real room were not involved."
    : "Follow-up answers were fed as text, so only the first sentence and the short-word test passed through noise. Audio was sent to Prisma as files, not through the live stream the app uses."} The landmark list given to Prisma held only one of these five places, Gomti Nagar.`,
  "",
  "## Results",
  "",
  "| Condition | Calls | Correct protocol | Landmark kept | Phone number | Median Prisma time |",
  "|---|---|---|---|---|---|",
  ...Object.entries(tally).map(([name, row]) => `| ${name} | ${row.calls} | ${percent(row.protocol, row.calls)} | ${percent(row.landmark, row.calls)} | ${row.numberTotal ? percent(row.number, row.numberTotal) : "n/a"} | ${median(row.ms)} ms |`),
  `| **All** | **${sumOf((row) => row.calls)}** | **${percent(sumOf((row) => row.protocol), sumOf((row) => row.calls))}** | **${percent(sumOf((row) => row.landmark), sumOf((row) => row.calls))}** | **${percent(sumOf((row) => row.number), sumOf((row) => row.numberTotal))}** | |`,
  "",
  "## Short answers (\"haan\" and \"nahi\")",
  "",
  "| Condition | Read correctly |",
  "|---|---|",
  ...Object.entries(shortTally).map(([name, row]) => `| ${name} | ${percent(row.correct, row.total)} |`),
  "",
  `## Failures (${failures.length})`,
  "",
  ...(failures.length ? ["| Case | Voice | Condition | What went wrong | Transcript |", "|---|---|---|---|---|", ...failures] : ["None in this run."]),
  "",
  "## Every call",
  "",
  "| Case | Voice | Condition | Protocol | Correct | Landmark kept |",
  "|---|---|---|---|---|---|",
  ...callRows,
  "",
];
writeFileSync(resolve(import.meta.dirname, `../../eval/results/${STREAM ? "scorecard-stream" : "scorecard-synthetic"}.md`), lines.join("\n"));
console.log(`\nDone. ${failures.length} failures.`);
process.exit(0);
