/**
 * THE VERSIONS BOARD's rules (surface step 5; spec v1.2 §2.4; rulings R-d, R-ac; ledger
 * `2026-10-04-surface-step5-map-versions`). Pure — read by the server's versions read and by the
 * client's board and map toggle, so a day's diff, a badge and a re-time count have ONE author (§18
 * rule 1).
 *
 *   · DAY DIFF BY ITEM ID: a version stop names the plan item it keeps (`sourceItemId`, migration
 *     343). moved = same id, different slot (another day, another position or another start);
 *     dropped = a plan item the version holds nowhere; added = a stop with no plan item behind it.
 *     An older run has no ids: stops then match by listing, then by title, and the day says
 *     "matched by name" — as does any day where two stops share a title (the collision the label is
 *     for), even on a new run.
 *   · BADGES: relative labels only, computed from each version's own stored stops (fixed for the
 *     run): "least travel" (straight-line path between located stops), "most time at stops" (stop
 *     durations), "earliest evenings" (the day's last end, averaged). A metric badges only a STRICT
 *     winner, only when every version has the data, and a card wears at most one badge. No minute,
 *     hour or distance value leaves (R-h).
 *   · FREE RE-TIMES (R-ac): `OPTIMIZER_FREE_RETIMES` (default 3) within 24 h of the paid run, same
 *     version. Past that, the re-time is a paid run and the UI says so BEFORE it happens.
 */

export interface BoardStop {
  /** A plan item id (plan) or a version item id (version). */
  id: string;
  /** Version stops only: the plan item this stop keeps (migration 343); null when none / unknown. */
  sourceItemId?: string | null;
  providerServiceId?: string | null;
  name: string;
  dayNumber: number;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  lat?: number | null;
  lng?: number | null;
  /**
   * Plan stops only: a FIXED point the optimizer never moves or drops (booked or checked out, expert
   * work, locked). It is not in any version by construction, so the diff leaves it out entirely —
   * never "dropped".
   */
  fixed?: boolean;
}

export interface DayDiff {
  dayNumber: number;
  /** Version stop id → plan item id, for stops that keep a plan item in a different slot. */
  moved: Array<{ versionStopId: string; planItemId: string }>;
  /** Plan items on this day that the version holds NOWHERE. */
  dropped: string[];
  /** Version stops on this day with no plan item behind them. */
  added: string[];
  /** Kept in the same slot. */
  kept: Array<{ versionStopId: string; planItemId: string }>;
  identical: boolean;
  /** Any match on this day fell back to listing/title, or two stops share a title. */
  matchedByName: boolean;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const hhmm = (t: string | null | undefined) => (/^\d{2}:\d{2}/.test(t ?? "") ? (t as string).slice(0, 5) : null);

function byDay<T extends BoardStop>(stops: readonly T[]): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const st of stops) {
    const list = m.get(st.dayNumber) ?? [];
    list.push(st);
    m.set(st.dayNumber, list);
  }
  return m;
}

/**
 * Match every version stop to a plan item: by `sourceItemId` first (only when the plan still holds
 * that id), then — for a stop with no usable id — by listing, then by title. Each plan item is
 * matched at most once. Returns version stop id → { planItemId, byName }.
 */
export function matchVersionStops(
  plan: readonly BoardStop[],
  version: readonly BoardStop[],
): Map<string, { planItemId: string; byName: boolean }> {
  const out = new Map<string, { planItemId: string; byName: boolean }>();
  const planIds = new Set(plan.map((p) => p.id));
  const used = new Set<string>();
  for (const v of version) {
    if (v.sourceItemId && planIds.has(v.sourceItemId) && !used.has(v.sourceItemId)) {
      out.set(v.id, { planItemId: v.sourceItemId, byName: false });
      used.add(v.sourceItemId);
    }
  }
  for (const v of version) {
    if (out.has(v.id)) continue;
    const viaListing = v.providerServiceId ? plan.find((p) => !used.has(p.id) && p.providerServiceId === v.providerServiceId) : undefined;
    const viaTitle = viaListing ?? plan.find((p) => !used.has(p.id) && norm(p.name) !== "" && norm(p.name) === norm(v.name));
    if (viaTitle) {
      out.set(v.id, { planItemId: viaTitle.id, byName: true });
      used.add(viaTitle.id);
    }
  }
  return out;
}

/** The day-by-day diff of one version against the plan. Days are the union of both sides. */
export function diffVersionDays(planAll: readonly BoardStop[], version: readonly BoardStop[]): DayDiff[] {
  const plan = planAll.filter((p) => !p.fixed);
  const match = matchVersionStops(plan, version);
  const planById = new Map(plan.map((p) => [p.id, p]));
  const matchedPlanIds = new Set(Array.from(match.values()).map((m) => m.planItemId));
  const planDays = byDay(plan);
  const versionDays = byDay(version);
  const days = Array.from(new Set([...Array.from(planDays.keys()), ...Array.from(versionDays.keys())])).sort((a, b) => a - b);
  return days.map((dayNumber) => {
    const vDay = versionDays.get(dayNumber) ?? [];
    const pDay = planDays.get(dayNumber) ?? [];
    const moved: DayDiff["moved"] = [];
    const kept: DayDiff["kept"] = [];
    const added: string[] = [];
    let matchedByName = false;
    vDay.forEach((v, position) => {
      const m = match.get(v.id);
      if (!m) {
        added.push(v.id);
        return;
      }
      if (m.byName) matchedByName = true;
      const p = planById.get(m.planItemId)!;
      const planPosition = pDay.findIndex((x) => x.id === p.id);
      const sameSlot = p.dayNumber === dayNumber && planPosition === position && hhmm(p.startTime) === hhmm(v.startTime);
      (sameSlot ? kept : moved).push({ versionStopId: v.id, planItemId: p.id });
    });
    const dropped = pDay.filter((p) => !matchedPlanIds.has(p.id)).map((p) => p.id);
    const vTitles = vDay.map((s) => norm(s.name)).filter(Boolean);
    const pTitles = pDay.map((s) => norm(s.name)).filter(Boolean);
    if (new Set(vTitles).size < vTitles.length || new Set(pTitles).size < pTitles.length) matchedByName = true;
    return {
      dayNumber,
      moved,
      dropped,
      added,
      kept,
      identical: moved.length === 0 && dropped.length === 0 && added.length === 0 && vDay.length === pDay.length,
      matchedByName,
    };
  });
}

/** The day's one-line change summary from its diff, e.g. "2 moved · 1 dropped · 1 added". */
export function daySummary(d: DayDiff): string {
  if (d.identical) return "Same as draft";
  const parts: string[] = [];
  if (d.moved.length) parts.push(`${d.moved.length} moved`);
  if (d.dropped.length) parts.push(`${d.dropped.length} dropped`);
  if (d.added.length) parts.push(`${d.added.length} added`);
  return parts.join(" · ") || "Reordered";
}

// ── badges ──────────────────────────────────────────────────────────────────────────────────────

export const BADGE_LABELS = {
  least_travel: "Least travel",
  most_time_at_stops: "Most time at stops",
  earliest_evenings: "Earliest evenings",
} as const;
export type BadgeKey = keyof typeof BADGE_LABELS;

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const minutesOf = (t: string | null | undefined): number | null => {
  const h = hhmm(t);
  if (!h) return null;
  const [H, M] = h.split(":").map(Number);
  return H * 60 + M;
};

/** The three measures for one version. Null where the version's stops do not carry the data. */
export function versionMeasures(stops: readonly BoardStop[]): Record<BadgeKey, number | null> {
  const days = byDay(stops);
  let travel = 0;
  let travelKnown = false;
  for (const list of Array.from(days.values())) {
    const located = list.filter((s) => typeof s.lat === "number" && typeof s.lng === "number") as Array<BoardStop & { lat: number; lng: number }>;
    for (let i = 1; i < located.length; i++) {
      travel += metersBetween(located[i - 1], located[i]);
      travelKnown = true;
    }
  }
  let atStops = 0;
  let allTimed = stops.length > 0;
  for (const s of stops) {
    const d =
      s.durationMinutes ?? (minutesOf(s.endTime) != null && minutesOf(s.startTime) != null ? minutesOf(s.endTime)! - minutesOf(s.startTime)! : null);
    if (d == null || d <= 0) {
      allTimed = false;
      break;
    }
    atStops += d;
  }
  const lastEnds: number[] = [];
  let endsKnown = days.size > 0;
  for (const list of Array.from(days.values())) {
    const ends = list.map((s) => minutesOf(s.endTime) ?? minutesOf(s.startTime)).filter((x): x is number => x != null);
    if (!ends.length) {
      endsKnown = false;
      break;
    }
    lastEnds.push(Math.max(...ends));
  }
  return {
    least_travel: travelKnown ? travel : null,
    most_time_at_stops: allTimed ? atStops : null,
    earliest_evenings: endsKnown ? lastEnds.reduce((a, b) => a + b, 0) / lastEnds.length : null,
  };
}

/**
 * One badge per card, only where a metric has a STRICT winner and every version has the data.
 * Metrics are awarded in label order; a card that already wears a badge does not take a second.
 */
export function versionBadges(versions: ReadonlyArray<{ id: string; stops: readonly BoardStop[] }>): Map<string, BadgeKey> {
  const out = new Map<string, BadgeKey>();
  if (versions.length < 2) return out;
  const measures = versions.map((v) => ({ id: v.id, m: versionMeasures(v.stops) }));
  const order: Array<[BadgeKey, "min" | "max"]> = [
    ["least_travel", "min"],
    ["most_time_at_stops", "max"],
    ["earliest_evenings", "min"],
  ];
  for (const [key, dir] of order) {
    const vals = measures.map((x) => x.m[key]);
    if (vals.some((v) => v == null)) continue;
    const best = dir === "min" ? Math.min(...(vals as number[])) : Math.max(...(vals as number[]));
    const winners = measures.filter((x) => x.m[key] === best);
    if (winners.length !== 1) continue;
    if (out.has(winners[0].id)) continue;
    out.set(winners[0].id, key);
  }
  return out;
}

// ── free re-times (R-ac) ────────────────────────────────────────────────────────────────────────

export const FREE_RETIME_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Is a re-time still free? Inside 24 h of the paid run and under the limit for that version. */
export function retimeIsFree(input: { runAt: Date | string | null; now: Date; used: number; limit: number }): boolean {
  if (!input.runAt) return false;
  const runAt = new Date(input.runAt).getTime();
  if (!Number.isFinite(runAt)) return false;
  return input.now.getTime() - runAt <= FREE_RETIME_WINDOW_MS && input.used < input.limit;
}

/** The board's line about re-times, said BEFORE one happens. */
export function retimeLine(input: { free: boolean; remaining: number; feeLabel: string | null }): string {
  if (input.free) return `Re-timing a day is free · ${input.remaining} left`;
  return input.feeLabel ? `Re-timing now is a paid run · Optimize · ${input.feeLabel}` : "Re-timing now is a paid run";
}

/** Version labels by run order (sortOrder 1, 2, 3 ⇒ A, B, C). */
export function versionLabel(index: number): string {
  return String.fromCharCode(65 + index);
}
