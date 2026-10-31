// Compares Gemini models on scripted caller lines (no real data). Usage: npm run gemini:check -- model-a model-b
import { GeminiAdapter } from "../src/adapters/llm.js";
import { config } from "../src/config.js";

const { apiKey } = config.gemini;
if (!apiKey) throw new Error("Set GEMINI_API_KEY in .env first");

const CASES: { text: string; expect: Record<string, unknown> }[] = [
  { text: "मेरे पापा गिर गए हैं, Gomti Nagar में petrol pump के पास हैं", expect: { emergencyType: "collapse" } },
  { text: "वो सांस नहीं ले रहे और जवाब भी नहीं दे रहे", expect: { responsive: false, breathingNormally: false } },
  { text: "खाना खाते हुए गले में कुछ अटक गया है, बोल नहीं पा रहा", expect: { emergencyType: "choking" } },
  { text: "accident हो गया है, बहुत खून निकल रहा है", expect: { emergencyType: "bleeding" } },
  { text: "सीने में दबाव है और पसीना आ रहा है, होश में हैं", expect: { emergencyType: "cardiac", responsive: true } },
  { text: "अचानक मुँह टेढ़ा हो गया और हाथ नहीं उठ रहा", expect: { emergencyType: "stroke_signs" } },
  { text: "pata nahi kya hua", expect: { responsive: null, breathingNormally: null } },
];

const models = process.argv.slice(2);
for (const model of models.length ? models : [config.gemini.model]) {
  const adapter = new GeminiAdapter({ apiKey, model, timeoutMs: 8000 });
  const times: number[] = [];
  let correct = 0;
  let failed = 0;
  for (const { text, expect } of CASES) {
    const started = performance.now();
    const result = await adapter.extract([text]);
    times.push(Math.round(performance.now() - started));
    if (!result) {
      failed++;
      continue;
    }
    const fields = result as unknown as Record<string, unknown>;
    if (Object.entries(expect).every(([key, value]) => fields[key] === value)) correct++;
    else console.log(`   miss: ${text} -> ${Object.keys(expect).map((key) => `${key}=${fields[key]}`).join(", ")}`);
  }
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`${model}: ${correct}/${CASES.length} correct, ${failed} failed, median ${sorted[Math.floor(sorted.length / 2)]} ms, worst ${sorted.at(-1)} ms`);
}
