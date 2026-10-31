// Runs Dev Guide section 14 scenarios E1-E5 through the real SOS machine, as text. Prisma is not involved.
// Usage: npm run eval:triage (uses Gemini when GEMINI_API_KEY is set; pass --rules for rules only)
import { GeminiAdapter, NoLLM, type LLMAdapter } from "../src/adapters/llm.js";
import { CaseStore } from "../src/cases/store.js";
import { config } from "../src/config.js";
import { SosMachine } from "../src/dialogue/sosMachine.js";
import { loadProtocols } from "../src/protocols/index.js";

const SCENARIOS = [
  { id: "E1", expected: "recovery_stroke_collapse", lines: ["मेरे दोस्त को अचानक तेज़ सिर दर्द हुआ और वो गिर गया", "नहीं, जवाब नहीं दे रहा", "हाँ सांस ले रहा है"] },
  { id: "E2", expected: "cpr", lines: ["पापा गिर गए हैं", "नहीं", "नहीं सांस नहीं ले रहे"] },
  { id: "E3", expected: "choking", lines: ["खाना खाते हुए गले में कुछ अटक गया, बोल नहीं पा रहा", "हाँ सुन रहा है", "नहीं पता"] },
  { id: "E4", expected: "severe_bleeding", lines: ["road accident हो गया है, बहुत खून निकल रहा है", "हाँ", "हाँ"] },
  { id: "E5", expected: "chest_pain_conscious", lines: ["सीने में बहुत दबाव है और पसीना आ रहा है", "हाँ बात कर रहे हैं", "हाँ"] },
];

const rulesOnly = process.argv.includes("--rules") || !config.gemini.apiKey;
const llm: LLMAdapter = rulesOnly ? new NoLLM() : new GeminiAdapter(config.gemini);
const protocols = loadProtocols();
let passed = 0;

for (const scenario of SCENARIOS) {
  const cases = new CaseStore();
  const sos = cases.create({ lang: "hi" });
  const spoken: string[] = [];
  const machine = new SosMachine(sos.id, "hi", {
    cases,
    llm,
    protocols,
    io: {
      async say(text) {
        spoken.push(text);
      },
      interrupt() {},
      publish() {},
    },
  });
  await machine.begin();
  for (const line of scenario.lines) await machine.onUtterance(line);
  await new Promise((resolve) => setTimeout(resolve, rulesOnly ? 0 : 3000)); // let late extractions land
  await machine.onUtterance("");
  machine.stop();

  const ok = sos.protocolId === scenario.expected && sos.severity === "RED";
  if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${scenario.id}: ${sos.severity} ${sos.protocolId}${ok ? "" : ` (expected ${scenario.expected})`}, type ${sos.triage.emergencyType ?? "-"}`);
}
console.log(`${passed}/${SCENARIOS.length} passed (${rulesOnly ? "rules only" : config.gemini.model})`);
process.exit(0);
