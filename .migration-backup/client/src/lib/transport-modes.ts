// Single source of truth for transport-mode *styling* (color, icon, map polyline
// stroke) and the canonical display mode-id list. Consolidates what used to be
// scattered hard-coded literals (plancard-types MODE_COLORS / MODE_ICON_MAP,
// MapControlCenter's per-mode hex strokes, itinerary-view AVAILABLE_MODES).
//
// Shaped to become admin-configurable later: TRANSPORT_MODES is a plain ordered
// list of definitions that could be sourced from an API/DB without changing call
// sites — consumers go through the getMode* lookups, never reach in directly.
//
// IMPORTANT — this is styling only. It does NOT normalize the divergent, partly
// persisted/contract-bound mode *identifier* taxonomies used elsewhere
// (DayTransportPanel.ENHANCED_MODES, trip-transport-planner.TRANSPORT_MODES).
// See docs/planning/transport-mode-taxonomy-audit.md. Every lookup falls back
// gracefully so persisted/foreign ids (e.g. "rideshare", "private_driver",
// "public_transit") still style cleanly instead of throwing or rendering blank.
import { Footprints, TrainFront, Car, Bus, Ship, Bike, type LucideIcon } from "lucide-react";

export interface TransportModeDef {
  id: string;
  label: string;
  /** Badge / icon tint. */
  color: string;
  icon: LucideIcon;
  /** Google Maps polyline style for this mode's leg segment. */
  polyline: google.maps.PolylineOptions;
}

// Dashed symbol used by the walking polyline.
const DASH: google.maps.Symbol = { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 4 };

// Graceful fallbacks for any mode id not in the canonical set.
export const DEFAULT_MODE_COLOR = "#94a3b8";
export const DEFAULT_MODE_ICON: LucideIcon = Footprints;
export const DEFAULT_POLYLINE_STYLE: google.maps.PolylineOptions = {
  strokeColor: "#6B7280",
  strokeOpacity: 0.7,
  strokeWeight: 2,
};

// Canonical, ordered (display order) mode registry. Values preserve the prior
// behavior of the sites being consolidated exactly.
export const TRANSPORT_MODES: TransportModeDef[] = [
  { id: "walk", label: "Walking", color: "#22c55e", icon: Footprints, polyline: { strokeColor: "#22C55E", strokeOpacity: 0, strokeWeight: 3, icons: [{ icon: DASH, offset: "0", repeat: "16px" }] } },
  { id: "train", label: "Train", color: "#3b82f6", icon: TrainFront, polyline: { strokeColor: "#3B82F6", strokeOpacity: 0.8, strokeWeight: 3 } },
  { id: "taxi", label: "Taxi", color: "#f59e0b", icon: Car, polyline: { strokeColor: "#F59E0B", strokeOpacity: 0.8, strokeWeight: 3 } },
  { id: "car", label: "Car", color: "#f59e0b", icon: Car, polyline: { strokeColor: "#F59E0B", strokeOpacity: 0.8, strokeWeight: 3 } },
  { id: "bus", label: "Bus", color: "#8b5cf6", icon: Bus, polyline: { strokeColor: "#8B5CF6", strokeOpacity: 0.8, strokeWeight: 3 } },
  // Note: shuttle's badge tint (#ec4899) differs from its polyline stroke
  // (#8B5CF6, shared with bus) — preserved from the prior code intentionally.
  { id: "shuttle", label: "Shuttle", color: "#ec4899", icon: Bus, polyline: { strokeColor: "#8B5CF6", strokeOpacity: 0.8, strokeWeight: 3 } },
  { id: "ferry", label: "Ferry", color: "#06b6d4", icon: Ship, polyline: { strokeColor: "#06B6D4", strokeOpacity: 0.8, strokeWeight: 3 } },
  // Note: bicycle had no dedicated polyline case before, so it used the default
  // gray stroke. Preserved to avoid a visual change in this styling-only pass.
  { id: "bicycle", label: "Bicycle", color: "#84cc16", icon: Bike, polyline: DEFAULT_POLYLINE_STYLE },
];

const MODE_BY_ID: Record<string, TransportModeDef> = Object.fromEntries(
  TRANSPORT_MODES.map((m) => [m.id, m]),
);

/** Canonical display mode ids, in display order. */
export const TRANSPORT_MODE_IDS: string[] = TRANSPORT_MODES.map((m) => m.id);

/** Badge/icon tint for a mode id (falls back to a neutral gray). */
export function getModeColor(mode: string): string {
  return MODE_BY_ID[mode]?.color ?? DEFAULT_MODE_COLOR;
}

/** Lucide icon component for a mode id (falls back to Footprints). */
export function getModeIcon(mode: string): LucideIcon {
  return MODE_BY_ID[mode]?.icon ?? DEFAULT_MODE_ICON;
}

/** Map polyline style for a mode id (falls back to the default gray stroke). */
export function getModePolylineStyle(mode: string): google.maps.PolylineOptions {
  return MODE_BY_ID[mode]?.polyline ?? DEFAULT_POLYLINE_STYLE;
}

/** Back-compat map: mode id → color. Prefer getModeColor for fallback safety. */
export const MODE_COLORS: Record<string, string> = Object.fromEntries(
  TRANSPORT_MODES.map((m) => [m.id, m.color]),
);

/** Back-compat map: mode id → icon. Prefer getModeIcon for fallback safety. */
export const MODE_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  TRANSPORT_MODES.map((m) => [m.id, m.icon]),
);
