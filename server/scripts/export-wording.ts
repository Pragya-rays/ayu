// Writes every Hindi and Hinglish line Ayu says or shows, side by side, for a native speaker to check.
// Usage: npm run export:wording -w server   Writes docs/testing/WORDING_REVIEW.md
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { strings, type StringKey } from "../../apps/web/src/i18n/strings.js";
import { FIXED_LINES } from "../src/dialogue/lines.js";
import { NORMAL_FIXED_LINES } from "../src/dialogue/normalContent.js";

const cell = (text: string) => text.replaceAll("|", "/");
const spoken = [...FIXED_LINES, ...NORMAL_FIXED_LINES];

const onScreen = (Object.keys(strings.en) as StringKey[]).filter((key) =>
  !key.startsWith("dash") && !key.startsWith("driver") && strings.hi[key] !== strings.en[key]);

const lines = [
  "# Ayu wording review",
  "",
  "**For a native Hindi speaker.** Ayu talks to people who may be panicking, so every line should sound natural, simple and calm. Please mark **OK**, or write a better version. Hinglish should sound like everyday speech, not textbook Hindi.",
  "",
  "First-aid and home-care text is not here, because it needs medical review first.",
  "",
  `## Lines Ayu speaks (${spoken.length})`,
  "",
  "| # | English meaning | Hindi | Hinglish | Your change |",
  "|---|---|---|---|---|",
  ...spoken.map((line, index) => `| ${index + 1} | ${cell(line.en)} | ${cell(line.hi)} | ${cell(line.hinglish)} | |`),
  "",
  `## Text on screen (${onScreen.length})`,
  "",
  "| # | English meaning | Hindi | Hinglish | Your change |",
  "|---|---|---|---|---|",
  ...onScreen.map((key, index) => `| ${index + 1} | ${cell(strings.en[key])} | ${cell(strings.hi[key])} | ${cell(strings.hinglish[key])} | |`),
  "",
  "Reviewed by: ____________________   Date: __________",
  "",
];
writeFileSync(resolve(import.meta.dirname, "../../docs/testing/WORDING_REVIEW.md"), lines.join("\n"));
console.log(`Wrote ${spoken.length} spoken and ${onScreen.length} on-screen lines`);
