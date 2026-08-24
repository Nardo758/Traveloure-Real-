/**
 * Operation Trailhead — LANE T4 (traveler read-path for scraped content).
 *
 * Single source of truth (L6 — one computation, no client restatement) for:
 *   1. the inventory-class vocabulary of a scraped/DMO stub,
 *   2. the discover-page read filter predicate (published + not rejected),
 *   3. the admin publish-to-discover eligibility predicate, and
 *   4. the render-time trend headline (T4.4) — computed, NEVER stored.
 *
 * Pure functions with NO database import, so the publish/read/render logic is
 * provable DB-free (server/__tests__/trailhead-t4-publish-gate.test.ts).
 *
 * Ruling implemented: R-T1-e — T4 builds the storefront for scraped content,
 * parallel to ignition; born-hidden (discover_page_visible defaults false) is
 * the safety. A stub is invisible to travelers until an admin flips it.
 */

// ── 1. Inventory class ────────────────────────────────────────────────────────
// 'external'  — scraped/DMO facts-and-links stub (never a bookable platform service)
// 'provider'  — a platform_provider listing (reserved for a later resolution-waterfall re-class)
// 'affiliate' — an affiliate-fulfilled listing (reserved likewise)
export const INVENTORY_CLASSES = ["external", "provider", "affiliate"] as const;
export type InventoryClass = (typeof INVENTORY_CLASSES)[number];

/** Scraped stubs are born external. */
export const DEFAULT_INVENTORY_CLASS: InventoryClass = "external";

export function isValidInventoryClass(v: unknown): v is InventoryClass {
  return typeof v === "string" && (INVENTORY_CLASSES as readonly string[]).includes(v);
}

/** Coerce any stored/incoming value to a valid class, defaulting to 'external'. */
export function normalizeInventoryClass(v: unknown): InventoryClass {
  return isValidInventoryClass(v) ? v : DEFAULT_INVENTORY_CLASS;
}

// ── 2. Discover read filter ───────────────────────────────────────────────────
// A stub reaches the traveler discover surfaces ONLY when it has been published
// (discover_page_visible = true) AND is not rejected/quarantined. Statuses here
// mirror dmoRawContent.status; a rejected/quarantined row can never be published
// but this predicate is belt-and-braces so a stale flag can never leak content.
const NON_RENDERABLE_STATUSES = new Set(["rejected", "quarantined"]);

export interface DiscoverGateRow {
  discoverPageVisible: boolean;
  status: string;
}

/** The single discover-visibility predicate the SQL read and the tests both honor. */
export function passesDiscoverFilter(row: DiscoverGateRow): boolean {
  return row.discoverPageVisible === true && !NON_RENDERABLE_STATUSES.has(row.status);
}

// ── 3. Admin publish-to-discover eligibility ──────────────────────────────────
// Only a REVIEWED stub may be published: it must already be in the expert library
// (expert_workspace_visible = true — the intake gate cleared), not yet published,
// and not rejected/quarantined. Born-hidden default is never touched by this — the
// flip only ever moves false → true on an eligible row.
export interface PublishEligibilityRow {
  expertWorkspaceVisible: boolean;
  discoverPageVisible: boolean;
  status: string;
}

export function canPublishToDiscover(row: PublishEligibilityRow): boolean {
  return (
    row.expertWorkspaceVisible === true &&
    row.discoverPageVisible === false &&
    !NON_RENDERABLE_STATUSES.has(row.status)
  );
}

// ── 4. Render-time trend headline (T4.4) ──────────────────────────────────────
// Honest copy ceiling: "‹Market› is trending · ‹Event› approaching". No per-place
// trending badge; NO trend value is ever written to a content row — this string is
// derived at render from the market-grain resolver's confidence flag and the nearest
// imminent calendar event, then discarded.
export interface TrendContextInput {
  /** Market-grain resolver cleared its confidence floor for this market. */
  marketTrending: boolean;
  marketName: string;
  /** Nearest imminent event name within the forward window, or null. */
  imminentEventName: string | null;
}

export function buildTrendContext(input: TrendContextInput): string | null {
  const parts: string[] = [];
  if (input.marketTrending && input.marketName.trim()) {
    parts.push(`${input.marketName.trim()} is trending`);
  }
  if (input.imminentEventName && input.imminentEventName.trim()) {
    parts.push(`${input.imminentEventName.trim()} approaching`);
  }
  return parts.length ? parts.join(" · ") : null;
}
