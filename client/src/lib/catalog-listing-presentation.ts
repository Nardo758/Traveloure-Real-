/**
 * CATALOG REBUILD — pure presentation-derivation helpers for the mock-faithful
 * `/provider/services` page (docs/design/service-creation-mock.html, `panel-catalog`).
 *
 * Extracted so the search filter, the status-chip bucketing and the availability-chip
 * derivation are unit-testable without a DOM (repo convention — see
 * `service-form-required.ts` / `catalog-error-copy.ts` siblings in this directory).
 *
 * §13 posture throughout: every function here describes REAL data it was given — it
 * never invents a chip, a count or a label the caller didn't supply.
 */

// ─── status bucket (drives the mock's All / Live / In review / Draft chips) ────────────

export type CatalogStatusBucket = "live" | "in_review" | "draft" | "archived" | "other";

export interface CatalogStatusLike {
  approvalStatus?: string | null;
  status?: string | null;
}

/**
 * Mirrors the SAME "what travelers can see" predicate the Preview toggle already uses
 * (`approvalStatus === 'approved' && status === 'active'`) for the Live bucket — one
 * definition of "live", not two. `draft` is its own bucket; `submitted`/`rejected` are
 * both "in review" (neither is a draft, neither is live — rejected is not a fourth chip
 * the mock doesn't have, so it reads as "still needs attention", not silently vanished).
 * Anything else (e.g. approved-but-paused, or a missing approvalStatus) is `other` —
 * visible in "All" but not claimed by any status chip.
 */
export function catalogStatusBucket(service: CatalogStatusLike): CatalogStatusBucket {
  // Gap #18: archived wins over every other read — an archived listing is out of circulation
  // regardless of what its approvalStatus still says, and must never be claimed by Live/In
  // review/Draft chips (it is terminal except deletion).
  if (service.status === "archived") return "archived";
  if (service.approvalStatus === "approved" && service.status === "active") return "live";
  if (service.approvalStatus === "draft") return "draft";
  if (service.approvalStatus === "submitted" || service.approvalStatus === "rejected") return "in_review";
  return "other";
}

export interface CatalogPillDisplay {
  label: string;
  /** mock pill class: 'live' | 'draft' | '' (the bare/default pill — "in review" and neutral states) */
  cls: "live" | "draft" | "";
}

/** The single compact status pill the mock's `.listing .lright` shows per row. */
export function catalogPillDisplay(service: CatalogStatusLike): CatalogPillDisplay {
  const bucket = catalogStatusBucket(service);
  if (bucket === "live") return { label: "Live", cls: "live" };
  if (bucket === "archived") return { label: "Archived", cls: "" };
  if (bucket === "draft") return { label: "Draft", cls: "draft" };
  if (bucket === "in_review") {
    return service.approvalStatus === "rejected"
      ? { label: "Rejected", cls: "" }
      : { label: "In review", cls: "" };
  }
  // approved but paused (or an approvalStatus we don't otherwise recognize)
  return { label: service.status === "active" ? "Active" : "Paused", cls: "" };
}

// ─── search filter (name / category, client-side) ──────────────────────────────────────

/** Case-insensitive substring match against a listing's name and (optionally) its
 *  resolved category name. An empty/whitespace query matches everything. */
export function matchesCatalogSearch(query: string, name: string, categoryName?: string | null): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (name.toLowerCase().includes(q)) return true;
  if (categoryName && categoryName.trim().toLowerCase().includes(q)) return true;
  return false;
}

// ─── availability chips (compact per-listing summary, real slot data only) ─────────────

export interface CatalogAvailabilitySlotLike {
  date: string; // "YYYY-MM-DD"
  startTime: string | null;
  capacity: number | null;
  bookedCount: number | null;
  status: string | null; // 'available' | 'blocked' (server vocabulary — vendor_availability_slots.status)
}

export interface CatalogAvailabilityChip {
  label: string;
  blocked: boolean;
  full: boolean;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Upcoming (>= today), soonest-first, capped at `limit`. Mirrors the mock's
 *  "Mon 09:00 · 2 left" / "Tue — blocked" chip vocabulary exactly — nothing invented for
 *  a status this module wasn't given. Caller renders "No availability published yet" when
 *  this returns an empty array (§13 — never a guessed chip). */
export function deriveAvailabilityChips(
  slots: CatalogAvailabilitySlotLike[],
  opts: { limit?: number; today?: string } = {},
): CatalogAvailabilityChip[] {
  const limit = opts.limit ?? 4;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const upcoming = [...slots]
    .filter((s) => s.date >= today)
    .sort((a, b) => (a.date + (a.startTime ?? "")).localeCompare(b.date + (b.startTime ?? "")));

  return upcoming.slice(0, limit).map((s) => {
    const d = new Date(`${s.date}T00:00:00`);
    const weekday = Number.isNaN(d.getTime()) ? s.date : WEEKDAY_SHORT[d.getDay()];
    const dayLabel = s.startTime ? `${weekday} ${s.startTime}` : weekday;

    if (s.status === "blocked") {
      return { label: `${dayLabel} — blocked`, blocked: true, full: false };
    }
    const capacity = s.capacity ?? 1;
    const booked = s.bookedCount ?? 0;
    const remaining = capacity - booked;
    if (remaining <= 0) {
      return { label: `${dayLabel} — full`, blocked: false, full: true };
    }
    return { label: `${dayLabel} · ${remaining} left`, blocked: false, full: false };
  });
}
