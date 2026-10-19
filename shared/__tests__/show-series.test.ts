/**
 * SH-1 item 5 — a series of shows is sibling rows on one series key (ledger `2026-10-19-sh1-show-dates`).
 *
 *   SS1  seriesShowDates: the local dates of the rows on the key, sorted, each once; no key ⇒ none
 *   SS2  between two shows the label is "Next show <Wkd d Mon>" for the LATER date
 *   SS3  on a show date the label is "On now"
 *   SS4  after the last show there is no label; before the first it names the first
 *   SS5  upcomingShowDates offers today and later shows only
 *   SS6  the seed: four IMAGINE NOH rows, one per show (14, 22, 28 Oct and 5 Nov 2026, 17:30–19:00 Kyoto time), on
 *        one key, with the venue line, each a one-day row (no "N-day run"); the continuous-run row is gone
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isShowSeries, seriesShowDates, seriesShowLabel, upcomingShowDates } from "../event-page";
import { eventTag } from "../events-calendar";
import { MANUAL_CITY_EVENTS } from "../../server/seeds/city-events.manual";

const SHOWS = ["2026-10-14", "2026-10-22", "2026-10-28", "2026-11-05"];
const rows = [
  ...SHOWS.map((firstDate) => ({ seriesKey: "kyoto-kanze-noh", firstDate })),
  { seriesKey: "kyoto-kanze-noh", firstDate: "2026-10-22" },
  { seriesKey: "other", firstDate: "2026-10-20" },
  { seriesKey: null, firstDate: "2026-10-21" },
];

test("SS1 — the series' show dates", () => {
  assert.deepEqual(seriesShowDates(rows, "kyoto-kanze-noh"), SHOWS);
  assert.deepEqual(seriesShowDates(rows, null), []);
  assert.deepEqual(seriesShowDates(rows, "  "), []);
  assert.equal(isShowSeries(SHOWS), true);
  assert.equal(isShowSeries(["2026-10-20"]), false, "one row is an ordinary event");
});

test("SS2 — between two shows: the next show", () => {
  assert.equal(seriesShowLabel(SHOWS, "2026-10-19"), "Next show Thu 22 Oct");
  assert.equal(seriesShowLabel(SHOWS, "2026-10-23"), "Next show Wed 28 Oct");
});

test("SS3 — on a show date: On now", () => {
  for (const d of SHOWS) assert.equal(seriesShowLabel(SHOWS, d), "On now", d);
});

test("SS4 — before the first and after the last", () => {
  assert.equal(seriesShowLabel(SHOWS, "2026-10-01"), "Next show Wed 14 Oct");
  assert.equal(seriesShowLabel(SHOWS, "2026-11-06"), null);
  assert.equal(seriesShowLabel([], "2026-10-19"), null);
});

test("SS5 — the shows still to come", () => {
  assert.deepEqual(upcomingShowDates(SHOWS, "2026-10-22"), ["2026-10-22", "2026-10-28", "2026-11-05"]);
  assert.deepEqual(upcomingShowDates(SHOWS, "2026-11-06"), []);
});

test("SS6 — the IMAGINE NOH seed rows", () => {
  const noh = MANUAL_CITY_EVENTS.filter((e) => e.series === "IMAGINE NOH");
  assert.deepEqual(noh.map((e) => e.sourceId), SHOWS.map((d) => `imagine-noh-${d}`));
  assert.equal(MANUAL_CITY_EVENTS.some((e) => e.sourceId === "imagine-noh-2026"), false, "the continuous run is not seeded");
  for (const e of noh) {
    const d = e.sourceId.replace("imagine-noh-", "");
    assert.equal(e.startsAt, `${d}T17:30:00+09:00`);
    assert.equal(e.endsAt, `${d}T19:00:00+09:00`);
    assert.equal(e.startTimeKnown, true);
    assert.equal(e.seriesKey, "kyoto-kanze-noh");
    assert.equal(e.city, "Kyoto");
    assert.equal(e.venue, "Kyoto Kanze Noh Theatre (京都観世会館), Okazaki");
    assert.equal(e.venueLocality, undefined, "Okazaki is in Kyoto: never an 'outside the city' row");
    assert.doesNotMatch(eventTag({ vertical: "other", nights: 1 } as any), /run/);
  }
});
