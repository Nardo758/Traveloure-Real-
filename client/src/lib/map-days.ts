/**
 * THE MAP LAYOUT'S DAY CHIPS (step 8b-2, ruling 1; ledger `2026-10-06-step8b2-map-layout`).
 *
 * The plancard builds its `days` only from the day numbers its items carry, so an empty plan has no days
 * and `MapControlCenter` (which shows one day at a time) would render nothing. The map layout therefore
 * draws its chips from the trip's OWN window: one chip per calendar day from `startDate` to `endDate`.
 * A plan with no usable dates gets a single Day 1. Client only — the server DTO is untouched.
 *
 * Once items exist their days are kept exactly as the plancard built them (their activities, their
 * dates), and the window's other days stay as empty chips, so a traveler adding to Day 3 of a five-day
 * plan can still see Day 3 after the first add. A day an item names outside the window keeps its chip.
 * Pure: no React, no fetch.
 */
import type { PlanCardDay } from "@/components/plancard/plancard-types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" (or a full ISO string) → a UTC day count, or null when it is not a real date. */
function dayIndex(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.round(t / DAY_MS) : null;
}

function isoOf(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

function displayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** The number of days the trip's own window spans; `null` when either date is missing or inverted. */
export function tripWindowDayCount(startDate: string | null | undefined, endDate: string | null | undefined): number | null {
  const a = dayIndex(startDate);
  const b = dayIndex(endDate);
  if (a == null || b == null || b < a) return null;
  return b - a + 1;
}

export function mapDayChips(
  days: readonly PlanCardDay[],
  trip: { startDate?: string | null; endDate?: string | null } | null | undefined,
): PlanCardDay[] {
  const start = dayIndex(trip?.startDate);
  const count = tripWindowDayCount(trip?.startDate, trip?.endDate);
  const byNum = new Map(days.map((d) => [d.dayNum, d]));
  const nums = new Set<number>(days.map((d) => d.dayNum));
  if (count != null) for (let n = 1; n <= count; n++) nums.add(n);
  if (nums.size === 0) nums.add(1);
  return Array.from(nums)
    .sort((a, b) => a - b)
    .map((n) => {
      const existing = byNum.get(n);
      if (existing) return existing;
      const iso = start != null && count != null && n <= count ? isoOf(start + n - 1) : null;
      return {
        dayNum: n,
        date: iso ? displayOf(iso) : "",
        dateIso: iso,
        label: `Day ${n}`,
        activities: [],
        transports: [],
      };
    });
}

// ── The Map board's words (slip conformance; ledger `2026-10-08-slip-map-board`) ──────────────────
const WKD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoParts(iso: string | null | undefined): { wkd: string; mon: string; d: number } | null {
  const m = typeof iso === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (!Number.isFinite(dt.getTime())) return null;
  return { wkd: WKD_SHORT[dt.getUTCDay()], mon: MON_SHORT[dt.getUTCMonth()], d: dt.getUTCDate() };
}

/** A day chip: "Wed", and the selected one "Sat 14". No real date ⇒ "Day N" (§13 — never a guessed weekday). */
export function mapDayChipLabel(day: { dayNum: number; dateIso?: string | null }, selected: boolean): string {
  const p = isoParts(day.dateIso);
  if (!p) return `Day ${day.dayNum}`;
  return selected ? `${p.wkd} ${p.d}` : p.wkd;
}

/** The stops sheet's title: "Day 2 · Sat · Nov 14 · Version A" — the date only when the day has one. */
export function mapSheetTitle(input: { dayNum: number | null; dateIso?: string | null; versionLabel?: string | null }): string {
  const p = isoParts(input.dateIso);
  const parts = [input.dayNum != null ? `Day ${input.dayNum}` : null, p ? `${p.wkd} · ${p.mon} ${p.d}` : null, input.versionLabel ?? null];
  return parts.filter(Boolean).join(" · ");
}

/** "2 moved vs draft" beside the version toggle; null on the draft or when nothing moved. */
export function mapMovedLine(moved: number): string | null {
  return moved > 0 ? `${moved} moved vs draft` : null;
}
