// Writes the placeholder home-care cards. They hold NO advice on purpose: wording must come from
// sources and medical review, then status changes to "reviewed". Never overwrites an existing file.
// Run with: node server/scripts/make-home-care.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PENDING = {
  en: "Home care steps for this are waiting for medical review. If you feel worse, please see a doctor.",
  hi: "इसके घरेलू देखभाल के चरण अभी चिकित्सा समीक्षा में हैं। तकलीफ़ बढ़े तो कृपया डॉक्टर को दिखाएँ।",
  hinglish: "Iske home care steps abhi medical review mein hain. Takleef badhe to kripya doctor ko dikhayein.",
};

const CARDS = [
  ["acidity", "Acidity", "एसिडिटी", "Acidity"],
  ["heat_headache", "Heat or sun headache", "धूप या गर्मी से सिर दर्द", "Dhoop ya garmi se sir dard"],
  ["mild_fever", "Mild fever", "हल्का बुखार", "Halka bukhar"],
  ["cold_cough", "Cold and cough", "सर्दी और खांसी", "Sardi aur khansi"],
  ["loose_motions", "Loose motions", "दस्त", "Loose motions"],
];

const dir = resolve(import.meta.dirname, "../src/homecare");
mkdirSync(dir, { recursive: true });
for (const [id, en, hi, hinglish] of CARDS) {
  const file = resolve(dir, `${id}.json`);
  if (existsSync(file)) continue;
  const card = {
    id,
    title: { en, hi, hinglish },
    status: "placeholder",
    commonCauses: [],
    steps: [PENDING],
    seeDoctorIf: [],
    sources: [],
    reviewedBy: "TODO",
    reviewedAt: "TODO",
  };
  writeFileSync(file, `${JSON.stringify(card, null, 2)}\n`);
}
