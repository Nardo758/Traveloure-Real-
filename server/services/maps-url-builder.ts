const GOOGLE_TRAVEL_MODES: Record<string, string> = {
  walk: "walking",
  transit: "transit",
  train: "transit",
  tram: "transit",
  bus: "transit",
  taxi: "driving",
  rideshare: "driving",
  private_driver: "driving",
  rental_car: "driving",
  bike: "bicycling",
  ferry: "transit",
  auto_rickshaw: "driving",
  tuk_tuk: "driving",
  cable_car: "walking",
};

const APPLE_TRAVEL_FLAGS: Record<string, string> = {
  walk: "w",
  transit: "r",
  train: "r",
  tram: "r",
  bus: "r",
  taxi: "d",
  rideshare: "d",
  private_driver: "d",
  rental_car: "d",
  bike: "c",
  ferry: "r",
  auto_rickshaw: "d",
  tuk_tuk: "d",
  cable_car: "w",
};

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
  const travelMode = GOOGLE_TRAVEL_MODES[dominantMode] || "transit";

  let url = `https://www.google.com/maps/dir/?api=1`;
  url += `&origin=${origin}`;
  url += `&destination=${destination}`;
  if (waypoints.length > 0) {
    url += `&waypoints=${waypoints.join("|")}`;
  }
  url += `&travelmode=${travelMode}`;
  return url;
}

export function buildGoogleNavUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: string
): string {
  const travelMode = GOOGLE_TRAVEL_MODES[mode] || "transit";
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=${travelMode}`;
}

export function buildGooglePlaceUrl(lat: number, lng: number, name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&center=${lat},${lng}`;
}

export function buildAppleMapsUrl(activities: ActivityPoint[], dominantMode: string): string {
  if (activities.length < 2) return "";
  const flag = APPLE_TRAVEL_FLAGS[dominantMode] || "r";
  const origin = `${activities[0].lat},${activities[0].lng}`;
  const stops = activities.slice(1).map(a => `${a.lat},${a.lng}`);
  return `maps://?saddr=${origin}&daddr=${stops.join("+to:")}&dirflg=${flag}`;
}

export function buildAppleMapsWebUrl(activities: ActivityPoint[], dominantMode: string): string {
  if (activities.length < 2) return "";
  const flag = APPLE_TRAVEL_FLAGS[dominantMode] || "r";
  const origin = `${activities[0].lat},${activities[0].lng}`;
  const stops = activities.slice(1).map(a => `${a.lat},${a.lng}`);
  return `https://maps.apple.com/?saddr=${origin}&daddr=${stops.join("+to:")}&dirflg=${flag}`;
}

export function buildAppleNavUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: string
): string {
  const flag = APPLE_TRAVEL_FLAGS[mode] || "r";
  return `maps://?saddr=${fromLat},${fromLng}&daddr=${toLat},${toLng}&dirflg=${flag}`;
}
