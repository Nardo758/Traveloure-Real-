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
 * purchase adds no traveler service fee (spec v1.3.5 §15 — none on the Ready Made purchase in beta),
 * so "fees included" is true. `ready-made-preview.db.test.ts` P4 pins the two together, so a change to
 * either one fails CI rather than letting the printed price drift from the charge.
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

/** "From $49 · fees included" / "From $49 per traveler · fees included"; null when no price is set (§13). */
export function readyMadePriceLine(listing: { priceCents: number | null | undefined; pricingMode?: string | null }): string | null {
  const total = readyMadeBuyerTotalCents(listing);
  if (total == null) return null;
  const per = listing.pricingMode === "per_traveler" ? " per traveler" : "";
  return `From ${dollars(total)}${per} · fees included`;
}

export interface ReadyMadePreviewStop {
  title: string;
  startTime: string | null;
  itemType: string | null;
  locationName: string | null;
}
export interface ReadyMadePreviewLeg {
  /** Index into `stops`. */
  fromIndex: number;
  toIndex: number;
  mode: string;
  minutes: number;
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
  heroCredit: { photographer: string; profileUrl: string | null } | null;
  priceLine: string | null;
  expert: { name: string; handle: string | null; localVerified: boolean };
  sampleDay: { dayNumber: number; stops: ReadyMadePreviewStop[]; legs: ReadyMadePreviewLeg[] } | null;
  /** How many of the trip's days stay behind the purchase. */
  lockedDays: number;
}

/** Day 1 of the listing's build: its stops in the engine's own order and the confirmed legs between them. */
export function sampleDayOf(
  items: ReadonlyArray<{ id: string; title: string; dayNumber: number | null; startTime?: string | null; itemType?: string | null; locationName?: string | null }>,
  legs: ReadonlyArray<{ fromActivityId: string | null; toActivityId: string | null; proposalStatus: string | null; userSelectedMode: string | null; recommendedMode: string | null; estimatedDurationMinutes: number | null }>,
): ReadyMadePreview["sampleDay"] {
  const day = items.filter((i) => i.dayNumber === 1);
  if (!day.length) return null;
  const stops: ReadyMadePreviewStop[] = day.map((i) => ({
    title: i.title,
    startTime: i.startTime ?? null,
    itemType: i.itemType ?? null,
    locationName: i.locationName ?? null,
  }));
  const index = new Map(day.map((i, n) => [i.id, n] as const));
  const out: ReadyMadePreviewLeg[] = [];
  for (const l of legs) {
    if (l.proposalStatus !== "confirmed" || !l.fromActivityId || !l.toActivityId) continue;
    const from = index.get(l.fromActivityId);
    const to = index.get(l.toActivityId);
    const mode = (l.userSelectedMode || l.recommendedMode || "").trim() || null; // the author's pick, else the recommendation
    const minutes = Number(l.estimatedDurationMinutes);
    if (from == null || to == null || !mode || !Number.isFinite(minutes) || minutes <= 0) continue;
    out.push({ fromIndex: from, toIndex: to, mode, minutes });
  }
  out.sort((a, b) => a.fromIndex - b.fromIndex);
  return { dayNumber: 1, stops, legs: out };
}
