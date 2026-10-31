// Extraction schema from Dev Guide 7.2. null always means "not stated".
export const EMERGENCY_TYPES = [
  "cardiac", "collapse", "stroke_signs", "choking", "bleeding", "accident",
  "breathing", "seizure", "burn", "other", "unknown",
] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

export const PROTOCOL_IDS = [
  "cpr", "chest_pain_conscious", "recovery_stroke_collapse", "stroke", "choking", "severe_bleeding", "general",
] as const;
export type ProtocolId = (typeof PROTOCOL_IDS)[number];

export interface Extraction {
  emergencyType: EmergencyType | null;
  location: { text: string | null; landmark: string | null; floor: string | null };
  patients: number | null;
  age: "child" | "adult" | "elderly" | null;
  sex: "male" | "female" | null;
  responsive: boolean | null;
  breathingNormally: boolean | null;
  conscious: boolean | null;
  symptoms: string[];
  onsetText: string | null;
  stateChange: boolean;
}

/** What triage reasons about. Absent or null means unknown, and unknown is never read as good news. */
export interface TriageFacts {
  responsive?: boolean | null;
  breathingNormally?: boolean | null;
  emergencyType?: EmergencyType | null;
  symptoms?: string[];
}

export type TriageQuestion = "responsive" | "breathing";
export type TriageAnswer = "yes" | "no" | "unsure";
