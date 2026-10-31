import type { Severity } from "../types/case.js";
import type { ProtocolId, TriageFacts } from "../types/triage.js";

export interface TriageResult {
  severity: Severity;
  protocolId: ProtocolId;
}

const red = (protocolId: ProtocolId): TriageResult => ({ severity: "RED", protocolId });
const amber = (protocolId: ProtocolId): TriageResult => ({ severity: "AMBER", protocolId });

// Draft from Dev Guide section 8. A doctor must review this table before it is relied on.
export function triage(facts: TriageFacts): TriageResult {
  const { responsive, breathingNormally, emergencyType, symptoms = [] } = facts;

  if (responsive === false && breathingNormally === false) return red("cpr");
  if (responsive === false && breathingNormally === true) return red("recovery_stroke_collapse");
  if (emergencyType === "choking") return red("choking");
  if (emergencyType === "bleeding" || (emergencyType === "accident" && symptoms.includes("severe_bleeding"))) {
    return red("severe_bleeding");
  }
  if (emergencyType === "stroke_signs") return red("stroke");
  if (emergencyType === "cardiac" && responsive !== false) return red("chest_pain_conscious");
  // Not in the guide's draft. An unresponsive person with unknown breathing must never rate AMBER.
  if (responsive === false) return red("general");
  if (breathingNormally === false) return red("general");
  return amber("general"); // unknowns default to caution
}

const RANK: Record<Severity, number> = { GREEN: 0, AMBER: 1, RED: 2 };

/** Severity only ever goes up during a case. */
export function higherSeverity(current: Severity | null, next: Severity): Severity {
  return current && RANK[current] > RANK[next] ? current : next;
}
