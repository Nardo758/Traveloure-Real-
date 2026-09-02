import { parseISO } from "date-fns";

export function parseCalendarDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : value;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

export function calendarDateToIso(value: string | Date | null | undefined): string {
  const date = parseCalendarDate(value);
  if (!date) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * F-1 — trip dates rendered one day early.
 *
 * `trips.start_date` / `end_date` are Postgres DATE columns (shared/schema.ts) and reach the
 * client as bare "YYYY-MM-DD" strings. `new Date("2026-11-10")` is parsed by JS as UTC midnight,
 * so every viewer west of UTC renders the PREVIOUS day (entered Nov 10–14, slip showed
 * "Nov 9 – Nov 13").
 *
 * `parseTripDate` is the render-safe parser for a value that may be EITHER shape:
 *   - "YYYY-MM-DD"        → LOCAL midnight of that day (date-fns `parseISO` semantics)
 *   - a full ISO timestamp → unchanged `Date` semantics (an instant keeps its instant)
 *   - null / invalid       → null
 *
 * Prefer this over `parseCalendarDate` wherever the same helper also sees real timestamps
 * (e.g. a diary row's `createdAt`): `parseCalendarDate` deliberately collapses any input to a
 * calendar day and would discard the time of day.
 */
export function parseTripDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // Clone: callers mutate the result (setHours/setDate) and must not touch the input.
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const raw = value.trim();
  if (!raw) return null;
  // Date-only → local midnight; anything else keeps normal instant parsing.
  const date = DATE_ONLY_RE.test(raw) ? parseISO(raw) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Non-null form of `parseTripDate`, for the render sites that already assumed `new Date(raw)`
 * always produced a `Date`. Behaviour on unparseable input is unchanged from what those sites
 * had before (an Invalid Date propagates exactly as it used to); the ONLY difference is that a
 * bare "YYYY-MM-DD" now lands on LOCAL midnight instead of UTC midnight.
 */
export function parseTripDateOrInvalid(value: string | Date | null | undefined): Date {
  return parseTripDate(value) ?? new Date(value as string);
}
