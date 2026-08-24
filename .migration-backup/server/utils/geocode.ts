// Single source for server-side address → {lat,lng} geocoding (Google Geocoding
// API). Both GET /api/geocode (content.routes) and the PlanCard resolve-on-write
// coordinate backfill (plancard.routes) go through here, so there is exactly one
// server geocode path — the client must not geocode independently.

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !address || !address.trim()) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const resp = await fetch(url);
  const data: any = await resp.json();
  const loc = data.results?.[0]?.geometry?.location;
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng, formattedAddress: data.results[0].formatted_address };
}
