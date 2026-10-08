/**
 * THE VERSIONS BOARD's client state (surface step 5; spec v1.2 §2.4; boards 4a/4b/4c; R-ac; ledger
 * `2026-10-04-surface-step5-map-versions`). Pure — the board component and its tests read these, so
 * what "take this day", "drop a day", "reorder a stop" and "is this re-time free" mean is written
 * once. The diff, the badge and the free-re-time predicate themselves live in `@shared/version-board`
 * (the server reads the same ones, §18 rule 1); nothing here re-derives them.
 *
 *   · The unit of adoption is the DAY: picks are day → version. Taking a day another version already
 *     filled replaces that pick (each day comes from one version, as `apply-days` requires).
 *   · Apply sends only the picked days; nothing else is written, and the draft is never deleted.
 *   · A re-time counts against the version the day was adopted from (its rows' provenance); past
 *     the free limit the board says it is a paid run BEFORE anything happens.
 */
import {
  BADGE_LABELS,
  daySummary,
  retimeIsFree,
  retimeLine,
  type BadgeKey,
  type BoardStop,
  type DayDiff,
} from "@shared/version-board";

export interface BoardVersion {
  variantId: string;
  label: string;
  name: string;
  badge: BadgeKey | null;
  anchor: { name: string; lat: number | null; lng: number | null } | null;
  stops: BoardStop[];
  days: DayDiff[];
}

export interface VersionsBoardView {
  run: { comparisonId: string; runId: string | null; runAt: string } | null;
  plan: { stops: BoardStop[] };
  versions: BoardVersion[];
  retimes: { limit: number; used: Record<string, number>; windowEndsAt: string | null; free: Record<string, boolean> };
}

export type DayPicks = Readonly<Record<number, string>>;

/** Every day either side holds, ascending. */
export function boardDays(view: Pick<VersionsBoardView, "plan" | "versions">): number[] {
  const s = new Set<number>();
  for (const p of view.plan.stops) s.add(p.dayNumber);
  for (const v of view.versions) for (const st of v.stops) s.add(st.dayNumber);
  return Array.from(s).sort((a, b) => a - b);
}

/** 4a: one card per version — its label, its one badge (or none), and a per-day change line. */
export function chooseCards(view: Pick<VersionsBoardView, "versions">) {
  return view.versions.map((v) => ({
    variantId: v.variantId,
    label: v.label,
    name: v.name,
    badge: v.badge ? BADGE_LABELS[v.badge] : null,
    days: v.days.map((d) => ({ dayNumber: d.dayNumber, summary: daySummary(d), matchedByName: d.matchedByName })),
  }));
}

/** 4b: a day's column per version. A day identical to the draft collapses to "same as draft". */
export function dayColumns(view: Pick<VersionsBoardView, "versions">, dayNumber: number) {
  return view.versions.map((v) => {
    const diff = v.days.find((d) => d.dayNumber === dayNumber) ?? null;
    const identical = diff ? diff.identical : !v.stops.some((s) => s.dayNumber === dayNumber);
    return {
      variantId: v.variantId,
      label: v.label,
      identical,
      matchedByName: !!diff?.matchedByName,
      summary: diff ? daySummary(diff) : "Same as draft",
      stops: identical ? [] : v.stops.filter((s) => s.dayNumber === dayNumber),
    };
  });
}

/** Take (or drop onto Your plan) one version's day. A second take of the same day replaces it. */
export function takeDay(picks: DayPicks, dayNumber: number, variantId: string): DayPicks {
  return { ...picks, [dayNumber]: variantId };
}

/** Undo a pick: the day stays as the draft has it. */
export function releaseDay(picks: DayPicks, dayNumber: number): DayPicks {
  const next: Record<number, string> = { ...picks };
  delete next[dayNumber];
  return next;
}

/** "Adopt all": every day the version holds. */
export function adoptAllPicks(view: Pick<VersionsBoardView, "versions" | "plan">, variantId: string): DayPicks {
  const v = view.versions.find((x) => x.variantId === variantId);
  if (!v) return {};
  const days = new Set(v.stops.map((s) => s.dayNumber));
  // A day the version emptied is still the version's day (its stops were dropped).
  for (const d of v.days) days.add(d.dayNumber);
  const out: Record<number, string> = {};
  for (const d of Array.from(days)) out[d] = variantId;
  return out;
}

/** The `apply-days` body — picked days only, ascending. */
export function applyBody(picks: DayPicks): { days: Array<{ day: number; variantId: string }> } {
  return {
    days: Object.entries(picks)
      .map(([day, variantId]) => ({ day: Number(day), variantId }))
      .sort((a, b) => a.day - b.day),
  };
}

export function applyLabel(picks: DayPicks): string {
  const n = Object.keys(picks).length;
  return n === 1 ? "Apply 1 day" : `Apply ${n} days`;
}

/** The pick strip: "Day 2 · B" per pick, ascending. */
export function pickStrip(view: Pick<VersionsBoardView, "versions">, picks: DayPicks): Array<{ dayNumber: number; label: string }> {
  return applyBody(picks).days.map(({ day, variantId }) => ({
    dayNumber: day,
    label: view.versions.find((v) => v.variantId === variantId)?.label ?? "?",
  }));
}

/** Where you stay follows the version most adopted days come from (ties: the earlier version). */
export function stayVersion(view: Pick<VersionsBoardView, "versions">, picks: DayPicks): BoardVersion | null {
  const counts = new Map<string, number>();
  for (const v of Object.values(picks)) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: BoardVersion | null = null;
  let bestN = 0;
  for (const v of view.versions) {
    const n = counts.get(v.variantId) ?? 0;
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/** 4c: Your plan's stops for a day, in day order (fixed points included — they stay where they are). */
export function planDayStops(view: Pick<VersionsBoardView, "plan">, dayNumber: number): BoardStop[] {
  return view.plan.stops.filter((s) => s.dayNumber === dayNumber);
}

/** Reorder within a day: move `id` to `toIndex`. Unknown id ⇒ unchanged. */
export function reorderStop(order: readonly string[], id: string, toIndex: number): string[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const next = order.filter((x) => x !== id);
  const at = Math.max(0, Math.min(toIndex, next.length));
  next.splice(at, 0, id);
  return next;
}

/** The version a Your-plan day counts its re-times under (its rows' provenance); "" = never adopted. */
export function dayRetimeKey(view: Pick<VersionsBoardView, "plan">, dayNumber: number): string {
  return planDayStops(view, dayNumber).find((s) => s.sourceVariantId)?.sourceVariantId ?? "";
}

/**
 * The re-time gate, said BEFORE a re-time happens: free (with how many are left on this day's
 * version) or a paid run (with the fee when the fee read answered). Uses the shared predicate.
 */
export function retimeGate(
  view: Pick<VersionsBoardView, "plan" | "run" | "retimes">,
  dayNumber: number,
  now: Date,
  feeLabel: string | null,
): { free: boolean; remaining: number; line: string } {
  const key = dayRetimeKey(view, dayNumber);
  const used = view.retimes.used[key] ?? 0;
  const free = retimeIsFree({ runAt: view.run?.runAt ?? null, now, used, limit: view.retimes.limit });
  const remaining = Math.max(0, view.retimes.limit - used);
  return { free, remaining, line: retimeLine({ free, remaining, feeLabel }) };
}

/** Drag payloads (HTML5 dataTransfer, one MIME type). The DAY is the unit across columns. */
export type BoardDrag =
  | { kind: "day"; variantId: string; dayNumber: number }
  | { kind: "stop"; dayNumber: number; id: string }
  | { kind: "swap"; variantId: string; dayNumber: number; variantItemId: string };

export const BOARD_DRAG_MIME = "application/x-traveloure-board";

export function encodeDrag(d: BoardDrag): string {
  return JSON.stringify(d);
}

export function decodeDrag(raw: string | null | undefined): BoardDrag | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (d?.kind === "day" && typeof d.variantId === "string" && Number.isInteger(d.dayNumber)) return d;
    if (d?.kind === "stop" && typeof d.id === "string" && Number.isInteger(d.dayNumber)) return d;
    if (d?.kind === "swap" && typeof d.variantId === "string" && typeof d.variantItemId === "string" && Number.isInteger(d.dayNumber)) return d;
  } catch {
    /* not ours */
  }
  return null;
}

/**
 * What a drop onto Your plan's day does. A version DAY becomes that day's pick; a stop from the same
 * day reorders (and re-times); a version STOP is a swap-in (and re-times). A stop dragged to another
 * day of Your plan is not a reorder — the unit across days is the day — so it does nothing.
 */
export function dropOnPlanDay(
  view: Pick<VersionsBoardView, "plan">,
  picks: DayPicks,
  targetDay: number,
  drag: BoardDrag,
  toIndex: number,
):
  | { action: "pick"; picks: DayPicks }
  | { action: "retime"; order: string[]; swapIn: { variantItemId: string } | null }
  | { action: "none" } {
  if (drag.kind === "day") {
    if (drag.dayNumber !== targetDay) return { action: "none" };
    return { action: "pick", picks: takeDay(picks, targetDay, drag.variantId) };
  }
  const order = planDayStops(view, targetDay).map((s) => s.id);
  if (drag.kind === "stop") {
    if (drag.dayNumber !== targetDay) return { action: "none" };
    const next = reorderStop(order, drag.id, toIndex);
    if (next.join("|") === order.join("|")) return { action: "none" };
    return { action: "retime", order: next, swapIn: null };
  }
  return { action: "retime", order, swapIn: { variantItemId: drag.variantItemId } };
}

// ── THE OPTIMIZED BOARD (slip conformance, boards rev 15; ledger `2026-10-08-slip-optimized-board`) ──

/** A version's totals for its card, read off the shared diffs (never re-derived): a zero is shown as
 *  the board shows it, because each count is a real answer from the diff. */
export function versionTotals(days: readonly DayDiff[]): { unchanged: number; moved: number; dropped: number; added: number } {
  let unchanged = 0;
  let moved = 0;
  let dropped = 0;
  let added = 0;
  for (const d of days) {
    if (d.identical) unchanged++;
    moved += d.moved.length;
    dropped += d.dropped.length;
    added += d.added.length;
  }
  return { unchanged, moved, dropped, added };
}

/** The card's chips: "4 days unchanged · 2 stops moved · 0 dropped" (+ "N added" only when any). */
export function versionTotalChips(t: ReturnType<typeof versionTotals>): { key: string; text: string; warn?: boolean }[] {
  const out: { key: string; text: string; warn?: boolean }[] = [
    { key: "unchanged", text: `${t.unchanged} ${t.unchanged === 1 ? "day" : "days"} unchanged` },
    { key: "moved", text: `${t.moved} ${t.moved === 1 ? "stop" : "stops"} moved` },
    { key: "dropped", text: `${t.dropped} dropped`, warn: t.dropped > 0 },
  ];
  if (t.added > 0) out.push({ key: "added", text: `${t.added} added` });
  return out;
}

/** A day's short label: the weekday when the plan's machine date is known, else "Day N" (§13). */
export function boardDayLabel(dayNumber: number, dateIso: string | null | undefined): string {
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    const d = new Date(`${dateIso}T12:00:00Z`);
    if (Number.isFinite(d.getTime())) return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  }
  return `Day ${dayNumber}`;
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** The board's headline: "Three ways to spend these five days" — numbers past ten stay digits. */
export function optimizedHeadline(versions: number, days: number): string {
  const w = (n: number) => COUNT_WORDS[n] ?? String(n);
  const ways = w(versions);
  return `${ways.charAt(0).toUpperCase()}${ways.slice(1)} ${versions === 1 ? "way" : "ways"} to spend ${days === 1 ? "this day" : `these ${w(days)} days`}`;
}
