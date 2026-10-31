// Data model from Dev Guide section 4. Used from Phase 2 onward.
import type { Lang } from "./voice.js";

export type Severity = "RED" | "AMBER" | "GREEN";

export interface Case {
  id: string;
  mode: "sos" | "normal";
  createdAt: string;
  lang: Lang;
  severity: Severity | null;
  protocolId: string | null;
  location: {
    lat: number;
    lng: number;
    accuracyM: number;
    addressText?: string;
    landmark?: string;
    floor?: string;
    gate?: string;
    status: "captured" | "confirming" | "verified" | "updated";
  } | null;
  callbackNumber?: string;
  triage: {
    responsive?: boolean;
    breathingNormally?: boolean;
    conscious?: boolean;
    patients?: number;
    emergencyType?: string;
    extra?: Record<string, string>;
  };
  dispatch: {
    status: "requested" | "accepted" | "en_route" | "arrived" | "unacknowledged" | "cancelled";
    ambulanceId?: string;
    etaMinutes?: number;
    simulated: true;
    requestedAt: string;
    acceptedAt?: string;
    arrivedAt?: string;
  };
  brief?: string;
  medicalId?: { allergies?: string; conditions?: string; medicines?: string };
  consent: { given: boolean; at: string };
  metrics: {
    tapToFirstInstructionMs?: number;
    /** Countdown end to first Ayu audio on the phone. */
    activationToFirstLineMs?: number;
    turns: number;
    misunderstandings: number;
  };
  closedAt?: string;
}

export interface CaseEvent {
  id: string;
  caseId: string;
  at: string;
  type:
    | "sos_tap" | "countdown_cancel" | "gps_captured" | "location_confirmed" | "location_updated"
    | "dispatch_requested" | "dispatch_accepted" | "status_update" | "triage_answer"
    | "protocol_selected" | "instruction_spoken" | "recheck" | "severity_changed"
    | "user_utterance" | "ayu_utterance" | "error" | "closed";
  payload: Record<string, unknown>;
}
