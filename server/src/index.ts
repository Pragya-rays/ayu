import { NoGeocoder, NominatimGeocoder } from "./adapters/geocode.js";
import { createVoiceAdapters } from "./adapters/index.js";
import { GeminiAdapter, NoLLM } from "./adapters/llm.js";
import { buildApp } from "./app.js";
import { AddressLookup } from "./cases/addresses.js";
import { CaseStore } from "./cases/store.js";
import { config } from "./config.js";
import { DispatchSimulator } from "./dispatch/simulator.js";
import { loadHomeCare } from "./homecare/index.js";
import { loadProtocols } from "./protocols/index.js";
import { NormalSessions } from "./routes/normal.js";

const protocols = loadProtocols();
const homeCare = loadHomeCare();
const { stt, tts } = createVoiceAdapters();
const preloaded = config.voiceMode === "real" ? tts.loadPregenerated(config.timbre) : 0;
const llm = config.gemini.apiKey ? new GeminiAdapter(config.gemini) : new NoLLM();
const cases = new CaseStore();
const geocoder = config.geocoder === "off" ? new NoGeocoder() : new NominatimGeocoder();
const app = await buildApp({
  stt,
  tts,
  llm,
  protocols,
  homeCare,
  normalSessions: new NormalSessions(),
  cases,
  addresses: new AddressLookup(cases, geocoder),
  dispatch: new DispatchSimulator(cases, config.dispatch),
  voiceMode: config.voiceMode,
  voiceLab: config.voiceLab,
  limits: config.limits,
  dashboardSecret: config.dashboardSecret,
  production: config.production,
});
await app.listen({ port: config.port, host: "0.0.0.0" });
app.log.info(`Voice mode: ${config.voiceMode}, voice lab: ${config.voiceLab}, LLM: ${config.gemini.apiKey ? config.gemini.model : "rules only"}, geocoder: ${config.geocoder}, pre-generated lines: ${preloaded}`);
