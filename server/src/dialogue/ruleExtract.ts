import type { EmergencyType, TriageAnswer, TriageFacts, TriageQuestion } from "../types/triage.js";

// Rules run first and work without the LLM. Prisma returns Devanagari with English in Latin,
// so every list covers Devanagari and romanised spellings.
const words = (text: string) => text.toLowerCase().split(/[\s,.!?।॥;:"'()-]+/).filter(Boolean);

const hasAny = (tokens: string[], list: string[]) => tokens.some((token) => list.includes(token));
const hasPhrase = (text: string, list: string[]) => list.some((phrase) => text.includes(phrase));

const UNSURE = ["pata nahi", "pata nahin", "पता नहीं", "पता नही", "nahi pata", "नहीं पता", "not sure", "don't know", "dont know", "maloom nahi", "मालूम नहीं", "shayad", "शायद", "maybe"];
const NEGATIVE = ["nahi", "nahin", "nai", "na", "no", "not", "नहीं", "नही", "ना", "stopped", "बंद", "band"];
const POSITIVE = ["haan", "han", "ha", "haa", "ji", "yes", "yeah", "हाँ", "हां", "हा", "जी", "bilkul", "बिल्कुल"];
const ABNORMAL_BREATHING = ["haanf", "हांफ", "हाँफ", "gasp", "ajeeb", "अजीब", "ruk ruk", "रुक रुक", "mushkil", "मुश्किल", "तकलीफ", "takleef", "dikkat", "दिक्कत", "kharrate", "खर्राटे"];
const BREATHING_TOPIC = ["saans", "sans", "सांस", "साँस", "breathing"];
const RESPONDING_TOPIC = ["jawab", "जवाब", "bol rahe", "bol raha", "bol rahi", "बोल रहे", "बोल रहा", "बोल रही", "सुन रहा", "सुन रहे", "sun raha", "sun rahe", "baat kar", "बात कर", "responding", "hosh", "होश"];
const MAX_BARE_REPLY_WORDS = 4;

const LOCATION_YES = ["sahi", "सही", "correct", "right", "theek", "ठीक"];
const LOCATION_NO = ["galat", "गलत", "wrong", "incorrect"];

/** Yes or no to a location read-back. Anything longer is taken as the caller giving a place. */
export function parseLocationAnswer(utterance: string): TriageAnswer | null {
  const text = utterance.toLowerCase();
  const tokens = words(text);
  if (hasPhrase(text, UNSURE)) return "unsure";
  if (hasPhrase(text, LOCATION_NO)) return "no";
  if (tokens.length > MAX_BARE_REPLY_WORDS) return null;
  if (hasAny(tokens, NEGATIVE)) return "no";
  return hasAny(tokens, POSITIVE) || hasPhrase(text, LOCATION_YES) ? "yes" : null;
}

/** Reads a spoken reply to the question just asked. Returns null when the reply is not clear. */
export function parseAnswer(question: TriageQuestion, utterance: string): TriageAnswer | null {
  const text = utterance.toLowerCase();
  const tokens = words(text);
  if (hasPhrase(text, UNSURE)) return "unsure";
  if (question === "breathing" && hasPhrase(text, ABNORMAL_BREATHING)) return "no";
  // "नहीं" inside a description ("बोल नहीं पा रहा") is not a reply. Only a short reply, or one
  // about the thing asked, counts; anything else goes to the LLM or is asked again.
  const onTopic = hasPhrase(text, question === "breathing" ? BREATHING_TOPIC : RESPONDING_TOPIC);
  if (tokens.length > MAX_BARE_REPLY_WORDS && !onTopic) return null;
  if (hasAny(tokens, NEGATIVE)) return "no";
  if (hasAny(tokens, POSITIVE)) return "yes";
  return onTopic ? "yes" : null;
}

const NOT_BREATHING = ["saans nahi", "sans nahi", "सांस नहीं", "साँस नहीं", "not breathing", "stopped breathing", "saans band", "सांस बंद"];
const NOT_RESPONDING = ["jawab nahi", "जवाब नहीं", "not responding", "unresponsive", "behosh", "बेहोश", "unconscious", "hosh nahi", "होश नहीं"];

const TYPE_RULES: [EmergencyType, string[]][] = [
  ["choking", ["choking", "choke", "gale mein atak", "gala atak", "गले में अटक", "गला अटक", "atak gaya", "अटक गया"]],
  ["bleeding", ["bleeding", "khoon", "खून", "रक्त"]],
  ["stroke_signs", ["stroke", "laqwa", "lakwa", "लकवा", "muh tedha", "munh tedha", "मुंह टेढ़ा", "मुँह टेढ़ा", "face droop"]],
  ["cardiac", ["heart attack", "chest pain", "chest", "seene", "सीने", "सीना", "dil ka daura", "दिल का दौरा"]],
  ["seizure", ["seizure", "mirgi", "मिर्गी", "daura pad", "दौरा पड़"]],
  ["burn", ["jal gaya", "jal gayi", "जल गया", "जल गई", "burn"]],
  ["accident", ["accident", "एक्सीडेंट", "takkar", "टक्कर"]],
  ["collapse", ["gir gaye", "gir gaya", "gir gayi", "गिर गए", "गिर गया", "गिर गई", "collapsed", "behosh", "बेहोश"]],
];

/** Facts stated outright in an utterance. Anything not clearly stated is left out. */
export function extractFacts(utterance: string): TriageFacts {
  const text = utterance.toLowerCase();
  const facts: TriageFacts = {};
  if (hasPhrase(text, NOT_BREATHING)) facts.breathingNormally = false;
  if (hasPhrase(text, NOT_RESPONDING)) facts.responsive = false;
  facts.emergencyType = TYPE_RULES.find(([, phrases]) => hasPhrase(text, phrases))?.[0] ?? null;
  return facts;
}
