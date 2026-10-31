import { EXTRACTION_PROMPT } from "../prompts/extraction.js";
import { EMERGENCY_TYPES, type EmergencyType, type Extraction } from "../types/triage.js";

export interface LLMAdapter {
  /** Resolves to validated fields, or null on any failure. Callers fall back to rules and never see free text. */
  extract(utterances: string[]): Promise<Extraction | null>;
}

export class NoLLM implements LLMAdapter {
  async extract() {
    return null;
  }
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

export class GeminiAdapter implements LLMAdapter {
  constructor(private readonly options: GeminiOptions) {}

  async extract(utterances: string[]): Promise<Extraction | null> {
    const base = this.options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    try {
      const response = await fetch(`${base}/models/${this.options.model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.options.apiKey },
        signal: AbortSignal.timeout(this.options.timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: utterances.join("\n") }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 1024 },
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      return text ? parseExtraction(JSON.parse(text)) : null;
    } catch {
      return null;
    }
  }
}
