export function detectMapsPlatform(): "apple" | "google" {
  const ua = navigator.userAgent;
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(ua) && !ua.includes("Android");
  return isApple ? "apple" : "google";
}

export function openInMaps(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openDayInMaps(googleUrl: string, appleUrl: string, appleWebUrl: string) {
  const platform = detectMapsPlatform();
  if (platform === "apple") {
    openInMaps(appleUrl || appleWebUrl || googleUrl);
  } else {
    openInMaps(googleUrl);
  }
}

export const TRANSPORT_MODE_ICONS: Record<string, string> = {
  walk: "🚶",
  transit: "🚌",
  train: "🚃",
  tram: "🚋",
  bus: "🚌",
  taxi: "🚕",
  rideshare: "🚗",
  private_driver: "🚙",
  rental_car: "🚗",
  bike: "🚲",
  ferry: "⛴️",
  auto_rickshaw: "🛺",
  tuk_tuk: "🛵",
  cable_car: "🚡",
};

export const TRANSPORT_MODE_LABELS: Record<string, string> = {
  walk: "Walk",
  transit: "Transit",
  train: "Train",
  tram: "Tram",
  bus: "Bus",
  taxi: "Taxi",
  rideshare: "Rideshare",
  private_driver: "Private Driver",
  rental_car: "Rental Car",
  bike: "Bike",
  ferry: "Ferry",
  auto_rickshaw: "Auto-rickshaw",
  tuk_tuk: "Tuk-tuk",
  cable_car: "Cable Car",
};
