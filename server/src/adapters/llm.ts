import { ISSUE_IDS, type IssueId } from "../dialogue/normalContent.js";
import { EXTRACTION_PROMPT } from "../prompts/extraction.js";
import { normalPrompt } from "../prompts/normal.js";
import type { Lang } from "../types/voice.js";
import { EMERGENCY_TYPES, type EmergencyType, type Extraction } from "../types/triage.js";

export interface LLMAdapter {
  /** Resolves to validated fields, or null on any failure. Callers fall back to rules and never see free text. */
  extract(utterances: string[]): Promise<Extraction | null>;
}

export interface NormalClassification {
  issueId: IssueId | null;
  redFlags: string[];
  /** A checked follow-up question, or null to use the fixed list. */
  question: string | null;
}

export interface NormalClassifier {
  /** Resolves to validated fields, or null on any failure, so rules take over. */
  classify(conversation: string[], lang: Lang): Promise<NormalClassification | null>;
}

export class NoLLM implements LLMAdapter, NormalClassifier {
  async extract() {
    return null;
  }

  async classify() {
    return null;
  }
}

const MAX_RED_FLAGS = 10;
const MAX_QUESTION_WORDS = 20;
const MAX_QUESTION_CHARS = 140;

// A generated question is spoken aloud, so anything advice-like is refused and the fixed list
// is used instead. These lean strict: losing a good question costs little.
const NOT_A_QUESTION = [
  // Medicines and doses
  /\b(aspirin|paracetamol|crocin|dolo|calpol|ibuprofen|combiflam|antacid|digene|eno|gelusil|ors|azithromycin|antibiotic|tablet|capsule|syrup|mg|ml|dose)\b/i,
  /एस्पिरिन|पैरासिटामोल|क्रोसिन|डोलो|एंटासिड|गोली|टैबलेट|कैप्सूल|सिरप|खुराक/,
  // Instructions
  /\b(should|must|try|take|drink|eat|apply|rest|avoid|please)\b/i,
  /\b(lijiye|lijie|lein|le lo|kijiye|karein|karo|piyen|piyo|peejiye|khaiye|khao|chahiye|lagayein|lagao|aaram)\b/i,
  /लीजिए|लें\b|कीजिए|करें|पीजिए|पिएं|खाइए|चाहिए|लगाएं|लगाएँ|आराम/,
  // Diagnosis
  /\b(diagnos|migraine|heart attack|you have|it is|this is|could be|might be|probably)\b/i,
  /\b(ho sakta|ho sakti|lagta hai|shayad)\b/i,
  /हो सकता|हो सकती|लगता है|शायद/,
];

/** One short question and nothing else, or null. */
export function checkQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const question = raw.trim();
  if (!question || question.length > MAX_QUESTION_CHARS) return null;
  if (question.split(/\s+/).length > MAX_QUESTION_WORDS) return null;
  if (!question.endsWith("?") || question.split("?").length !== 2) return null;
  if (/[.!।\n]/.test(question)) return null;
  return NOT_A_QUESTION.some((pattern) => pattern.test(question)) ? null : question;
}

/** Strict check of LLM output, as for extraction. A bad question alone just drops the question. */
export function parseClassification(raw: unknown): NormalClassification | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { issueId, redFlags, question } = raw as Record<string, unknown>;
  if (issueId !== null && !ISSUE_IDS.includes(issueId as IssueId)) return null;
  if (!Array.isArray(redFlags) || redFlags.length > MAX_RED_FLAGS || !redFlags.every((flag) => typeof flag === "string")) return null;
  return { issueId: issueId as IssueId | null, redFlags, question: checkQuestion(question) };
}

const nullable = <T>(value: unknown, check: (item: unknown) => item is T): T | null | undefined =>
  value === null ? null : check(value) ? value : undefined;

const isString = (value: unknown): value is string => typeof value === "string";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0 && (value as number) < 1000;
const isIn = <T extends string>(list: readonly T[]) => (value: unknown): value is T => list.includes(value as T);

/** Strict check of LLM output. Anything off-schema rejects the whole result. */
export function parseExtraction(raw: unknown): Extraction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, any>;
  const location = value.location;
  if (typeof location !== "object" || location === null) return null;

  const fields = {
    emergencyType: nullable<EmergencyType>(value.emergencyType, isIn(EMERGENCY_TYPES)),
    text: nullable(location.text, isString),
    landmark: nullable(location.landmark, isString),
    floor: nullable(location.floor, isString),
    patients: nullable(value.patients, isCount),
    age: nullable(value.age, isIn(["child", "adult", "elderly"] as const)),
    sex: nullable(value.sex, isIn(["male", "female"] as const)),
    responsive: nullable(value.responsive, isBoolean),
    breathingNormally: nullable(value.breathingNormally, isBoolean),
    conscious: nullable(value.conscious, isBoolean),
    onsetText: nullable(value.onsetText, isString),
  };
  if (Object.values(fields).some((field) => field === undefined)) return null;
  if (!Array.isArray(value.symptoms) || !value.symptoms.every(isString)) return null;
  if (!isBoolean(value.stateChange)) return null;

  const { text, landmark, floor, ...rest } = fields;
  return {
    ...rest,
    location: { text, landmark, floor },
    symptoms: value.symptoms,
    stateChange: value.stateChange,
  } as Extraction;
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
}

export class GeminiAdapter implements LLMAdapter, NormalClassifier {
  constructor(private readonly options: GeminiOptions) {}

  async extract(utterances: string[]): Promise<Extraction | null> {
    const raw = await this.requestJson(EXTRACTION_PROMPT, utterances);
    return raw === null ? null : parseExtraction(raw);
  }

  async classify(conversation: string[], lang: Lang): Promise<NormalClassification | null> {
    const raw = await this.requestJson(normalPrompt(lang), conversation);
    return raw === null ? null : parseClassification(raw);
  }

  private async requestJson(prompt: string, utterances: string[]): Promise<unknown> {
    const base = this.options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    try {
      const response = await fetch(`${base}/models/${this.options.model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.options.apiKey },
        signal: AbortSignal.timeout(this.options.timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt }] },
          contents: [{ role: "user", parts: [{ text: utterances.join("\n") }] }],
          // Without minimal thinking this model took 1-8 s; with it, under 1 s (measured 11-01).
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
}
