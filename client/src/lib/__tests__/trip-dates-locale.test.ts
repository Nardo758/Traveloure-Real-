/**
 * Row 159 (ledger `2026-10-29-trip-dates-locale`): formatTripDates takes an optional locale.
 *
 *   L1  no locale: exactly the English rule, every case the row 154 test pins
 *   L2  French: month names, order and same-month collapse are the locale's ("3–7 mai")
 *   L3  German and Spanish same-month and cross-month ranges
 *   L4  a one-day plan is one date in every locale, never "26–26"
 *   L5  a year-crossing range names its years in a locale (the locale's convention)
 *   L6  a missing start is null; a missing or unreadable end shows the start alone, in the locale
 *   L7  a locale the runtime refuses falls back to the English rule
 *   L8  the three callers still pass no locale, so nothing visible changes
 *
 * Spaces are normalised (ICU puts thin and narrow no-break spaces around range dashes), so the
 * cases read the words, not the space characters. Pure: no DOM, no git, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formatTripDates } from "../trip-dates";

const norm = (value: string | null) => (value === null ? null : value.replace(/[   ]/g, " "));
const fmt = (start?: string, end?: string, locale?: string | string[]) => norm(formatTripDates(start, end, locale));

test("L1 no locale is exactly the English rule", () => {
  assert.equal(fmt("2026-10-26", "2026-10-26"), "Oct 26");
  assert.equal(fmt("2026-05-03", "2026-05-07"), "May 3–7");
  assert.equal(fmt("2026-10-30", "2026-11-02"), "Oct 30 – Nov 2");
  assert.equal(fmt("2026-12-30", "2027-01-02"), "Dec 30 – Jan 2");
  assert.equal(fmt("2026-10-26", "2027-10-26"), "Oct 26 – Oct 26");
  assert.equal(formatTripDates("2026-05-03", "2026-05-07"), formatTripDates("2026-05-03", "2026-05-07", undefined));
});

test("L2 French month names, order and collapse", () => {
  assert.equal(fmt("2026-05-03", "2026-05-07", "fr-FR"), "3–7 mai");
  assert.equal(fmt("2026-10-30", "2026-11-02", "fr-FR"), "30 oct. – 2 nov.");
});

test("L3 German and Spanish", () => {
  assert.equal(fmt("2026-05-03", "2026-05-07", "de-DE"), "3.–7. Mai");
  assert.equal(fmt("2026-10-30", "2026-11-02", "de-DE"), "30. Okt. – 2. Nov.");
  assert.equal(fmt("2026-05-03", "2026-05-07", "es-ES"), "3–7 may");
});

test("L4 a one-day plan is one date in every locale", () => {
  for (const [locale, expected] of [["en-US", "Oct 26"], ["fr-FR", "26 oct."], ["de-DE", "26. Okt."], ["es-ES", "26 oct"]]) {
    assert.equal(fmt("2026-10-26", "2026-10-26", locale), expected, locale);
  }
});

test("L5 a year-crossing range names its years in a locale", () => {
  assert.equal(fmt("2026-12-30", "2027-01-02", "fr-FR"), "30 déc. 2026 – 2 janv. 2027");
  assert.equal(fmt("2026-12-30", "2027-01-02", "en-US"), "Dec 30, 2026 – Jan 2, 2027");
});

test("L6 missing and unreadable dates", () => {
  assert.equal(fmt(undefined, "2026-10-26", "fr-FR"), null);
  assert.equal(fmt("nope", "2026-10-26", "fr-FR"), null);
  assert.equal(fmt("2026-10-26", undefined, "fr-FR"), "26 oct.");
  assert.equal(fmt("2026-10-26", "nope", "fr-FR"), "26 oct.");
});

test("L7 a refused locale falls back to the English rule", () => {
  assert.equal(fmt("2026-05-03", "2026-05-07", "not a locale"), "May 3–7");
  assert.equal(fmt("2026-10-26", undefined, "not a locale"), "Oct 26");
});

test("L8 the callers pass no locale", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  assert.match(read("client/src/components/intake-panel.tsx"), /formatTripDates\(startDate, endDate\)/);
  assert.match(read("client/src/components/ai-planner-draft-panel.tsx"), /formatTripDates\(startDate, endDate\)/);
  assert.match(read("client/src/pages/discover-location.tsx"), /formatTripDates\(dates\.startDate, dates\.endDate \?\? undefined\)/);
});
