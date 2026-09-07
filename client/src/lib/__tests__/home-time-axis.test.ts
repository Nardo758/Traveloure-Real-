/**
 * Home's time axis — the pure CLIENT half (ledger `2026-09-07-home-time-axis`): the relative-day
 * label beside a row and the ONE derived greeting sentence. No DOM, no fetch.
 *
 * `now` is built from LOCAL components so the pins hold in any CI zone: a day row is compared on
 * the viewer's own calendar, which is the only honest reading of a calendar day (LD 30).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingSentence, relativeDayLabel, rowDay, type UpcomingRow } from "../home-time-axis";

const now = new Date(2026, 8, 29, 9, 0, 0); // Sep 29 2026, 09:00 local

function row(partial: Partial<UpcomingRow> & Pick<UpcomingRow, "kind" | "date">): UpcomingRow {
  return {
    dateKind: "day",
    sentence: "x.",
    tripId: "t1",
    planName: "Kyoto",
    source: "s",
    action: { label: "Open", href: "/plans/t1" },
    ...partial,
  };
}

test("H1: relative day labels — today / tomorrow / in N days", () => {
  assert.equal(relativeDayLabel(row({ kind: "trip_start", date: "2026-09-29" }), now), "Today");
  assert.equal(relativeDayLabel(row({ kind: "trip_start", date: "2026-09-30" }), now), "tomorrow");
  assert.equal(relativeDayLabel(row({ kind: "trip_start", date: "2026-10-02" }), now), "in 3 days");
});

test("H2: an instant row is labelled by the viewer's own day of that instant", () => {
  const laterToday = new Date(2026, 8, 29, 23, 30).toISOString();
  assert.equal(rowDay({ date: laterToday, dateKind: "instant" }), "2026-09-29");
  assert.equal(relativeDayLabel({ date: laterToday, dateKind: "instant" }, now), "Today");
});

test("H3: no rows ⇒ the neutral greeting, and it counts nothing", () => {
  const g = greetingSentence([], now, "Mika");
  assert.match(g, /Nothing is dated yet, Mika/);
  assert.doesNotMatch(g, /\b0\b/);
});

test("H4: first row is a plan start ⇒ '<plan> in N days.' plus a due clause only when something is due before it", () => {
  const rows = [
    row({ kind: "booking_unpaid", date: "2026-09-29" }),
    row({ kind: "balance_due", date: "2026-09-30" }),
    row({ kind: "trip_start", date: "2026-10-02" }),
    row({ kind: "booking_unpaid", date: "2026-10-05" }), // AFTER the start — not "before you go"
  ];
  // First row is the unpaid booking, so the sentence leads with it.
  assert.equal(greetingSentence(rows, now), "x — Today. 2 things are due before you go.");
  // With the start first, the plan leads.
  const startFirst = [row({ kind: "trip_start", date: "2026-10-02" }), row({ kind: "event", date: "2026-10-03" })];
  assert.equal(greetingSentence(startFirst, now), "Kyoto in 3 days.");
  const oneDue = [row({ kind: "balance_due", date: "2026-09-30" }), row({ kind: "trip_start", date: "2026-10-02" })];
  assert.equal(greetingSentence(oneDue, now), "x — tomorrow. One thing is due before you go.");
});

test("H5: never '0 things are due' — an event-only axis carries no count clause", () => {
  const g = greetingSentence([row({ kind: "event", date: "2026-10-03", sentence: "Ceremony at the shrine, 15:00." })], now);
  assert.equal(g, "Ceremony at the shrine, 15:00 — in 4 days.");
  assert.doesNotMatch(g, /0 things/);
});
