export interface AddressResult {
  text: string;
  /** True when only a city was found, so a spoken area would not help anyone find the caller. */
  weak: boolean;
}

export interface Geocoder {
  reverse(lat: number, lng: number): Promise<AddressResult | null>;
}

export class NoGeocoder implements Geocoder {
  async reverse() {
    return null;
  }
}

// Policy: operations.osmfoundation.org/policies/nominatim. At most 1 request per second across the
// whole app, an identifying User-Agent, cached results, attribution, and no personal data. So only
// area-level coordinates are ever sent, and GEOCODER=off disables this without a code change.
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 2500;
const USER_AGENT = "Ayu-prototype/0.1 (+https://github.com/Pragya-rays/ayu)";

/** About 110 m. Coarse enough for an area name, without sending anyone's exact position. */
export const coarse = (value: number) => Math.round(value * 1000) / 1000;

export function parseAddress(body: any): AddressResult | null {
  const address = body?.address;
  if (!address) return null;
  const locality = address.neighbourhood ?? address.suburb ?? address.city_district ?? address.road;
  const city = address.city ?? address.town ?? address.village ?? address.county;
  const text = [locality, city].filter(Boolean).join(", ");
  return text ? { text, weak: !locality } : null;
}

export class NominatimGeocoder implements Geocoder {
  private readonly cache = new Map<string, Promise<AddressResult | null>>();
  private nextSlot = 0;

  constructor(private readonly baseUrl = "https://nominatim.openstreetmap.org") {}

  reverse(lat: number, lng: number) {
    const key = `${coarse(lat)},${coarse(lng)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const result = this.request(coarse(lat), coarse(lng));
    this.cache.set(key, result);
    return result;
  }

  private async request(lat: number, lng: number) {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + MIN_INTERVAL_MS;
    await new Promise((resolve) => setTimeout(resolve, slot - now));
    try {
      const url = `${this.baseUrl}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=en`;
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      return response.ok ? parseAddress(await response.json()) : null;
    } catch {
      return null;
    }
  }
}
