import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Lang } from "./types/voice.js";

const envPath = resolve(import.meta.dirname, "../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const env = process.env;
const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : fallback;
};
const list = (value: string | undefined) =>
  (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

const apiKey = env.GNANI_API_KEY ?? "";
const requestedMode = env.VOICE_MODE ?? "auto";
if (requestedMode === "real" && !apiKey) {
  throw new Error("VOICE_MODE=real requires GNANI_API_KEY in .env");
}

const production = env.NODE_ENV === "production";
const dashboardSecret = env.DASHBOARD_SECRET ?? (production ? "" : "ayu-dev");
if (!dashboardSecret) throw new Error("DASHBOARD_SECRET is required in production");

export const config = {
  port: num(env.PORT, 8787),
  production,
  dashboardSecret,
  // Voice Check lets the client choose what Timbre says, so it stays off on public deployments.
  voiceLab: env.VOICE_LAB ? env.VOICE_LAB === "true" : !production,
  voiceMode: (requestedMode === "mock" || !apiKey ? "mock" : "real") as "mock" | "real",
  gnani: {
    apiKey,
    sttUrl: "wss://api.vachana.ai/stt/v3/stream",
    sttRestUrl: "https://api.vachana.ai/stt/v3",
    ttsUrl: "wss://api.vachana.ai/api/v1/tts",
    ttsRestUrl: "https://api.vachana.ai/api/v1/tts/inference",
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY ?? "",
    model: env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
    timeoutMs: num(env.GEMINI_TIMEOUT_MS, 2500),
  },
  prisma: {
    model: env.PRISMA_MODEL ?? "prisma-v3.0",
    format: env.PRISMA_FORMAT ?? "codemix",
    keyterms: list(env.PRISMA_KEYTERMS),
    minSilenceMs: num(env.PRISMA_MIN_SILENCE_MS, 800),
  },
  timbre: {
    model: env.TIMBRE_MODEL ?? "timbre-v2.5",
    speed: num(env.TIMBRE_SPEED, 1),
    sampleRate: 24000,
    voices: {
      hi: env.TIMBRE_VOICE_HI ?? "Yashvi",
      hinglish: env.TIMBRE_VOICE_HINGLISH ?? "Poorvi",
      en: env.TIMBRE_VOICE_EN ?? "Kaveri",
    } satisfies Record<Lang, string>,
  },
  limits: {
    maxSessions: num(env.VOICE_MAX_SESSIONS, 3),
    sessionMaxSeconds: num(env.VOICE_SESSION_MAX_SECONDS, 600),
    maxTtsChars: 500,
  },
};
