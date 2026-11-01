export interface NormalSummary {
  said: string[];
  title: string | null;
  steps: string[];
  seeDoctorIf: string[];
  /** A warning sign appeared or went unanswered, so home care was withheld. */
  urgent: boolean;
  placeholder: boolean;
  /** Taken from published guidance, and not reviewed by a doctor. */
  sourced: boolean;
}

export interface NormalState {
  stage: "greeting" | "collect" | "offer_sos" | "advice" | "summary";
  expectsYesNo: boolean;
  offerSos: boolean;
  summary: NormalSummary | null;
}
