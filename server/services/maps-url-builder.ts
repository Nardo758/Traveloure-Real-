export interface ActivityPoint {
  lat: number;
  lng: number;
  name: string;
}

export function buildGoogleMapsUrl(activities: ActivityPoint[], dominantMode: string): string {
  if (activities.length < 2) return "";

  const origin = `${activities[0].lat},${activities[0].lng}`;
  const destination = `${activities[activities.length - 1].lat},${activities[activities.length - 1].lng}`;
  const waypoints = activities.slice(1, -1).map(a => `${a.lat},${a.lng}`);
  // R321 (S11-9): no travel-mode parameter on any Maps link — Maps chooses. `dominantMode` is kept
  // in the signature for callers and ignored here.
  void dominantMode;

  let url = `https://www.google.com/maps/dir/?api=1`;
  url += `&origin=${origin}`;
  url += `&destination=${destination}`;
  if (waypoints.length > 0) {
    url += `&waypoints=${waypoints.join("|")}`;
  }
  return url;
}

export function buildGoogleNavUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: string,
  opts: { travelmode?: "transit" } = {},
): string {
  void mode; // R321 (S11-9): Maps chooses the mode.
  // TC-4 (ledger `2026-10-11-tc4-live-directions`): the Trip Card's live-directions link ALONE may ask
  // for transit, and only where the routing API has no transit (`apiTransitCoverage: false`) — its label
  // promises train and bus. Every other caller passes nothing and keeps R321's no-mode link.
  const tm = opts.travelmode ? `&travelmode=${opts.travelmode}` : "";
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}${tm}`;
}

export function buildGooglePlaceUrl(lat: number, lng: number, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&center=${lat},${lng}`;
}

export function buildAppleMapsUrl(activities: ActivityPoint[], dominantMode: string): string {
  if (activities.length < 2) return "";
  void dominantMode; // R321 (S11-9): Maps chooses the mode.
  const origin = `${activities[0].lat},${activities[0].lng}`;
  const stops = activities.slice(1).map(a => `${a.lat},${a.lng}`);
  return `maps://?saddr=${origin}&daddr=${stops.join("+to:")}`;
}

export function buildAppleMapsWebUrl(activities: ActivityPoint[], dominantMode: string): string {
  if (activities.length < 2) return "";
  void dominantMode; // R321 (S11-9): Maps chooses the mode.
  const origin = `${activities[0].lat},${activities[0].lng}`;
  const stops = activities.slice(1).map(a => `${a.lat},${a.lng}`);
  return `https://maps.apple.com/?saddr=${origin}&daddr=${stops.join("+to:")}`;
}

export function buildAppleNavUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: string
): string {
  void mode; // R321 (S11-9): Maps chooses the mode.
  return `maps://?saddr=${fromLat},${fromLng}&daddr=${toLat},${toLng}`;
}
