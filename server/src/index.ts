import { createVoiceAdapters } from "./adapters/index.js";
import { GeminiAdapter, NoLLM } from "./adapters/llm.js";
import { buildApp } from "./app.js";
import { CaseStore } from "./cases/store.js";
import { config } from "./config.js";
import { loadProtocols } from "./protocols/index.js";

const protocols = loadProtocols();
const { stt, tts } = createVoiceAdapters();
const preloaded = config.voiceMode === "real" ? tts.loadPregenerated(config.timbre) : 0;
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
app.log.info(`Voice mode: ${config.voiceMode}, voice lab: ${config.voiceLab}, LLM: ${config.gemini.apiKey ? config.gemini.model : "rules only"}, pre-generated lines: ${preloaded}`);
