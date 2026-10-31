import { createVoiceAdapters } from "./adapters/index.js";
import { buildApp } from "./app.js";
import { CaseStore } from "./cases/store.js";
import { config } from "./config.js";
import { SOS_OPENING } from "./dialogue/lines.js";
import type { Lang } from "./types/voice.js";

const { stt, tts } = createVoiceAdapters();
const app = await buildApp({
  stt,
  tts,
  cases: new CaseStore(),
  voiceMode: config.voiceMode,
  voiceLab: config.voiceLab,
  limits: config.limits,
  dashboardSecret: config.dashboardSecret,
  production: config.production,
});
await app.listen({ port: config.port, host: "0.0.0.0" });
app.log.info(`Voice mode: ${config.voiceMode}, voice lab: ${config.voiceLab}`);

const openings = Object.entries(SOS_OPENING).map(([lang, text]) => ({ lang: lang as Lang, text }));
void tts.warm(openings).then(() => app.log.info("SOS opening lines ready"));
