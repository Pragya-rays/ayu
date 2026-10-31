// Pre-generates every fixed line with Timbre, one request at a time. Spends credits once per line.
// Rerun after any change to fixed lines, protocol text or the voice settings: npm run gen:audio
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUDIO_DIR, audioFileName } from "../src/adapters/cachedTts.js";
import { TimbreAdapter } from "../src/adapters/timbre.js";
import { config } from "../src/config.js";
import { FIXED_LINES, SOS_OPENING } from "../src/dialogue/lines.js";
import { loadProtocols } from "../src/protocols/index.js";
import type { Lang } from "../src/types/voice.js";

const { apiKey } = config.gnani;
if (!apiKey) throw new Error("Set GNANI_API_KEY in .env first");

const LANGS: Lang[] = ["en", "hi", "hinglish"];
const stepLines = [...loadProtocols().values()].flatMap((protocol) => protocol.steps.map((step) => step.text));
const lines = LANGS.flatMap((lang) => [...new Set([...FIXED_LINES, ...stepLines].map((line) => line[lang]))].map((text) => ({ lang, text })));

const adapter = new TimbreAdapter({ url: config.gnani.ttsUrl, apiKey, ...config.timbre });
const webAudioDir = resolve(import.meta.dirname, "../../apps/web/public/audio");

function generate(lang: Lang, text: string) {
  return new Promise<Buffer>((done, fail) => {
    const chunks: Buffer[] = [];
    adapter.synthesize({ text, lang }, {
      onAudio: (data) => chunks.push(Buffer.from(data, "base64")),
      onEnd: () => done(Buffer.concat(chunks)),
      onError: ({ code, message }) => fail(new Error(`${code} ${message}: ${text}`)),
    });
  });
}

// Generate everything first, so a failure leaves the existing audio untouched.
const generated: { lang: Lang; text: string; pcm: Buffer }[] = [];
for (const { lang, text } of lines) {
  generated.push({ lang, text, pcm: await generate(lang, text) });
  console.log(`${generated.length}/${lines.length} ${lang}: ${text}`);
}

if (existsSync(AUDIO_DIR)) rmSync(AUDIO_DIR, { recursive: true });
mkdirSync(AUDIO_DIR, { recursive: true });
mkdirSync(webAudioDir, { recursive: true });
for (const { lang, text, pcm } of generated) {
  writeFileSync(resolve(AUDIO_DIR, audioFileName(lang, text)), pcm);
  if (text === SOS_OPENING[lang]) writeFileSync(resolve(webAudioDir, `opening-${lang}.pcm`), pcm);
}
const { model, speed, sampleRate, voices } = config.timbre;
writeFileSync(resolve(AUDIO_DIR, "manifest.json"), JSON.stringify({ model, speed, sampleRate, voices }));
console.log(`Done: ${generated.length} lines, ${generated.reduce((sum, item) => sum + item.pcm.length, 0)} bytes`);
process.exit(0);
