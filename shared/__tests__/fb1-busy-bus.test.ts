/**
 * FB-1 step 5d (ledger `2026-10-19-fb1-busy-bus`), the pure half.
 *   BB1 the fixed spans: New Year (wrapping the year), Golden Week, Obon — bounds inclusive
 *   BB2 a national holiday and a substitute holiday from the list both read "national holiday"; a day the list does
 *       not carry is never guessed
 *   BB3 a weekend counts only inside a season window; no window ⇒ no weekend flag; a weekday in a window is not flagged
 *   BB4 the committed list: source, URL, years, every row in a covered year with a kind
 *   BB5 the season-windows setting: valid lists pass, every malformed shape is refused, an unknown market is refused,
 *       and a stored invalid value reads as no window
 *   BB6 the words: Marketing's day line
 *
 * Run: npx tsx --test shared/__tests__/fb1-busy-bus.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { busyBusDayLine, busyBusReason, seasonWindows, seasonWindowsRefusal, seasonWindowsSettingRefusal, type JapanHoliday } from "../busy-bus";
import list from "../../server/data/japan-holidays.json";

const HOLIDAYS: JapanHoliday[] = [
  { date: "2027-02-11", name: "建国記念の日", kind: "national" },
  { date: "2027-03-22", name: "休日", kind: "substitute" },
];

test("BB1 the fixed spans", () => {
  for (const d of ["2026-12-29", "2026-12-31", "2027-01-01", "2027-01-03"]) assert.equal(busyBusReason(d, [], []), "New Year", d);
  for (const d of ["2027-04-29", "2027-05-05"]) assert.equal(busyBusReason(d, [], []), "Golden Week", d);
  for (const d of ["2027-08-13", "2027-08-16"]) assert.equal(busyBusReason(d, [], []), "Obon", d);
  for (const d of ["2026-12-28", "2027-01-04", "2027-04-28", "2027-05-06", "2027-08-12", "2027-08-17"]) assert.equal(busyBusReason(d, [], []), null, d);
  assert.equal(busyBusReason("not-a-date", [], []), null);
  assert.equal(busyBusReason("2027-02-30", [], []), null);
});

test("BB2 national and substitute holidays read 'national holiday'", () => {
  assert.equal(busyBusReason("2027-02-11", HOLIDAYS, []), "national holiday");
  assert.equal(busyBusReason("2027-03-22", HOLIDAYS, []), "national holiday");
  assert.equal(busyBusReason("2027-02-12", HOLIDAYS, []), null);
  // A year the list does not carry: no guess.
  assert.equal(busyBusReason("2029-02-12", list.holidays as JapanHoliday[], []), null);
});

test("BB3 weekends only inside a season window", () => {
  const windows = [{ from: "2027-11-13", to: "2027-11-28" }];
  assert.equal(busyBusReason("2027-11-13", [], windows), "peak season weekend", "Saturday");
  assert.equal(busyBusReason("2027-11-14", [], windows), "peak season weekend", "Sunday");
  assert.equal(busyBusReason("2027-11-15", [], windows), null, "Monday in the window");
  assert.equal(busyBusReason("2027-11-13", [], []), null, "no window ⇒ no weekend flag");
  assert.equal(busyBusReason("2027-12-04", [], windows), null, "Saturday outside the window");
});

test("BB4 the committed list", () => {
  assert.match(list.source, /Cabinet Office/);
  assert.equal(list.sourceUrl, "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv");
  assert.deepEqual(list.coversYears, [2026, 2027]);
  assert.ok(list.holidays.length > 0);
  for (const h of list.holidays) {
    assert.ok(list.coversYears.includes(Number(h.date.slice(0, 4))), h.date);
    assert.ok(h.kind === "national" || h.kind === "substitute", h.date);
  }
  assert.deepEqual(list.holidays.filter((h) => h.kind === "substitute").map((h) => h.date), ["2026-05-06", "2026-09-22", "2027-03-22"]);
});

test("BB5 the season-windows setting", () => {
  assert.equal(seasonWindowsRefusal("[]"), null);
  assert.equal(seasonWindowsRefusal('[{"from":"2027-03-25","to":"2027-04-10"},{"from":"2027-11-13","to":"2027-11-28"}]'), null);
  for (const bad of ["", "nope", "{}", '[{"from":"2027-04-10","to":"2027-03-25"}]', '[{"from":"2027-02-30","to":"2027-03-01"}]', '[{"from":"2027-03-25"}]', '[{"from":"2027-03-25","to":"2027-04-10","x":1}]', '[null]', JSON.stringify(Array(5).fill({ from: "2027-01-01", to: "2027-01-02" }))]) {
    assert.notEqual(seasonWindowsRefusal(bad), null, bad);
  }
  assert.equal(seasonWindowsSettingRefusal("season_windows_kyoto", "[]"), null);
  assert.notEqual(seasonWindowsSettingRefusal("season_windows_atlantis", "[]"), null);
  assert.equal(seasonWindowsSettingRefusal("maintenance_mode", "junk"), null, "not this setting");
  assert.deepEqual(seasonWindows('[{"from":"2027-03-25","to":"2027-04-10"}]'), [{ from: "2027-03-25", to: "2027-04-10" }]);
  assert.deepEqual(seasonWindows("junk"), []);
  assert.deepEqual(seasonWindows(null), []);
});

test("BB6 the words", () => {
  assert.equal(busyBusDayLine("Golden Week"), "Busy day for Kyoto buses (Golden Week). Leave extra time for any bus legs today.");
  assert.equal(busyBusDayLine("national holiday"), "Busy day for Kyoto buses (national holiday). Leave extra time for any bus legs today.");
});
