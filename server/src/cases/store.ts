import { randomUUID } from "node:crypto";
import type { Case, CaseEvent } from "../types/case.js";
import type { Lang } from "../types/voice.js";

type LocationInput = { lat: number; lng: number; accuracyM: number };
type Listener = (updated: Case) => void;

const MAX_CASES = 200;

/** In-memory case store. Render's free plan has no persistent disk, so cases last until a restart. */
export class CaseStore {
  private readonly cases = new Map<string, Case>();
  private readonly events = new Map<string, CaseEvent[]>();
  private readonly listeners = new Set<Listener>();

  create(input: { lang: Lang; location?: LocationInput }): Case {
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

  cancel(id: string) {
    return this.mutate(id, (item) => {
      if (item.closedAt) return;
      item.dispatch.status = "cancelled";
      item.closedAt = new Date().toISOString();
      this.addEvent(id, "closed", { reason: "cancelled_by_caller" });
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
