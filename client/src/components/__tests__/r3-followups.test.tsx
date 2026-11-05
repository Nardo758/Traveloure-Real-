/**
 * Round 3 follow-ups (ledger `2026-11-05-r3-followups`):
 *   F14a R3-14: a 52-day event that began Oct 23 yields a 3-day plan starting today; a 3-day race yields the race.
 *   F14b R3-14: a plan never starts before today; "All of it" is offered only when what is left is 14 days or fewer.
 *   F16  R3-16: the start dialog and the plan page both SHOW two adults; nothing is sent until the traveler types or
 *        presses Save (LD 33 unchanged — an untouched party is stored NULL).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InlineWhoPanel } from "../plan/SlipAnchorPanels";
import { EVENT_ALL_OF_IT_MAX_DAYS, EVENT_PLAN_DEFAULT_DAYS, emptyPlanEntry, eventAllOfIt, eventDefaultSpan, withEvent, withNight } from "../../lib/plan-entry";
import { partyFieldShown } from "../../lib/party-default";

(globalThis as any).React = React;
const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const ev = (firstDate: string, lastDate: string) => ({ title: "X", city: "Kyoto", country: "Japan", venue: "V", firstDate, lastDate, startTime: null });

describe("R3 follow-ups", () => {
  it("F14a a long event under way gives three days from today; a race gives the race", () => {
    assert.equal(EVENT_PLAN_DEFAULT_DAYS, 3);
    // 52 days: Oct 23 to Dec 13 (Kodai-ji's autumn evenings), today Nov 5.
    assert.deepEqual(eventDefaultSpan(ev("2026-10-23", "2026-12-13"), "2026-11-05"), { startDate: "2026-11-05", endDate: "2026-11-07" });
    // A three-day race still ahead: the race.
    assert.deepEqual(eventDefaultSpan(ev("2027-04-09", "2027-04-11"), "2026-11-05"), { startDate: "2027-04-09", endDate: "2027-04-11" });
    // A one-day event: that day. Two days left of a run: capped at its end.
    assert.deepEqual(eventDefaultSpan(ev("2026-12-31", "2026-12-31"), "2026-11-05"), { startDate: "2026-12-31", endDate: "2026-12-31" });
    assert.deepEqual(eventDefaultSpan(ev("2026-10-01", "2026-11-06"), "2026-11-05"), { startDate: "2026-11-05", endDate: "2026-11-06" });
    // Through withEvent, with the market's own today (Kyoto).
    const now = new Date("2026-11-05T03:00:00Z"); // Nov 5 in Kyoto
    const s = withEvent(emptyPlanEntry(), ev("2026-10-23", "2026-12-13"), "show", now);
    assert.equal(s.startDate, "2026-11-05");
    assert.equal(s.endDate, "2026-11-07");
  });

  it("F14b never before today; All of it only for 14 days or fewer", () => {
    assert.equal(EVENT_ALL_OF_IT_MAX_DAYS, 14);
    assert.equal(eventAllOfIt(ev("2026-10-23", "2026-12-13"), "2026-11-05"), null, "39 days left: not offered");
    assert.deepEqual(eventAllOfIt(ev("2026-10-23", "2026-11-18"), "2026-11-05"), { startDate: "2026-11-05", endDate: "2026-11-18" }, "14 days left: offered, from today");
    assert.equal(eventAllOfIt(ev("2026-10-23", "2026-11-19"), "2026-11-05"), null, "15 days left: not offered");
    const now = new Date("2026-11-05T03:00:00Z");
    const long = withEvent(emptyPlanEntry(), ev("2026-10-23", "2026-12-13"), "show", now);
    const cleared = withNight(withNight(long, "2026-11-20", now), null, now);
    assert.deepEqual([cleared.startDate, cleared.endDate], ["2026-11-05", "2026-11-07"], "no All of it: back to the default span");
    const short = withEvent(emptyPlanEntry(), ev("2026-11-01", "2026-11-12"), "show", now);
    assert.equal(short.startDate, "2026-11-05", "never before today");
    const all = withNight(short, null, now);
    assert.deepEqual([all.startDate, all.endDate], ["2026-11-05", "2026-11-12"], "All of it is what is left");
    const entry = read("client/src/components/plan/PlanEntry.tsx");
    assert.equal((entry.match(/\{allOfIt && \(/g) ?? []).length, 2, "both night pickers draw All of it only when offered");
  });

  it("F16 both surfaces show two; nothing is stored until the traveler states it", () => {
    assert.equal(partyFieldShown("", false), "2");
    assert.equal(partyFieldShown("", true), "", "cleared by the traveler stays cleared");
    assert.equal(partyFieldShown("4", false), "4");
    const entry = read("client/src/components/plan/PlanEntry.tsx");
    assert.match(entry, /value=\{field\.key === "adults" \? partyFieldShown\(adults, adultsEdited\) : kids\}/);
    // Start sends only what the door passed or the traveler typed (`adults`), never the shown default.
    assert.match(entry, /const n = travelersForSave\(field\.key === "adults" \? adults : kids\);/);
    assert.match(entry, /const \[adults, setAdults\] = useState\(doorParty\(source\?\.adults\)\);/);
    // The plan page's party panel shows two, and writes only on Save.
    const qc = new QueryClient();
    const html = renderToString(<QueryClientProvider client={qc}><InlineWhoPanel tripId="t" current={{ adults: null, kids: null }} submit={async () => {}} /></QueryClientProvider>);
    assert.match(html, /value="2"/);
  });
});
