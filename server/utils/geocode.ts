// Single source for server-side address → {lat,lng} geocoding (Google Geocoding
// API). Both GET /api/geocode (content.routes) and the PlanCard resolve-on-write
// coordinate backfill (plancard.routes) go through here, so there is exactly one
// server geocode path — the client must not geocode independently.

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  locationType?: string;
  types?: string[];
}

//
// R298 (Maps billing audit): Geocoding has one tier (Essentials). The call runs behind the Maps
// billing gate (`geocode` in `@shared/maps-billing`) — its own switch, a daily cap and a recorded
// cost; refused ⇒ null, the same "no location" every caller already handles.
import { gatedMapsCall } from "../services/maps-billing/maps-billing.service";

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address || !address.trim()) return null;
  const out = await gatedMapsCall("geocode", async (apiKey) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data.status === "ZERO_RESULTS") return { value: null };
    if (!resp.ok || data.status !== "OK") {
      throw new Error(`Google geocoding failed: ${data.status || resp.status}`);
    }
    const loc = data.results?.[0]?.geometry?.location;
    if (!loc) return { value: null };
    return {
      value: {
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress: data.results[0].formatted_address,
        locationType: data.results[0].geometry?.location_type,
        types: Array.isArray(data.results[0].types) ? data.results[0].types : [],
      } as GeocodeResult,
    };
  });
  return "refused" in out ? null : out.value;
}
