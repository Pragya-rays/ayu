import { config } from "../config.js";
import { CachedTts } from "./cachedTts.js";
import { MockPrisma, MockTimbre } from "./mocks.js";
import { PrismaAdapter } from "./prisma.js";
import { TimbreAdapter } from "./timbre.js";
import type { STTAdapter } from "./types.js";

export function createVoiceAdapters(): { stt: STTAdapter; tts: CachedTts } {
  if (config.voiceMode === "mock") return { stt: new MockPrisma(), tts: new CachedTts(new MockTimbre()) };
  return {
    stt: new PrismaAdapter({ url: config.gnani.sttUrl, apiKey: config.gnani.apiKey, ...config.prisma }),
    tts: new CachedTts(new TimbreAdapter({ url: config.gnani.ttsUrl, apiKey: config.gnani.apiKey, ...config.timbre })),
  };
}
