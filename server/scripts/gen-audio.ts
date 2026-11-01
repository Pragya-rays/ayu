// Pre-generates every fixed line with Timbre, one request at a time. Spends credits once per line.
// Rerun after any change to fixed lines, protocol text or the voice settings: npm run gen:audio
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AUDIO_DIR, audioFileName } from "../src/adapters/cachedTts.js";
import { TimbreAdapter } from "../src/adapters/timbre.js";
import { config } from "../src/config.js";
import { CONNECTION_LOST, FIXED_LINES, SOS_OPENING } from "../src/dialogue/lines.js";
import { NORMAL_FIXED_LINES } from "../src/dialogue/normalContent.js";
import { loadHomeCare } from "../src/homecare/index.js";
import { loadProtocols } from "../src/protocols/index.js";
import type { Lang } from "../src/types/voice.js";

const { apiKey } = config.gnani;
if (!apiKey) throw new Error("Set GNANI_API_KEY in .env first");

// Partial runs keep the rest and save credits. Regenerate one language: npm run gen:audio -w server -- hinglish
// Or only lines with no audio yet: npm run gen:audio -w server -- missing
const mode = process.argv[2];
const only = mode === "missing" ? undefined : (mode as Lang | undefined);
const partial = Boolean(mode);
const LANGS: Lang[] = only ? [only] : ["en", "hi", "hinglish"];
const stepLines = [...loadProtocols().values()].flatMap((protocol) => protocol.steps.map((step) => step.text));
const cardLines = [...loadHomeCare().values()].flatMap((card) => card.steps);
const allLines = [...FIXED_LINES, ...NORMAL_FIXED_LINES, ...stepLines, ...cardLines];
const lines = LANGS.flatMap((lang) => [...new Set(allLines.map((line) => line[lang]))].map((text) => ({ lang, text })))
  .filter(({ lang, text }) => mode !== "missing" || !existsSync(resolve(AUDIO_DIR, audioFileName(lang, text))));

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

if (!partial && existsSync(AUDIO_DIR)) rmSync(AUDIO_DIR, { recursive: true });
mkdirSync(AUDIO_DIR, { recursive: true });
mkdirSync(webAudioDir, { recursive: true });
for (const { lang, text, pcm } of generated) {
  writeFileSync(resolve(AUDIO_DIR, audioFileName(lang, text)), pcm);
  if (text === SOS_OPENING[lang]) writeFileSync(resolve(webAudioDir, `opening-${lang}.pcm`), pcm);
  if (text === CONNECTION_LOST[lang]) writeFileSync(resolve(webAudioDir, `offline-${lang}.pcm`), pcm);
}

// Lines that no longer exist would otherwise stay in the repo for good.
const wanted = new Set((["en", "hi", "hinglish"] as Lang[]).flatMap((lang) => allLines.map((line) => audioFileName(lang, line[lang]))));
for (const file of readdirSync(AUDIO_DIR).filter((name) => name.endsWith(".pcm") && !wanted.has(name))) {
  rmSync(resolve(AUDIO_DIR, file));
  console.log(`Removed unused ${file}`);
}
const { model, speed, sampleRate, voices } = config.timbre;
writeFileSync(resolve(AUDIO_DIR, "manifest.json"), JSON.stringify({ model, speed, sampleRate, voices }));
console.log(`Done: ${generated.length} lines, ${generated.reduce((sum, item) => sum + item.pcm.length, 0)} bytes`);
process.exit(0);
