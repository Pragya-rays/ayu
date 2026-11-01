import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { speakHindiFor } from "../dialogue/hinglishSpeech.js";
import type { Severity } from "../types/case.js";
import { PROTOCOL_IDS, type ProtocolId } from "../types/triage.js";
import type { Lang } from "../types/voice.js";

export type LocalizedText = Record<Lang, string>;

export interface ProtocolStep {
  id: string;
  text: LocalizedText;
  pauseAfterMs: number;
  interruptible: boolean;
  /** The phone's compression beat starts with this step. */
  startsRhythm?: boolean;
}

/** Said between re-checks while the ambulance is on its way. */
export interface WaitingStep {
  id: string;
  text: LocalizedText;
  protocols: ProtocolId[];
  /** Said again once the list runs out. */
  repeat?: boolean;
}

export interface Protocol {
  id: ProtocolId;
  title: LocalizedText;
  severity: Severity;
  status: "placeholder" | "sourced" | "reviewed";
  triggers: string[];
  sources: string[];
  reviewedBy: string;
  reviewedAt: string;
  steps: ProtocolStep[];
  doNot: string[];
  callEmergencyLine: boolean;
  waiting: WaitingStep[];
}

const LANGS: Lang[] = ["en", "hi", "hinglish"];
const MAX_WORDS_PER_STEP = 25;
const WAITING_FILE = resolve(import.meta.dirname, "../../src/protocols/waiting/steps.json");

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
  if (!["placeholder", "sourced", "reviewed"].includes(raw?.status)) problems.push("invalid status");
  if (raw?.status === "sourced" && (!Array.isArray(raw.sources) || raw.sources.length === 0)) problems.push("sourced protocol needs sources");
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

export function validateWaitingSteps(raw: any): string[] {
  const problems: string[] = [];
  if (raw?.status === "reviewed" && !raw.reviewedBy) problems.push("reviewed waiting steps need reviewedBy");
  if (!raw?.basis) problems.push("waiting steps need a basis");
  if (!Array.isArray(raw?.steps) || raw.steps.length === 0) return [...problems, "needs at least one waiting step"];
  raw.steps.forEach((step: any) => {
    const label = `waiting step ${step?.id}`;
    if (!hasAllLangs(step?.text)) problems.push(`${label} needs en, hi and hinglish`);
    else if (step.text.en.split(/\s+/).length > MAX_WORDS_PER_STEP) problems.push(`${label} is too long`);
    if (!Array.isArray(step?.protocols) || step.protocols.length === 0) problems.push(`${label} needs protocols`);
    else if (!step.protocols.every((id: ProtocolId) => PROTOCOL_IDS.includes(id))) problems.push(`${label} has an unknown protocol`);
  });
  return problems;
}

function loadWaitingSteps(): WaitingStep[] {
  const raw = JSON.parse(readFileSync(WAITING_FILE, "utf8"));
  const problems = validateWaitingSteps(raw);
  if (problems.length) throw new Error(`Invalid waiting steps: ${problems.join("; ")}`);
  return raw.steps;
}

/** Fails fast: the server must not start with a missing or invalid protocol. */
export function loadProtocols(dir = resolve(import.meta.dirname, "../../src/protocols")) {
  const protocols = new Map<ProtocolId, Protocol>();
  const waiting = loadWaitingSteps();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const id = file.replace(".json", "");
    const raw = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
    const problems = validateProtocol(raw, id);
    if (problems.length) throw new Error(`Invalid protocol ${file}: ${problems.join("; ")}`);
    protocols.set(raw.id, { ...raw, waiting: waiting.filter((step) => step.protocols.includes(raw.id)) });
  }
  const missing = PROTOCOL_IDS.filter((id) => !protocols.has(id));
  if (missing.length) throw new Error(`Missing protocols: ${missing.join(", ")}`);
  speakHindiFor([...[...protocols.values()].flatMap((protocol) => protocol.steps.map((step) => step.text)), ...waiting.map((step) => step.text)]);
  return protocols;
}
