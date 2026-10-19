/**
 * LG-2 Ask 8 (decision-maker, Oct 18, 2026 — ruling 7): the geocoder the item batch asks is a CONFIG value, and a batch
 * run refuses the public Nominatim server. No further runs or rechecks against nominatim.openstreetmap.org; the rerun
 * waits for a self-hosted instance or a paid geocoder (after Oct 21). An operator sets `GEOCODER_BASE_URL` (the
 * instance's address, never committed); unset means no batch geocoder at all.
 *
 * NEGATIVE SPACE (§18d): this governs the item batch (`scripts/regeocode-items-osm.ts`). The city-event seeder's
 * one-lookup-per-new-venue at boot (LD 59, `venue-geocode.service.ts`) is a separate ruled path and is not changed here.
 */

/** The public server's address — the default the pure lookup builds URLs against, never a batch target. */
export const PUBLIC_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

export function geocoderBaseUrl(): string | null {
  const raw = (process.env.GEOCODER_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return raw ? raw : null;
}

/** Pure. True when the address is the public OpenStreetMap Nominatim server (any openstreetmap.org host). */
export function isPublicNominatimHost(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "openstreetmap.org" || host.endsWith(".openstreetmap.org");
}

/** Pure. Why a batch run may not start, or null when it may: no geocoder configured, a malformed one, or the public host. */
export function batchGeocoderRefusal(baseUrl: string | null | undefined): "not_configured" | "malformed" | "public_nominatim" | null {
  if (!baseUrl) return "not_configured";
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "malformed";
  } catch {
    return "malformed";
  }
  return isPublicNominatimHost(baseUrl) ? "public_nominatim" : null;
}
