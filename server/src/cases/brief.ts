import type { Case } from "../types/case.js";

const COMPLAINTS: Record<string, string> = {
  cardiac: "chest pain",
  collapse: "collapsed",
  stroke_signs: "stroke signs",
  choking: "choking",
  bleeding: "severe bleeding",
  accident: "accident",
  breathing: "breathing difficulty",
  seizure: "seizure",
  burn: "burn",
};

const yesNoUnknown = (value: boolean | undefined) => (value === undefined ? "unknown" : value ? "yes" : "no");
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * One-line pre-arrival brief (Dev Guide 7.5), built only from confirmed case fields so it can never
 * state something the caller did not say. A prep hint needs a doctor-reviewed table, so there is none yet.
 */
export function buildBrief(item: Case) {
  const { triage, dispatch } = item;
  const who = [triage.extra?.age, triage.extra?.sex].filter(Boolean).join(" ") || "patient";
  const complaint = COMPLAINTS[triage.emergencyType ?? ""] ?? "complaint unknown";
  const eta = dispatch.etaMinutes !== undefined && dispatch.status !== "arrived" ? `, ETA ${dispatch.etaMinutes} min` : "";
  return `${capitalise(who)}, ${complaint}, responsive: ${yesNoUnknown(triage.responsive)}, breathing: ${yesNoUnknown(triage.breathingNormally)}${eta}.`;
}
