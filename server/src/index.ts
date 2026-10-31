import { createVoiceAdapters } from "./adapters/index.js";
import { GeminiAdapter, NoLLM } from "./adapters/llm.js";
import { buildApp } from "./app.js";
import { CaseStore } from "./cases/store.js";
import { config } from "./config.js";
import { ASK_RESPONSIVE, SOS_OPENING } from "./dialogue/lines.js";
import { loadProtocols } from "./protocols/index.js";
import type { Lang } from "./types/voice.js";

const protocols = loadProtocols();
const { stt, tts } = createVoiceAdapters();
const llm = config.gemini.apiKey ? new GeminiAdapter(config.gemini) : new NoLLM();
const app = await buildApp({
  stt,
  tts,
  llm,
  protocols,
  cases: new CaseStore(),
  voiceMode: config.voiceMode,
  voiceLab: config.voiceLab,
  limits: config.limits,
  dashboardSecret: config.dashboardSecret,
  production: config.production,
});
await app.listen({ port: config.port, host: "0.0.0.0" });
app.log.info(`Voice mode: ${config.voiceMode}, voice lab: ${config.voiceLab}, LLM: ${config.gemini.apiKey ? config.gemini.model : "rules only"}`);

// Other fixed lines cache on first use, which keeps credit use per server start low.
const firstLines = [SOS_OPENING, ASK_RESPONSIVE].flatMap((line) =>
  Object.entries(line).map(([lang, text]) => ({ lang: lang as Lang, text })));
void tts.warm(firstLines).then(() => app.log.info("SOS opening lines ready"));
