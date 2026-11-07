import type { IssueId } from "./normalContent.js";

// Draft from Project Summary section 8; a doctor must review it. This only ever offers SOS,
// so it leans towards false alarms: a missed warning sign is the worse mistake.
const RED_FLAGS: [string, string[]][] = [
  ["chest_pain", ["seene mein dard", "seene me dard", "सीने में दर्द", "सीने में दबाव", "chest pain", "chest pressure", "seene mein dabaav"]],
  ["arm_jaw_pain", ["baanh mein dard", "baazu mein dard", "बाँह में दर्द", "बांह में दर्द", "jabde mein dard", "जबड़े में दर्द", "arm pain", "jaw pain"]],
  ["sweating", ["paseena", "पसीना", "sweating"]],
  ["breathless", ["saans lene mein", "सांस लेने में", "साँस लेने में", "breathless", "trouble breathing", "saans phool", "सांस फूल", "saans nahi", "sans nahi", "सांस नहीं", "साँस नहीं", "cannot breathe", "can't breathe"]],
  ["fainting", ["behosh", "बेहोश", "faint", "gir gaya", "gir gayi", "गिर गया", "गिर गई"]],
  ["sudden_headache", ["achanak tez", "अचानक तेज़", "अचानक तेज", "sudden severe", "worst headache"]],
  ["confusion", ["confused", "bhramit", "भ्रमित", "होश नहीं"]],
  ["one_sided_weakness", ["ek taraf", "एक तरफ़", "एक तरफ", "lakwa", "laqwa", "लकवा", "muh tedha", "मुँह टेढ़ा", "मुंह टेढ़ा", "one side"]],
  ["blood", ["khoon", "खून", "blood"]],
  ["vomit_colour", ["hari ulti", "हरी उल्टी", "green vomit", "kaali ulti", "काली उल्टी", "black vomit"]],
  ["cannot_swallow", ["nigal nahi", "निगल नहीं", "can't swallow", "cannot swallow", "laar beh", "लार बह", "drooling"]],
];

const NEGATION = /(nahi|nahin|नहीं|नही|\bno\b|\bnot\b)/;
const LOOK_AHEAD = 18;

/** True for "सीने में दर्द नहीं है" or "no chest pain", without reaching across a new clause. */
function isNegated(text: string, index: number, length: number) {
  const before = text.slice(Math.max(0, index - 4), index);
  const after = text.slice(index + length, index + length + LOOK_AHEAD).split(/[,.;।!?]/)[0] ?? "";
  return NEGATION.test(before) || NEGATION.test(after);
}

export function findRedFlags(utterance: string): string[] {
  const text = utterance.toLowerCase();
  return RED_FLAGS.filter(([, phrases]) => phrases.some((phrase) => {
    const index = text.indexOf(phrase);
    return index >= 0 && !isNegated(text, index, phrase.length);
  })).map(([name]) => name);
}

// Order matters: specific words first, so "potty nahi ho rahi" is not loose motions, and a bare
// "pet mein" is only a last resort.
const ISSUES: [IssueId, string[]][] = [
  ["constipation", ["kabz", "qabz", "कब्ज", "क़ब्ज़", "क़ब्ज", "constipat", "potty nahi", "पॉटी नहीं", "pet saaf nahi", "पेट साफ़ नहीं", "पेट साफ नहीं"]],
  ["acidity", ["acidity", "एसिडिटी", "gas", "गैस", "jalan", "जलन", "khatti dakar", "खट्टी डकार"]],
  ["loose_motions", ["loose motion", "दस्त", "dast", "पतली", "potty"]],
  ["vomiting", ["ulti", "उल्टी", "vomit", "ji michla", "जी मिचला", "nausea"]],
  ["heat_headache", ["sir dard", "sar dard", "सिर दर्द", "सिर में दर्द", "sir mein dard", "sar mein dard", "headache", "धूप", "dhoop", "garmi", "गर्मी"]],
  ["cold_cough", ["khansi", "खांसी", "खाँसी", "cough", "sardi", "सर्दी", "zukam", "जुकाम", "ज़ुकाम", "naak"]],
  ["sore_throat", ["gale mein", "गले में", "gala", "गला", "kharash", "ख़राश", "खराश", "sore throat", "throat"]],
  ["mild_fever", ["bukhar", "बुखार", "fever", "ताप"]],
  ["acidity", ["pet mein", "पेट में"]],
];

export function findIssue(utterance: string): IssueId | null {
  const text = utterance.toLowerCase();
  return ISSUES.find(([, phrases]) => phrases.some((phrase) => text.includes(phrase)))?.[0] ?? null;
}
