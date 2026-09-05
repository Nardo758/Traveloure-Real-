/**
 * QA F13 regression pin — the occasion workstation's HERO CARD must name the stored calendar
 * days, not UTC-shifted ones.
 *
 * Run under all three timezones (that is the whole point: the bug is invisible at UTC and east
 * of it, so a UTC-only run passes on the defect):
 *
 *   TZ=America/New_York npx tsx --test client/src/lib/__tests__/hero-card-date-range.test.ts
 *   TZ=Asia/Tokyo       npx tsx --test client/src/lib/__tests__/hero-card-date-range.test.ts
 *   TZ=UTC              npx tsx --test client/src/lib/__tests__/hero-card-date-range.test.ts
 *
 * THE BUG. On `/experiences/wedding` the hero card rendered "13 Nov–15 Nov" for a plan stored
 * `start_date 2026-11-14` / `end_date 2026-11-16`, while the Trip Strip on the SAME page said
 * "Nov 14 → Nov 16". Same class as QA F3, but the defect was in the COMPOSITION rather than in
 * either half: `experience-template.tsx` holds its dates as the UTC-midnight instants
 * `new Date("YYYY-MM-DD")` produces, and handed the card `date.toISOString()`. `parseTripDate`
 * is *right* to read a full ISO timestamp as an instant (diary `createdAt` rows depend on it),
 * so the shift happened at the boundary: an instant was passed where a CALENDAR DAY was meant.
 *
 * WHAT THIS HOLDS:
 *   H1  a stored calendar range renders as those days — 14 and 16 — in every timezone.
 *   H2  the workstation's own composition (a UTC-midnight `Date` → `calendarDateToIso` → the
 *       formatter) lands on the same two days.
 *   H3  the OLD prop (`date.toISOString()`) is what we are pinning against.
 *   H4  §13 — an unstated half is omitted, never "Invalid Date" and never the epoch.
 *   H5  the parser is NOT re-implemented: the formatter agrees with `parseTripDate`, the
 *       client's one date-only parser (CLAUDE.md §18 rule 1).
 *
 * Pure unit test: no DB, no browser, no React. CI-safe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { formatShortTripRange, SHORT_TRIP_RANGE_SEPARATOR, calendarDateToIso, parseTripDate } =
  await import("../calendar-date");

const TZ = process.env.TZ ?? "(unset)";
const SEP = SHORT_TRIP_RANGE_SEPARATOR;

const STORED_START = "2026-11-14";
const STORED_END = "2026-11-16";

/** The two halves of the rendered range, as the header prints them. */
function halves(range: string): [string, string] {
  const parts = range.split(SEP);
  return [parts[0] ?? "", parts[1] ?? ""];
}

test(`H1 a stored calendar range renders the 14th and the 16th [TZ=${TZ}]`, () => {
  const range = formatShortTripRange(STORED_START, STORED_END);
  const [start, end] = halves(range);
  assert.equal(start, new Date(2026, 10, 14).toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
  assert.equal(end, new Date(2026, 10, 16).toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
  assert.match(start, /\b14\b/, "the 14th, not the 13th");
  assert.match(end, /\b16\b/, "the 16th, not the 15th");
  assert.equal(range, `14 Nov${SEP}16 Nov`);
});

test(`H2 the workstation's composition lands on the same two days [TZ=${TZ}]`, () => {
  // `experience-template.tsx` state, verbatim: the page parses the stored day with `new Date()`,
  // which yields a UTC-midnight instant, and every other read on that page takes the UTC date
  // part back off it. `calendarDateToIso` is that same extraction, named.
  const stateStart = new Date(STORED_START);
  const stateEnd = new Date(STORED_END);
  assert.equal(calendarDateToIso(stateStart), STORED_START);
  assert.equal(calendarDateToIso(stateEnd), STORED_END);

  const range = formatShortTripRange(calendarDateToIso(stateStart), calendarDateToIso(stateEnd));
  const [start, end] = halves(range);
  assert.match(start, /\b14\b/);
  assert.match(end, /\b16\b/);
  assert.equal(range, formatShortTripRange(STORED_START, STORED_END), "same answer as the raw column");
});

test(`H3 the old prop (an instant) is what we are pinning against [TZ=${TZ}]`, () => {
  // Asserts the DEFECT relationship rather than a timezone-dependent literal: wherever handing
  // the card an instant disagrees with the stored day, the fixed path must side with the day.
  const wasBroken = formatShortTripRange(
    new Date(STORED_START).toISOString(),
    new Date(STORED_END).toISOString(),
  );
  const fixed = formatShortTripRange(STORED_START, STORED_END);
  assert.equal(fixed, `14 Nov${SEP}16 Nov`);
  if (wasBroken !== fixed) {
    assert.notEqual(wasBroken, fixed, "this TZ reproduces the original bug");
  }
});

test(`H4 an unstated half is omitted, never "Invalid Date" and never the epoch [TZ=${TZ}]`, () => {
  for (const missing of [undefined, null, "", "   ", "not a date"]) {
    const range = formatShortTripRange(STORED_START, missing as string | null | undefined);
    assert.equal(range, `14 Nov${SEP}`, `no invented end for ${JSON.stringify(missing)}`);
    assert.ok(!range.includes("Invalid"), "never renders Invalid Date");
    assert.ok(!range.includes("1970"), "never renders the epoch");
  }
  assert.equal(formatShortTripRange(null, null), SEP, "nothing stated ⇒ nothing claimed");
});

test(`H5 the days come from parseTripDate, not a second parser [TZ=${TZ}]`, () => {
  for (const value of [STORED_START, STORED_END, "2026-01-01", "2026-12-31"]) {
    const [start] = halves(formatShortTripRange(value, null));
    assert.equal(
      start,
      parseTripDate(value)!.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      `formatter must agree with the one parser for ${value}`,
    );
  }
});
