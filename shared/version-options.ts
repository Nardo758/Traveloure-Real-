/**
 * THE PAID RUN, ONE VERSION PER HOTEL — the pure half (Track A step A7; product map §M5 amending
 * §F2 / R128; ledger `2026-09-30-a7-version-per-option`).
 *
 *   · SLOTS (§M5). With an open anchor set, each of the three versions anchors on ONE option: three
 *     options ⇒ one each; two ⇒ one each plus a third version on the better-fitting one; more than
 *     three ⇒ the top three by plan-fit, the others listed "not run" (never silently dropped); one
 *     option ⇒ all three on it. Order is the set's own plan-fit rank (unscored last), then position.
 *   · BADGES (R128). A version shows a badge only when its measured metric actually WINS among the
 *     AI versions — lowest total cost, least total travel, highest average rating. A tie wins nothing
 *     and a missing metric wins nothing (§13). No "for you" / "personalized" copy.
 *   · THE PICK (§F2 (2)). A version's option lives on ONE of its items, `metadata.optionId` (+ `setId`)
 *     — no schema change. A version with no such item left the set undecided.
 *
 * No I/O: the server injects the rows, so every rule is proven without a database.
 */

export const SLIP_VERSION_ADOPTED_EVENT = "slip_version_adopted";
export const VERSION_BADGES = ["Lowest cost", "Least travel", "Best rated"] as const;
export type VersionBadge = (typeof VERSION_BADGES)[number];

export interface SlotCandidate {
  id: string;
  /** Plan-fit rank within the set, 1 = easiest; null when the option could not be scored. */
  fitRank: number | null;
  position: number;
}

export function versionOptionSlots(options: readonly SlotCandidate[]): { slots: string[]; notRun: string[] } {
  if (options.length === 0) return { slots: [], notRun: [] };
  const ranked = [...options].sort((a, b) => {
    const ra = a.fitRank ?? Number.POSITIVE_INFINITY;
    const rb = b.fitRank ?? Number.POSITIVE_INFINITY;
    return ra - rb || a.position - b.position;
  });
  if (ranked.length === 1) return { slots: [ranked[0].id, ranked[0].id, ranked[0].id], notRun: [] };
  if (ranked.length === 2) return { slots: [ranked[0].id, ranked[1].id, ranked[0].id], notRun: [] };
  return { slots: ranked.slice(0, 3).map((o) => o.id), notRun: ranked.slice(3).map((o) => o.id) };
}

export interface VersionMetrics {
  id: string;
  totalCost: number | null;
  totalTravelTime: number | null;
  averageRating: number | null;
}

const finite = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The unique strict winner of one metric, or null (tie, fewer than two measured versions). */
function winner(rows: VersionMetrics[], pick: (r: VersionMetrics) => number | null, better: (a: number, b: number) => boolean): string | null {
  const measured = rows.map((r) => ({ id: r.id, v: finite(pick(r)) })).filter((r): r is { id: string; v: number } => r.v !== null);
  if (measured.length < 2) return null;
  let best = measured[0];
  let tied = false;
  for (const r of measured.slice(1)) {
    if (better(r.v, best.v)) {
      best = r;
      tied = false;
    } else if (r.v === best.v) {
      tied = true;
    }
  }
  return tied ? null : best.id;
}

/** R128: each version's EARNED badges (possibly none). Keys are version ids. */
export function earnedBadges(versions: readonly VersionMetrics[]): Record<string, VersionBadge[]> {
  const rows = [...versions];
  const out: Record<string, VersionBadge[]> = Object.fromEntries(rows.map((r) => [r.id, [] as VersionBadge[]]));
  const cost = winner(rows, (r) => r.totalCost, (a, b) => a < b);
  const travel = winner(rows, (r) => r.totalTravelTime, (a, b) => a < b);
  const rated = winner(rows, (r) => r.averageRating, (a, b) => a > b);
  if (cost) out[cost].push("Lowest cost");
  if (travel) out[travel].push("Least travel");
  if (rated) out[rated].push("Best rated");
  return out;
}

export interface OptionPick {
  optionId: string;
  setId: string;
}

/** The option a variant item names (§F2 (2)), or null. */
export function optionPickOf(metadata: unknown): OptionPick | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  return typeof m.optionId === "string" && m.optionId && typeof m.setId === "string" && m.setId
    ? { optionId: m.optionId, setId: m.setId }
    : null;
}

/** A version's option: the pick on its first item that carries one, or null (set left undecided). */
export function versionOptionId(items: ReadonlyArray<{ metadata?: unknown }>): OptionPick | null {
  for (const it of items) {
    const p = optionPickOf(it.metadata);
    if (p) return p;
  }
  return null;
}

/** "Not run" (§M5): the set's options no version names — listed, never silently dropped. */
export function notRunOptionIds(setOptionIds: readonly string[], versionOptionIds: ReadonlyArray<string | null>): string[] {
  const named = new Set(versionOptionIds.filter((v): v is string => !!v));
  return setOptionIds.filter((id) => !named.has(id));
}
