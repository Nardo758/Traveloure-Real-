export function buildGoogleNavUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: string
): string {
  const travelModes: Record<string, string> = {
    walk: "walking", transit: "transit", train: "transit", tram: "transit", bus: "transit",
    taxi: "driving", rideshare: "driving", private_driver: "driving", rental_car: "driving",
    bike: "bicycling", ferry: "transit", auto_rickshaw: "driving", tuk_tuk: "driving", cable_car: "walking",
  };
  const travelMode = travelModes[mode] || "transit";
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=${travelMode}`;
}

export function buildAppleNavUrl(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  mode: string
): string {
  const flags: Record<string, string> = {
    walk: "w", transit: "r", train: "r", tram: "r", bus: "r",
    taxi: "d", rideshare: "d", private_driver: "d", rental_car: "d",
    bike: "c", ferry: "r", auto_rickshaw: "d", tuk_tuk: "d", cable_car: "w",
  };
  const flag = flags[mode] || "r";
  return `maps://?saddr=${fromLat},${fromLng}&daddr=${toLat},${toLng}&dirflg=${flag}`;
}
