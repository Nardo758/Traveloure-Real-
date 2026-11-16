/**
 * E8 — the event window, table-tested (lane 7, variant A).
 *
 * Cases straight from the dispatch: a picked night; a show series with no pick; a single-date event;
 * "all of it" clears both numbers; picking a night re-applies them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_WINDOW_MAX_DAYS,
  EVENT_WINDOW_STRINGS,
  EVENT_WINDOW_WORDING_APPROVAL,
  clampEventWindowDays,
  eventAnchorFor,
  eventWindowRange,
} from "../event-window";
import { validateRange } from "../plan-dates-range";

const RUN = { startDate: "2026-11-20", endDate: "2026-11-22" };
const NIGHT = "2026-11-21";

test("a picked night is the anchor, and offsets extend around that one day", () => {
  const anchor = eventAnchorFor({ night: NIGHT, run: RUN });
  assert.deepEqual(anchor, { startDate: NIGHT, endDate: NIGHT }, "the night wins over the run");
  assert.deepEqual(eventWindowRange({ anchor, before: 1, after: 2 }), { start: "2026-11-20", end: "2026-11-23" });
  // with both offsets 0 the plan is the night alone - what withNight() already does
  assert.deepEqual(eventWindowRange({ anchor, before: 0, after: 0 }), { start: NIGHT, end: NIGHT });
});

test("a show series with no pick uses the run, not the first show", () => {
  const anchor = eventAnchorFor({ night: null, run: RUN });
  assert.deepEqual(anchor, RUN);
  assert.deepEqual(eventWindowRange({ anchor, before: 2, after: 1 }), { start: "2026-11-18", end: "2026-11-23" });
});

test("a single-date event is a one-day anchor and extends both ways", () => {
  const anchor = eventAnchorFor({ night: null, run: { startDate: "2026-12-05", endDate: "2026-12-05" } });
  assert.deepEqual(eventWindowRange({ anchor, before: 1, after: 1 }), { start: "2026-12-04", end: "2026-12-06" });
});

test("all of it clears both numbers", () => {
  const anchor = eventAnchorFor({ night: NIGHT, run: RUN });
  assert.deepEqual(eventWindowRange({ anchor, before: 5, after: 5, allOfIt: true }), { start: NIGHT, end: NIGHT });
  assert.deepEqual(
    eventWindowRange({ anchor: RUN, before: 9, after: 9, allOfIt: true }),
    { start: RUN.startDate, end: RUN.endDate },
    "for the run anchor, all of it is exactly the run",
  );
});

test("picking a night re-applies the numbers to that night", () => {
  const before = 1;
  const after = 2;
  const noPick = eventWindowRange({ anchor: eventAnchorFor({ night: null, run: RUN }), before, after });
  const picked = eventWindowRange({ anchor: eventAnchorFor({ night: NIGHT, run: RUN }), before, after });
  assert.deepEqual(noPick, { start: "2026-11-19", end: "2026-11-24" });
  assert.deepEqual(picked, { start: "2026-11-20", end: "2026-11-23" }, "the same numbers, around the night");
});

test("the start never falls earlier than the market's today", () => {
  const anchor = { startDate: "2026-11-16", endDate: "2026-11-16" };
  assert.deepEqual(eventWindowRange({ anchor, before: 5, after: 0, min: "2026-11-16" }), {
    start: "2026-11-16",
    end: "2026-11-16",
  });
  assert.deepEqual(eventWindowRange({ anchor, before: 0, after: 3, min: "2026-11-01" }), {
    start: "2026-11-16",
    end: "2026-11-19",
  });
});

test("both offsets clamp to 0..14", () => {
  assert.equal(EVENT_WINDOW_MAX_DAYS, 14);
  assert.equal(clampEventWindowDays(-3), 0);
  assert.equal(clampEventWindowDays(99), 14);
  assert.equal(clampEventWindowDays(Number.NaN), 0);
  assert.equal(clampEventWindowDays(2.9), 2);
  const anchor = { startDate: "2026-11-16", endDate: "2026-11-16" };
  assert.deepEqual(eventWindowRange({ anchor, before: 99, after: 99 }), { start: "2026-11-02", end: "2026-11-30" });
});

test("every produced range passes validateRange, and a backwards range throws rather than shipping", () => {
  const anchor = { startDate: "2026-11-16", endDate: "2026-11-16" };
  for (const [before, after] of [[0, 0], [1, 0], [0, 1], [14, 14]]) {
    const r = eventWindowRange({ anchor, before, after });
    assert.equal(validateRange(r!.start, r!.end), "ok");
  }
  // the guard is real: a source that tried to invert the pair would throw, not return
  assert.throws(() => eventWindowRange({ anchor: { startDate: "2026-11-16", endDate: "2026-11-10" }, before: 0, after: 0 }));
});

test("the strings are the founder's, quoted with the citation that approved them", () => {
  assert.equal(EVENT_WINDOW_WORDING_APPROVAL, "founder comment: #2034 2026-11-16T03:08:44Z");
  assert.equal(EVENT_WINDOW_STRINGS.helper, "Days before or after the event");
  assert.equal(EVENT_WINDOW_STRINGS.before, "How many days before?");
  assert.equal(EVENT_WINDOW_STRINGS.after, "How many days after?");
  assert.equal(EVENT_WINDOW_STRINGS.anchor.replace("{name}", "Kyoto Ceramics Fair"), "Built around Kyoto Ceramics Fair");
});
