import type { CaseStore } from "../cases/store.js";
import type { Case } from "../types/case.js";

export interface DispatchOptions {
  ackTimeoutMs: number;
  /** 0 means only a person on the dashboard can accept. */
  autoAckSeconds: number;
  /** Real time per simulated minute, so a demo need not wait out a full ETA. */
  simMinuteMs: number;
  minEtaMinutes: number;
  maxEtaMinutes: number;
}

interface Timers {
  ack?: NodeJS.Timeout;
  autoAck?: NodeJS.Timeout;
  tick?: NodeJS.Timeout;
}

/** Simulated dispatch only. Nothing here contacts any real ambulance, driver or service. */
export class DispatchSimulator {
  private readonly timers = new Map<string, Timers>();

  constructor(private readonly cases: CaseStore, private readonly options: DispatchOptions) {
    cases.subscribe((updated) => {
      if (updated.closedAt) this.clear(updated.id);
    });
  }

  track(caseId: string) {
    const timers: Timers = {
      ack: setTimeout(() => this.cases.markUnacknowledged(caseId), this.options.ackTimeoutMs),
    };
    if (this.options.autoAckSeconds > 0) {
      timers.autoAck = setTimeout(() => this.accept(caseId), this.options.autoAckSeconds * 1000);
    }
    this.timers.set(caseId, timers);
  }

  accept(caseId: string, ambulanceId?: string) {
    const item = this.cases.get(caseId);
    if (!item || item.closedAt) return undefined;
    if (item.dispatch.status !== "requested" && item.dispatch.status !== "unacknowledged") return item;
    const { minEtaMinutes, maxEtaMinutes } = this.options;
    const eta = minEtaMinutes + Math.floor(Math.random() * (maxEtaMinutes - minEtaMinutes + 1));
    this.stopAckTimers(caseId);
    const accepted = this.cases.acceptDispatch(caseId, ambulanceId ?? `SIM-${caseId.slice(0, 4).toUpperCase()}`, eta);
    this.scheduleTick(caseId);
    return accepted;
  }

  setStatus(caseId: string, status: "en_route" | "arrived") {
    const item = this.cases.get(caseId);
    if (!item || item.closedAt) return undefined;
    if (status === "arrived") this.clear(caseId);
    if (item.dispatch.status === "requested" || item.dispatch.status === "unacknowledged") this.accept(caseId);
    return this.cases.setDispatchStatus(caseId, status);
  }

  private scheduleTick(caseId: string) {
    const timers = this.timers.get(caseId);
    if (!timers) return;
    timers.tick = setTimeout(() => this.tick(caseId), this.options.simMinuteMs);
  }

  private tick(caseId: string) {
    const item = this.cases.get(caseId);
    if (!item || item.closedAt || item.dispatch.status === "arrived") return;
    const remaining = Math.max(0, (item.dispatch.etaMinutes ?? 1) - 1);
    if (remaining === 0) {
      this.setStatus(caseId, "arrived");
      return;
    }
    this.cases.setEta(caseId, remaining);
    if (item.dispatch.status === "accepted") this.cases.setDispatchStatus(caseId, "en_route");
    this.scheduleTick(caseId);
  }

  private stopAckTimers(caseId: string) {
    const timers = this.timers.get(caseId);
    clearTimeout(timers?.ack);
    clearTimeout(timers?.autoAck);
  }

  private clear(caseId: string) {
    this.stopAckTimers(caseId);
    clearTimeout(this.timers.get(caseId)?.tick);
    this.timers.delete(caseId);
  }
}

export type DispatchStatus = Case["dispatch"]["status"];
