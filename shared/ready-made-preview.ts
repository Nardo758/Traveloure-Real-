/**
 * THE READY MADE TRIP'S PUBLIC PREVIEW, PURE HALF (Slice B1 — work plan L3-1 + L3-14; ledger
 * `2026-10-05-rmt-public-preview`). No DOM, no network.
 *
 * THE SLUG IS DERIVED, NEVER STORED. `ready_made_trips` has no slug column, and adding one would be a
 * schema change nobody ratified. `/t/<slug>` is the title in kebab case plus a 10-character token of
 * the listing's own id: the TOKEN is authoritative and the words are decoration, so a retitled listing
 * keeps working and the page answers with its canonical slug. A token that matches no listing — or
 * more than one — is not found (never a guess between two).
 *
 * THE PRICE LINE IS WHAT THE BUYER PAYS. `readyMadeBuyerTotalCents` is the number every price the
 * preview prints, and it equals what the purchase route charges (`listing.priceCents`): today the
 * purchase adds no traveler service fee (R-bc: none on the Ready Made purchase in beta), so the line
 * says "no fee on this purchase" — deliberately narrow, because bookings made from the copy DO carry
 * the traveler fee and "fees included" could be read as covering them. `ready-made-preview.db.test.ts`
 * P4 pins the charge and this number together, so a change to either one fails CI rather than letting
 * the printed price drift from the charge. R-bc's admin toggle is DEFERRED, not withdrawn: it lands
 * with the fee itself, in one PR where the charge and this line read the same setting.
 */

export const READY_MADE_SLUG_TOKEN_LENGTH = 10;
const TOKEN_RE = new RegExp(`(?:^|-)([a-z0-9]{${READY_MADE_SLUG_TOKEN_LENGTH}})$`);

/** The listing id's token: its letters and digits, lower-cased, first 10. */
export function readyMadeIdToken(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, READY_MADE_SLUG_TOKEN_LENGTH);
}

export function kebab(text: string, max = 60): string {
  const k = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return k.slice(0, max).replace(/-+$/g, "");
}

/** `/t/<slug>`'s slug for a listing: "kyoto-temples-and-tea-3f9a1c2b7e". */
export function readyMadeSlug(listing: { id: string; title?: string | null }): string {
  const words = kebab(listing.title ?? "");
  const token = readyMadeIdToken(listing.id);
  return words ? `${words}-${token}` : token;
}

/** The token a slug carries, or null when it carries none. */
export function readyMadeSlugToken(slug: string | null | undefined): string | null {
  const m = TOKEN_RE.exec(String(slug ?? "").toLowerCase().trim());
  return m ? m[1] : null;
}

export function readyMadePreviewPath(listing: { id: string; title?: string | null }): string {
  return `/t/${readyMadeSlug(listing)}`;
}

/** What a Ready Made purchase charges — the listing price; the ONE answer (see the header). */
export function readyMadeBuyerTotalCents(listing: { priceCents: number | null | undefined }): number | null {
  const p = listing.priceCents;
  return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
}

function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "From $49 · no fee on this purchase" / "From $49 per traveler · no fee on this purchase"; null when no price is set (§13). */
export function readyMadePriceLine(listing: { priceCents: number | null | undefined; pricingMode?: string | null }): string | null {
  const total = readyMadeBuyerTotalCents(listing);
  if (total == null) return null;
  const per = listing.pricingMode === "per_traveler" ? " per traveler" : "";
  return `From ${dollars(total)}${per} · no fee on this purchase`;
}

/**
 * CP-1 PR 2 (ledger `2026-10-15-cp1-teasers`): the sample day is an OUTLINE — how many stops, and the
 * areas they are in. Never a stop's title, time or place name, and never a leg's minutes; those are
 * what the buyer pays for.
 */
export interface ReadyMadePreviewOutlineDay {
  dayNumber: number;
  stopCount: number;
  /** Distinct neighbourhood names, in the order the day reaches them; empty when none is known. */
  areas: string[];
}

export interface ReadyMadePreview {
  id: string;
  slug: string;
  path: string;
  title: string;
  market: string;
  durationDays: number;
  planLabel: string;
  heroImageUrl: string | null;
  heroCredit: { photographer: string; profileUrl: string | null; source: string | null } | null;
  priceLine: string | null;
  expert: { name: string; handle: string | null; localVerified: boolean };
  sampleDay: ReadyMadePreviewOutlineDay | null;
  /** How many of the trip's days stay behind the purchase. */
  lockedDays: number;
}

/**
 * Day 1 of the listing's build as an outline: its stop count and the distinct areas its stops are in,
 * in order. `areaOf` names a stop's area (null when unknown); the caller supplies it so this stays pure.
 */
export function sampleDayOf(
  items: ReadonlyArray<{ id: string; dayNumber: number | null }>,
  areaOf: (item: { id: string }) => string | null,
  maxAreas = 3,
): ReadyMadePreview["sampleDay"] {
  const day = items.filter((i) => i.dayNumber === 1);
  if (!day.length) return null;
  const areas: string[] = [];
  for (const i of day) {
    const a = areaOf(i);
    if (a && !areas.includes(a) && areas.length < maxAreas) areas.push(a);
  }
  return { dayNumber: 1, stopCount: day.length, areas };
}

/** "Day 1 · 4 stops · Higashiyama, Gion" — the outline's one line. */
export function outlineDayLine(day: ReadyMadePreviewOutlineDay): string {
  const stops = `${day.stopCount} ${day.stopCount === 1 ? "stop" : "stops"}`;
  return day.areas.length ? `Day ${day.dayNumber} · ${stops} · ${day.areas.join(", ")}` : `Day ${day.dayNumber} · ${stops}`;
}

const PHOTO_SOURCES: ReadonlyArray<[host: string, name: string]> = [
  ["unsplash.com", "Unsplash"],
  ["pexels.com", "Pexels"],
  ["wikimedia.org", "Wikimedia Commons"],
];

/**
 * The library a cover photo came from, as its own metadata says — an Unsplash id, or the host of the
 * photographer's profile URL. NULL when neither names one: the credit then names the photographer
 * alone (§13 — crediting the wrong library is worse than naming none).
 */
export function photoSourceName(meta: { profileUrl?: string | null; unsplashId?: string | null } | null | undefined): string | null {
  if (meta?.unsplashId) return "Unsplash";
  if (!meta?.profileUrl) return null;
  try {
    const host = new URL(meta.profileUrl).hostname.toLowerCase();
    return PHOTO_SOURCES.find(([h]) => host === h || host.endsWith(`.${h}`))?.[1] ?? null;
  } catch {
    return null;
  }
}
