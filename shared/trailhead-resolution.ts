/**
 * Operation Trailhead — LANE T3 (booking-path resolution waterfall).
 *
 * Single source of truth (L6 — one computation, no client restatement) for the RESOLUTION
 * vocabulary + rung ORDER that the pass runner, the matchers, the schema, and the render card
 * all honor. Pure data + pure functions, NO database import, so the ordering/upgrade logic is
 * provable DB-free (server/__tests__/trailhead-t3-*.test.ts).
 *
 * Rulings implemented (docs/DECISIONS.md):
 *   - R-T3-a  RUNG ORDER IS LAW: provider → affiliate_direct → affiliate_ota → external.
 *             A stub matching a live platform provider links to that provider's listing and NEVER
 *             carries an outbound booking link (provider never competes). Direct beats intermediated.
 *   - R-T3-c  RE-RUNNABLE PASS: a stub stores resolution_class/subclass/ref/confidence; re-runs may
 *             UPGRADE up the rungs, never downgrade without the prior ref being audit-logged.
 *
 * ── The two-axis model, and WHY it is two axes ────────────────────────────────────────────────
 * The TOP-LEVEL class reuses the existing T4 inventory vocabulary VERBATIM (extend-don't-fork):
 *   INVENTORY_CLASSES = ['external','provider','affiliate']  (shared/discover-stub.ts)
 * The affiliate rung splits into affiliate_direct (the operator's own program) and affiliate_ota
 * (Klook/Tiqets/Viator/GYG/Civitatis). That split is a SEPARATE `resolution_subclass` field, NOT
 * encoded into `resolution_ref`:
 *   • `resolution_ref` is the POINTER (provider service id | program+product ref | source URL) — a
 *     value a consumer dereferences. Overloading it to also encode the rung would make both the
 *     pointer and the rung unparseable, and the render card would have to string-split a URL to know
 *     whether to draw an on-platform or a partner CTA. Two facts, two columns.
 *   • The 4-way ORDER the ruling names lives in a derived "qualified rung" (below), so the audit log
 *     records the exact rung even for a within-affiliate upgrade (ota → direct), which the top-level
 *     class alone (affiliate → affiliate) would hide.
 */

import { INVENTORY_CLASSES, type InventoryClass } from "./discover-stub";

// ── 1. Resolution class (reuses the T4 inventory vocabulary verbatim) ─────────────────────────────
// external  — no confident match; a facts-and-links reference stub (the born/default state).
// provider  — matched a live platform provider service; links to that internal listing, NO outbound.
// affiliate — matched an affiliate program; a monetized partner deep-link.
export const RESOLUTION_CLASSES = INVENTORY_CLASSES; // ['external','provider','affiliate']
export type ResolutionClass = InventoryClass;

/** A freshly-published stub is born unresolved ⇒ external (the same default as inventory_class). */
export const DEFAULT_RESOLUTION_CLASS: ResolutionClass = "external";

// ── 2. Affiliate subclass — the direct-vs-intermediated split (nullable everywhere else) ─────────
// Only meaningful when resolution_class === 'affiliate'. NULL for provider/external.
export const RESOLUTION_SUBCLASSES = ["affiliate_direct", "affiliate_ota"] as const;
export type ResolutionSubclass = (typeof RESOLUTION_SUBCLASSES)[number];

export function isValidResolutionSubclass(v: unknown): v is ResolutionSubclass {
  return typeof v === "string" && (RESOLUTION_SUBCLASSES as readonly string[]).includes(v);
}

// ── 3. The fully-qualified rung ladder — R-T3-a's ORDER, made explicit ────────────────────────────
// The 4 rungs the ruling names, WORST → BEST (index = rank). A "pass" may only ever move a stub to a
// HIGHER-ranked rung (an UPGRADE); any move to a lower rank is a DOWNGRADE and is forbidden without an
// audit row (R-T3-c). `external` is rank 0 (the floor a below-threshold match stays at); `provider` is
// the ceiling (R-T3-a: direct-platform beats every intermediated option).
export const RESOLUTION_RUNGS = [
  "external", // 0 — floor: no confident match
  "affiliate_ota", // 1 — recognized OTA catalog (intermediated)
  "affiliate_direct", // 2 — operator's own affiliate program (direct)
  "provider", // 3 — live platform provider (ceiling; never competed with, never outbound)
] as const;
export type ResolutionRung = (typeof RESOLUTION_RUNGS)[number];

const RUNG_RANK: Readonly<Record<ResolutionRung, number>> = Object.freeze(
  RESOLUTION_RUNGS.reduce(
    (acc, rung, i) => {
      acc[rung] = i;
      return acc;
    },
    {} as Record<ResolutionRung, number>,
  ),
);

/**
 * Derive the fully-qualified rung from the (class, subclass) pair the row stores. This is the SINGLE
 * bridge between the stored two-axis shape and the ordered ladder the pass + audit log reason over.
 * An 'affiliate' class with no subclass is a data error (the affiliate matcher must always stamp one);
 * we conservatively treat it as the LOWER affiliate rung (ota) so it can never out-rank a real direct.
 */
export function qualifiedRung(cls: ResolutionClass, subclass: ResolutionSubclass | null | undefined): ResolutionRung {
  if (cls === "provider") return "provider";
  if (cls === "affiliate") return subclass === "affiliate_direct" ? "affiliate_direct" : "affiliate_ota";
  return "external";
}

/** Rank of a fully-qualified rung (higher = better). */
export function rungRank(rung: ResolutionRung): number {
  return RUNG_RANK[rung];
}

/** Rank of a stored (class, subclass) pair. */
export function classRank(cls: ResolutionClass, subclass: ResolutionSubclass | null | undefined): number {
  return rungRank(qualifiedRung(cls, subclass));
}

/**
 * Is moving from `fromRung` to `toRung` an UPGRADE (strictly higher rank)? Equal-rung is NOT an
 * upgrade (a re-run that lands the same rung is a no-op, not an event). A strictly-lower toRung is a
 * DOWNGRADE — the pass runner must never apply it without writing an audit row first (R-T3-c).
 */
export function isUpgrade(fromRung: ResolutionRung, toRung: ResolutionRung): boolean {
  return rungRank(toRung) > rungRank(fromRung);
}

export function isDowngrade(fromRung: ResolutionRung, toRung: ResolutionRung): boolean {
  return rungRank(toRung) < rungRank(fromRung);
}

// ── 4. The stored resolution state on a stub (dmo_raw_content) ─────────────────────────────────────
export interface StubResolutionState {
  resolutionClass: ResolutionClass;
  resolutionSubclass: ResolutionSubclass | null;
  resolutionRef: string | null;
  /** 0.00–1.00 name/geo/category composite; NULL for the born-external floor. */
  matchConfidence: number | null;
  resolvedAt: Date | null;
}

/** The born/default resolution state: unresolved external, no ref, no confidence. */
export function defaultResolutionState(): StubResolutionState {
  return {
    resolutionClass: DEFAULT_RESOLUTION_CLASS,
    resolutionSubclass: null,
    resolutionRef: null,
    matchConfidence: null,
    resolvedAt: null,
  };
}
