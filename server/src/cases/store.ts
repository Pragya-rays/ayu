import { randomUUID } from "node:crypto";
import type { Case, CaseEvent, Severity } from "../types/case.js";
import type { Lang } from "../types/voice.js";
import { buildBrief } from "./brief.js";

type LocationInput = { lat: number; lng: number; accuracyM: number };
type Listener = (updated: Case) => void;

const MAX_CASES = 200;

/** In-memory case store. Render's free plan has no persistent disk, so cases last until a restart. */
export class CaseStore {
  private readonly cases = new Map<string, Case>();
  private readonly events = new Map<string, CaseEvent[]>();
  private readonly listeners = new Set<Listener>();
  private readonly timelineListeners = new Set<(caseId: string) => void>();

  create(input: { lang: Lang; location?: LocationInput; medicalId?: Case["medicalId"] }): Case {
    const now = new Date().toISOString();
    const created: Case = {
      id: randomUUID(),
      mode: "sos",
      createdAt: now,
      lang: input.lang,
      severity: null,
      protocolId: null,
      location: input.location ? { ...input.location, status: "captured" } : null,
      triage: {},
      medicalId: input.medicalId,
      dispatch: { status: "requested", simulated: true, requestedAt: now },
      consent: { given: true, at: now },
      metrics: { turns: 0, misunderstandings: 0 },
    };
    this.cases.set(created.id, created);
    this.events.set(created.id, []);
    this.addEvent(created.id, "sos_tap", {});
    if (input.location) this.addEvent(created.id, "gps_captured", { ...input.location });
    this.addEvent(created.id, "dispatch_requested", { simulated: true });
    this.evictOldest();
    this.notify(created);
    return created;
  }

  get(id: string) {
    return this.cases.get(id);
  }

  list() {
    return [...this.cases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  eventsFor(id: string) {
    return this.events.get(id) ?? [];
  }

  activeCount() {
    return this.list().filter((item) => !item.closedAt).length;
  }

  addEvent(caseId: string, type: CaseEvent["type"], payload: Record<string, unknown>) {
    this.events.get(caseId)?.push({ id: randomUUID(), caseId, at: new Date().toISOString(), type, payload });
    for (const listener of this.timelineListeners) listener(caseId);
  }

  /** Separate from `subscribe`: timeline entries change nothing the voice session must react to. */
  subscribeTimeline(listener: (caseId: string) => void) {
    this.timelineListeners.add(listener);
    return () => {
      this.timelineListeners.delete(listener);
    };
  }

  setLocation(id: string, location: LocationInput) {
    return this.mutate(id, (item) => {
      item.location = { ...item.location, ...location, status: item.location?.status ?? "captured" };
      this.addEvent(id, "gps_captured", { ...location });
    });
  }

  recordTurn(id: string, text: string) {
    return this.mutate(id, (item) => {
      item.metrics.turns++;
      this.addEvent(id, "user_utterance", { text });
    });
  }

  recordFirstLine(id: string, activationToFirstLineMs: number) {
    return this.mutate(id, (item) => {
      item.metrics.activationToFirstLineMs ??= activationToFirstLineMs;
    });
  }

  setAddress(id: string, addressText: string, addressWeak: boolean) {
    return this.mutate(id, (item) => {
      if (item.location) item.location = { ...item.location, addressText, addressWeak };
    });
  }

  confirmLocation(id: string) {
    return this.mutate(id, (item) => {
      if (item.location) item.location.status = "verified";
      this.addEvent(id, "location_confirmed", {});
    });
  }

  setLocationConfirming(id: string) {
    return this.mutate(id, (item) => {
      if (item.location) item.location.status = "confirming";
    });
  }

  /** A place given by voice. Marks the case so the driver sees the location changed. */
  updateSpokenLocation(id: string, details: { spokenText?: string; landmark?: string; floor?: string; gate?: string }) {
    return this.mutate(id, (item) => {
      const known = item.location ?? { lat: null, lng: null, accuracyM: null, status: "updated" as const };
      item.location = { ...known, ...details, status: "updated" };
      this.addEvent(id, "location_updated", { ...details });
    });
  }

  markUnacknowledged(id: string) {
    return this.mutate(id, (item) => {
      if (item.closedAt || item.dispatch.status !== "requested") return;
      item.dispatch.status = "unacknowledged";
      this.addEvent(id, "status_update", { status: "unacknowledged" });
    });
  }

  acceptDispatch(id: string, ambulanceId: string, etaMinutes: number) {
    return this.mutate(id, (item) => {
      item.dispatch = { ...item.dispatch, status: "accepted", ambulanceId, etaMinutes, acceptedAt: new Date().toISOString() };
      this.addEvent(id, "dispatch_accepted", { ambulanceId, etaMinutes, simulated: true });
    });
  }

  setDispatchStatus(id: string, status: "en_route" | "arrived") {
    return this.mutate(id, (item) => {
      item.dispatch.status = status;
      if (status === "arrived") {
        item.dispatch.etaMinutes = 0;
        item.dispatch.arrivedAt = new Date().toISOString();
      }
      this.addEvent(id, "status_update", { status, simulated: true });
    });
  }

  setEta(id: string, etaMinutes: number) {
    return this.mutate(id, (item) => {
      item.dispatch.etaMinutes = etaMinutes;
    });
  }

  updateTriage(id: string, triage: Partial<Case["triage"]>) {
    return this.mutate(id, (item) => {
      item.triage = { ...item.triage, ...triage };
    });
  }

  setAssessment(id: string, severity: Severity, protocolId: string) {
    return this.mutate(id, (item) => {
      if (item.severity !== severity) {
        this.addEvent(id, "severity_changed", { from: item.severity, to: severity });
        item.severity = severity;
      }
      if (item.protocolId !== protocolId) {
        this.addEvent(id, "protocol_selected", { protocolId });
        item.protocolId = protocolId;
      }
    });
  }

  recordFirstInstruction(id: string) {
    return this.mutate(id, (item) => {
      item.metrics.tapToFirstInstructionMs ??= Date.now() - Date.parse(item.createdAt);
    });
  }

  cancel(id: string) {
    return this.mutate(id, (item) => {
      if (item.closedAt) return;
      const arrived = item.dispatch.status === "arrived";
      if (!arrived) item.dispatch.status = "cancelled";
      item.closedAt = new Date().toISOString();
      this.addEvent(id, "closed", { reason: arrived ? "handed_over" : "cancelled_by_caller" });
    });
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private mutate(id: string, change: (item: Case) => void) {
    const item = this.cases.get(id);
    if (!item) return undefined;
    change(item);
    this.notify(item);
    return item;
  }

  private notify(item: Case) {
    item.brief = buildBrief(item);
    for (const listener of this.listeners) listener(item);
  }

  private evictOldest() {
    const excess = this.cases.size - MAX_CASES;
    if (excess <= 0) return;
    for (const old of this.list().reverse().slice(0, excess)) {
      this.cases.delete(old.id);
      this.events.delete(old.id);
    }
  }
}
