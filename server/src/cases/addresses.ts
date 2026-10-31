import type { AddressResult, Geocoder } from "../adapters/geocode.js";
import type { CaseStore } from "./store.js";

const WAIT_LIMIT_MS = 3000;

/** Looks up an area name for a case. Runs alongside dispatch and never blocks it. */
export class AddressLookup {
  private readonly pending = new Map<string, Promise<AddressResult | null>>();

  constructor(private readonly cases: CaseStore, private readonly geocoder: Geocoder) {}

  start(caseId: string) {
    const location = this.cases.get(caseId)?.location;
    if (location?.lat == null || location.lng == null) return;
    const lookup = this.geocoder.reverse(location.lat, location.lng).catch(() => null).then((address) => {
      if (address) this.cases.setAddress(caseId, address.text, address.weak);
      return address;
    });
    this.pending.set(caseId, lookup);
  }

  /** The address if it arrives soon enough to speak; otherwise null, and Ayu asks for a landmark. */
  forCase(caseId: string): Promise<AddressResult | null> {
    const lookup = this.pending.get(caseId) ?? Promise.resolve(null);
    return Promise.race([lookup, new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_LIMIT_MS))]);
  }
}
