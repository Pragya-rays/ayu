import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Severity } from "../types/case.js";
import { PROTOCOL_IDS, type ProtocolId } from "../types/triage.js";
import type { Lang } from "../types/voice.js";

export type LocalizedText = Record<Lang, string>;

export interface ProtocolStep {
  id: string;
  text: LocalizedText;
  pauseAfterMs: number;
  interruptible: boolean;
}

export interface Protocol {
  id: ProtocolId;
  title: LocalizedText;
  severity: Severity;
  status: "placeholder" | "reviewed";
  triggers: string[];
  sources: string[];
  reviewedBy: string;
  reviewedAt: string;
  steps: ProtocolStep[];
  doNot: string[];
  callEmergencyLine: boolean;
}

const LANGS: Lang[] = ["en", "hi", "hinglish"];
const MAX_WORDS_PER_STEP = 25;

const hasAllLangs = (value: unknown): value is LocalizedText =>
  typeof value === "object" && value !== null &&
  LANGS.every((lang) => typeof (value as Record<string, unknown>)[lang] === "string" && (value as LocalizedText)[lang].trim() !== "");

/** Returns every problem found, so a bad file reports all its faults at once. */
export function validateProtocol(raw: any, fileId: string): string[] {
  const problems: string[] = [];
  if (raw?.id !== fileId) problems.push("id does not match the file name");
  if (!PROTOCOL_IDS.includes(raw?.id)) problems.push("unknown protocol id");
  if (!hasAllLangs(raw?.title)) problems.push("title needs en, hi and hinglish");
  if (!["RED", "AMBER", "GREEN"].includes(raw?.severity)) problems.push("invalid severity");
  if (!["placeholder", "reviewed"].includes(raw?.status)) problems.push("invalid status");
  if (!Array.isArray(raw?.steps) || raw.steps.length === 0) {
    problems.push("needs at least one step");
  } else {
    raw.steps.forEach((step: any, index: number) => {
      if (!hasAllLangs(step?.text)) problems.push(`step ${index + 1} needs en, hi and hinglish`);
      else if (step.text.en.split(/\s+/).length > MAX_WORDS_PER_STEP) problems.push(`step ${index + 1} is too long`);
    });
  }
  if (raw?.status === "reviewed") {
    if (!raw.reviewedBy || raw.reviewedBy === "TODO") problems.push("reviewed protocol needs reviewedBy");
    if (!raw.reviewedAt || raw.reviewedAt === "TODO") problems.push("reviewed protocol needs reviewedAt");
    if (!Array.isArray(raw.sources) || raw.sources.length === 0) problems.push("reviewed protocol needs sources");
    if (JSON.stringify(raw.steps).includes("TODO")) problems.push("reviewed protocol still contains TODO");
  }
  return problems;
}

/** Fails fast: the server must not start with a missing or invalid protocol. */
export function loadProtocols(dir = resolve(import.meta.dirname, "../../src/protocols")) {
  const protocols = new Map<ProtocolId, Protocol>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const id = file.replace(".json", "");
    const raw = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
    const problems = validateProtocol(raw, id);
    if (problems.length) throw new Error(`Invalid protocol ${file}: ${problems.join("; ")}`);
    protocols.set(raw.id, raw);
  }
  const missing = PROTOCOL_IDS.filter((id) => !protocols.has(id));
  if (missing.length) throw new Error(`Missing protocols: ${missing.join(", ")}`);
  return protocols;
}
