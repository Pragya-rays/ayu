// Generates short pronunciation samples to compare by ear. Spends a few Timbre credits.
// Output goes to eval/results/spike-voice-*.wav, which git ignores. Usage: npm run voice:samples -w server
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { config } from "../src/config.js";

const LATIN = "Aapko kya takleef hai? Kya seene mein dard hai?";
const DEVANAGARI = "आपको क्या तकलीफ़ है? क्या सीने में दर्द है?";

const SAMPLES = [
  { file: "A-current-poorvi-latin", model: "timbre-v2.5", voice: "Poorvi", language: "hi-en", text: LATIN },
  { file: "B-poorvi-hindi-script", model: "timbre-v2.5", voice: "Poorvi", language: "hi-en", text: DEVANAGARI },
  { file: "C-yashvi-hindi-script", model: "timbre-v2.5", voice: "Yashvi", language: "hi-IN", text: DEVANAGARI },
  { file: "D-shivani-v3-hindi-script", model: "timbre-v3.0", voice: "Shivani", language: "hi-IN", text: DEVANAGARI },
];

for (const { file, ...sample } of SAMPLES) {
  const response = await fetch(config.gnani.ttsRestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key-ID": config.gnani.apiKey },
    body: JSON.stringify({
      ...sample,
      audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" },
    }),
  });
  if (!response.ok) {
    console.log(`FAIL ${file}: HTTP ${response.status} ${(await response.text()).slice(0, 160)}`);
    continue;
  }
  writeFileSync(resolve(import.meta.dirname, `../../eval/results/spike-voice-${file}.wav`), Buffer.from(await response.arrayBuffer()));
  console.log(`OK   spike-voice-${file}.wav`);
}
