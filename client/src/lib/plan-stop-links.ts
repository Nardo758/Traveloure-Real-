/**
 * LL-1 (spec live-links.md, LL-1 only — no outside links, no migrations).
 *
 * TWO pure decisions live here, so the surfaces read one rule each:
 *
 *   1. Where a plan stop's in-app "Details" link goes. Traveloure detail page ONLY: no official site,
 *      no outside URL, no booking/checkout/Ask link from the plan. A priced item goes to the same
 *      in-app page as anything else and gains nothing extra.
 *   2. Which travel-mode icon a leg shows. walk / train / bus / taxi only; an unknown mode shows NO
 *      icon rather than a guessed one (the spec's "no ranking, no invented data" line).
 *
 * PENDING STRINGS — every one of these needs Leon's "Wording approved — Leon" before merge. They are
 * plain placeholders, not final copy, and they are the only new user-facing text in this change.
 */
export const PENDING_LL1_STRINGS = {
  // PENDING Leon wording
  onDay: (n: number) => `On Day ${n}`,
  // PENDING Leon wording
  backToPlan: "Back to plan",
  // PENDING Leon wording — one screen-reader label per icon
  ariaWalk: "Walk to the next stop",
  // PENDING Leon wording
  ariaBoat: "Boat to the next stop",
  // PENDING Leon wording
  ariaTrain: "Train to the next stop",
  // PENDING Leon wording
  ariaBus: "Bus to the next stop",
  // PENDING Leon wording
  ariaTaxi: "Taxi to the next stop",
} as const;

/** The four modes the spec names. Anything else — transit, tram, rideshare, drive — has no icon. */
export type TravelModeIcon = "walk" | "train" | "bus" | "taxi" | "boat";

const MODE_TO_ICON: Record<string, TravelModeIcon> = {
  walk: "walk",
  walking: "walk",
  foot: "walk",
  train: "train",
  rail: "train",
  bus: "bus",
  coach: "bus",
  taxi: "taxi",
  cab: "taxi",
  // Water travel: the two values this codebase actually uses (maps.ts/navigate.ts unions, and
  // transport-modes.ts already draws ferry with lucide Ship). `water_taxi` is NOT a mode here - it is a
  // localName ("Lancha / Water taxi") on a ferry profile in server/data/transport-profiles.ts.
  ferry: "boat",
  boat: "boat",
};

export function travelModeIcon(mode: string | null | undefined): TravelModeIcon | null {
  if (!mode) return null;
  return MODE_TO_ICON[String(mode).trim().toLowerCase()] ?? null;
}

export function travelModeAriaLabel(icon: TravelModeIcon): string {
  switch (icon) {
    case "walk":
      return PENDING_LL1_STRINGS.ariaWalk;
    case "train":
      return PENDING_LL1_STRINGS.ariaTrain;
    case "bus":
      return PENDING_LL1_STRINGS.ariaBus;
    case "taxi":
      return PENDING_LL1_STRINGS.ariaTaxi;
    case "boat":
      return PENDING_LL1_STRINGS.ariaBoat;
  }
}

/**
 * A plan stop as the detail link needs it. Deliberately structural: the surfaces already carry these
 * fields, and this file must not learn a second item taxonomy.
 */
export interface PlanStopLinkSource {
  /** gem | event | experience | place | activity (whatever the surface calls it) */
  kind?: string | null;
  type?: string | null;
  contentType?: string | null;
  slug?: string | null;
  sourceId?: string | null;
  city?: string | null;
}

/**
 * The in-app page for a stop, or null when the stop names nothing this app can open. NEVER an outside
 * URL: every branch returns a path on this origin (spec LL-1: "Traveloure detail page only").
 */
export function stopDetailHref(stop: PlanStopLinkSource | null | undefined): string | null {
  if (!stop) return null;
  const kind = String(stop.kind ?? stop.type ?? stop.contentType ?? "").toLowerCase();
  const slug = stop.slug ? String(stop.slug).trim() : "";
  const sourceId = stop.sourceId ? String(stop.sourceId).trim() : "";
  const city = stop.city ? String(stop.city).trim() : "";

  if (kind.includes("event") && sourceId) return `/events/${encodeURIComponent(sourceId)}`;
  if ((kind.includes("experience") || kind.includes("ready") || kind.includes("priced")) && slug) {
    return `/experiences/${encodeURIComponent(slug)}`;
  }
  // Gems, activities and places all read as a place on this origin.
  if (city && (kind.includes("gem") || kind.includes("place") || kind.includes("activ") || kind === "")) {
    return `/places/${encodeURIComponent(city)}`;
  }
  return null;
}

/** LL-1's own guard, asserted by the test: nothing this module returns may leave the origin. */
export function isInAppHref(href: string | null): boolean {
  if (!href) return false;
  return href.startsWith("/") && !href.startsWith("//");
}
