// Day-1 spike: compares Prisma configurations on your own noisy clips.
// Put clips (under 30 s, consented, no real patient data) in eval/audio, then: npm run gnani:spike
// Each clip is transcribed once per config below, so credits spent = clips x configs.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../src/config.js";

const CONFIGS: Array<{ name: string; fields: Record<string, string> }> = [
  { name: "v2.5 hi verbatim", fields: { language_code: "hi-IN", format: "verbatim" } },
  { name: "v2.5 en mixed", fields: { language_code: "en-IN", format: "verbatim" } },
  { name: "v3.0 codemix", fields: { model: "prisma-v3.0", language_code: "hi-IN,en-IN", format: "codemix" } },
  {
    name: "v3.0 codemix keyterms",
    fields: { model: "prisma-v3.0", language_code: "hi-IN,en-IN", format: "codemix", keyterms: config.prisma.keyterms.join(",") },
  },
];

const { apiKey, sttRestUrl } = config.gnani;
if (!apiKey) throw new Error("Set GNANI_API_KEY in .env first");

const audioDir = resolve(import.meta.dirname, "../../eval/audio");
const clips = readdirSync(audioDir).filter((file) => /\.(wav|mp3|ogg|flac|aac|m4a)$/i.test(file));
if (!clips.length) throw new Error("No clips found in eval/audio");
console.log(`${clips.length} clips x ${CONFIGS.length} configs = ${clips.length * CONFIGS.length} calls\n`);

const csv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
const rows = [["clip", "config", "seconds", "transcript"].join(",")];

for (const clip of clips) {
  const audio = readFileSync(resolve(audioDir, clip));
  console.log(clip);
  for (const { name, fields } of CONFIGS) {
    const form = new FormData();
    form.append("audio_file", new Blob([new Uint8Array(audio)]), clip);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    const response = await fetch(sttRestUrl, { method: "POST", headers: { "X-API-Key-ID": apiKey }, body: form });
    const body = (await response.json()) as { transcript?: string; end_to_end_latency?: number };
    const transcript = response.ok ? (body.transcript ?? "") : `ERROR ${response.status} ${JSON.stringify(body)}`;
    console.log(`  ${name.padEnd(24)} ${transcript}`);
    rows.push([clip, name, body.end_to_end_latency ?? "", transcript].map(csv).join(","));
  }
}

const out = resolve(import.meta.dirname, `../../eval/results/spike-${new Date().toISOString().slice(0, 10)}.csv`);
writeFileSync(out, rows.join("\n"));
console.log(`\nSaved ${out}. Score landmarks and numbers by hand.`);
