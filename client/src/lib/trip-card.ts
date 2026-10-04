/**
 * The Trip Card's pure rules (surface spec v1.3.4 §2.5, R-ay; step 6 — ledger
 * `2026-10-04-step6-trip-card`). The card renders the frozen final on the SAME `DayBlock` and
 * `ItemRow` the slip uses (read mode); these helpers decide what only the card says: the day order
 * (Today first), the provenance line and the Navigate links. No fetch, no clock read here — the
 * caller passes "today" in the plan's own zone.
 */

export interface CardDay {
  dayNum: number;
  dateIso?: string | null;
}

/**
 * Today first, on trip dates: when today is one of the plan's days, the strip opens on it, then the
 * days after it, then the days already past (kept, at the end). Off trip dates the plan's own order.
 * Returns indices into `days`.
 */
export function cardDayOrder(days: readonly CardDay[], todayIso: string | null | undefined): number[] {
  const all = days.map((_, i) => i);
  if (!todayIso) return all;
  const t = days.findIndex((d) => d.dateIso === todayIso);
  if (t < 0) return all;
  return [...all.slice(t), ...all.slice(0, t)];
}

/** Is this day today (in the plan's zone)? */
export function isCardToday(day: CardDay, todayIso: string | null | undefined): boolean {
  return !!todayIso && day.dateIso === todayIso;
}

export interface NavigableStop {
  name: string;
  lat?: number | null;
  lng?: number | null;
}

const located = (s: NavigableStop): s is NavigableStop & { lat: number; lng: number } =>
  typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng);

const place = (s: NavigableStop, city: string | null | undefined): string | null => {
  if (located(s)) return `${s.lat},${s.lng}`;
  const name = (s.name ?? "").trim();
  if (!name) return null;
  const c = (city ?? "").split(",")[0].trim();
  return c && !name.toLowerCase().includes(c.toLowerCase()) ? `${name}, ${c}` : name;
};

const MAPS_DIR = "https://www.google.com/maps/dir/?api=1";

/**
 * R-ay: Navigate to one stop — a Google Maps directions deep link (no API call, no key). From the
 * traveler's current location; the place by its coordinates when located, else by name + city.
 */
export function navigateHref(stop: NavigableStop, city?: string | null): string | null {
  const dest = place(stop, city);
  return dest ? `${MAPS_DIR}&destination=${encodeURIComponent(dest)}` : null;
}

/** Google Maps takes at most this many waypoints in a directions link. */
export const NAVIGATE_MAX_WAYPOINTS = 9;

/**
 * R-ay: Navigate the day — the day's stops in order as one directions link (last stop the
 * destination, the ones before it waypoints, capped at Google's limit). Null with no stop to go to.
 */
export function dayNavigateHref(stops: readonly NavigableStop[], city?: string | null): string | null {
  const places = stops.map((s) => place(s, city)).filter((p): p is string => !!p);
  if (!places.length) return null;
  const dest = places[places.length - 1];
  const way = places.slice(0, -1).slice(0, NAVIGATE_MAX_WAYPOINTS);
  return `${MAPS_DIR}&destination=${encodeURIComponent(dest)}${way.length ? `&waypoints=${encodeURIComponent(way.join("|"))}` : ""}`;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string | Date | null | undefined, timeZone?: string | null): string | null => {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) });
  } catch {
    return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
};

/**
 * The card's provenance line (§2.5): "Finalized Oct 3 · built from Version A, run 1 · planned with
 * [expert] · hours re-checked Nov 8 · 3 of 24 booked". Every part is omitted when its fact is absent
 * (§13) — never "built from nothing", never "0 of 0 booked".
 */
export function cardProvenanceLine(input: {
  finalizedAt?: string | Date | null;
  finalVersion?: number | null;
  builtFrom?: { versionLabel: string; runNumber?: number | null } | null;
  advisorName?: string | null;
  hoursCheckedAt?: string | Date | null;
  booked?: number | null;
  total?: number | null;
  timeZone?: string | null;
}): string | null {
  const parts: string[] = [];
  const fin = shortDate(input.finalizedAt, input.timeZone);
  if (fin) parts.push(`Finalized ${fin}${input.finalVersion != null && input.finalVersion > 1 ? ` · v${input.finalVersion}` : ""}`);
  if (input.builtFrom?.versionLabel) {
    parts.push(`built from Version ${input.builtFrom.versionLabel}${input.builtFrom.runNumber != null ? `, run ${input.builtFrom.runNumber}` : ""}`);
  }
  if (input.advisorName?.trim()) parts.push(`planned with ${input.advisorName.trim()}`);
  const checked = shortDate(input.hoursCheckedAt, input.timeZone);
  if (checked) parts.push(`hours re-checked ${checked}`);
  if (input.total != null && input.total > 0 && input.booked != null) parts.push(`${input.booked} of ${input.total} booked`);
  return parts.length ? parts.join(" · ") : null;
}

/** R-e: a plan finalized without a run carries airport legs only, and says how to get the rest. */
export const CARD_ADD_TRAVEL_TIMES_LINE = "Add travel times · Optimize";
