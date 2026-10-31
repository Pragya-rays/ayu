// Writes the placeholder protocol files. Step text is deliberately NOT first aid: real wording must
// come from sources and medical review (Dev Guide section 9), then status changes to "reviewed".
// Run once with: node server/scripts/make-protocols.mjs. Never run it over reviewed files.
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PENDING = {
  en: "First aid steps for this emergency are waiting for medical review. Stay on the line and call 112.",
  hi: "इस आपात स्थिति के प्राथमिक उपचार के चरण अभी चिकित्सा समीक्षा में हैं। लाइन पर रहें और 112 पर कॉल करें।",
  hinglish: "Is emergency ke first aid steps abhi medical review mein hain. Line par rahiye aur 112 par call kijiye.",
};

const PROTOCOLS = [
  ["cpr", "RED", "CPR", "सीपीआर", "CPR", ["responsive=false", "breathingNormally=false"]],
  ["chest_pain_conscious", "RED", "Conscious chest pain", "सीने में दर्द (होश में)", "Chest pain (hosh mein)", ["emergencyType=cardiac", "responsive!=false"]],
  ["recovery_stroke_collapse", "RED", "Collapse, breathing", "बेहोश, सांस चल रही है", "Behosh, saans chal rahi hai", ["responsive=false", "breathingNormally=true"]],
  ["stroke", "RED", "Stroke signs", "स्ट्रोक के लक्षण", "Stroke ke lakshan", ["emergencyType=stroke_signs"]],
  ["choking", "RED", "Choking", "गले में अटकना", "Gale mein atakna", ["emergencyType=choking"]],
  ["severe_bleeding", "RED", "Severe bleeding", "तेज़ रक्तस्राव", "Tez bleeding", ["emergencyType=bleeding"]],
  ["general", "AMBER", "General guidance", "सामान्य मार्गदर्शन", "General guidance", ["default"]],
];

for (const [id, severity, en, hi, hinglish, triggers] of PROTOCOLS) {
  const file = resolve(import.meta.dirname, `../src/protocols/${id}.json`);
  if (existsSync(file)) continue;
  const protocol = {
    id,
    title: { en, hi, hinglish },
    severity,
    status: "placeholder",
    triggers,
    sources: [],
    reviewedBy: "TODO",
    reviewedAt: "TODO",
    steps: [{ id: "s1", text: PENDING, pauseAfterMs: 1500, interruptible: false }],
    doNot: [],
    callEmergencyLine: true,
  };
  writeFileSync(file, `${JSON.stringify(protocol, null, 2)}\n`);
}
