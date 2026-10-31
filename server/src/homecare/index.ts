import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ISSUE_IDS, type IssueId } from "../dialogue/normalContent.js";
import type { LocalizedText } from "../protocols/index.js";

export interface HomeCareCard {
  id: IssueId;
  title: LocalizedText;
  status: "placeholder" | "reviewed";
  commonCauses: LocalizedText[];
  steps: LocalizedText[];
  seeDoctorIf: LocalizedText[];
  sources: string[];
  reviewedBy: string;
  reviewedAt: string;
}

const hasLangs = (value: any) => ["en", "hi", "hinglish"].every((lang) => typeof value?.[lang] === "string" && value[lang].trim() !== "");

export function validateCard(raw: any, fileId: string): string[] {
  const problems: string[] = [];
  if (raw?.id !== fileId || !ISSUE_IDS.includes(raw?.id)) problems.push("id does not match a known issue");
  if (!hasLangs(raw?.title)) problems.push("title needs en, hi and hinglish");
  if (!["placeholder", "reviewed"].includes(raw?.status)) problems.push("invalid status");
  if (!Array.isArray(raw?.steps) || raw.steps.length === 0 || !raw.steps.every(hasLangs)) {
    problems.push("steps need en, hi and hinglish");
  }
  if (raw?.status === "reviewed") {
    if (!raw.reviewedBy || raw.reviewedBy === "TODO") problems.push("reviewed card needs reviewedBy");
    if (!raw.reviewedAt || raw.reviewedAt === "TODO") problems.push("reviewed card needs reviewedAt");
    if (!Array.isArray(raw.sources) || raw.sources.length === 0) problems.push("reviewed card needs sources");
    if (!Array.isArray(raw.seeDoctorIf) || raw.seeDoctorIf.length === 0) problems.push("reviewed card needs seeDoctorIf");
  }
  return problems;
}

/** Fails fast, like the protocol library: no card is ever loaded unchecked. */
export function loadHomeCare(dir = resolve(import.meta.dirname, "../../src/homecare")) {
  const cards = new Map<IssueId, HomeCareCard>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const id = file.replace(".json", "");
    const raw = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
    const problems = validateCard(raw, id);
    if (problems.length) throw new Error(`Invalid home-care card ${file}: ${problems.join("; ")}`);
    cards.set(raw.id, raw);
  }
  const missing = ISSUE_IDS.filter((id) => !cards.has(id));
  if (missing.length) throw new Error(`Missing home-care cards: ${missing.join(", ")}`);
  return cards;
}
