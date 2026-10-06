/**
 * The /events calendar's pure rules (ledger `2026-10-06-events-calendar`, events-page brief 2a).
 *   K1  twelve months from the current month, with real years; December → January changes the year
 *   K2  a month-level season is never a day mark, and shows in every month it spans (wrapping the year)
 *   K3  a non-recurring season with a year shows only in that year
 *   K4  the marks for a period and the rows in "What's on" are the same set
 *   K5  an event with no vertical is listed under "All" only
 *   K6  "outside the city" only where a locality is stored and differs from the market city
 *   K7  a long run (11+ days) is an underline, never a count
 *   K8  "Where to go" lists every market, unrated ones as "Not rated yet", best first; vibe narrows places only
 *   K9  Monday weeks, and the period titles
 *   K10 the row tag and dates say only what the row holds
 * Run: npx tsx --test shared/__tests__/events-calendar.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bandMonths,
  bandSpan,
  bandsInPeriod,
  dayMarks,
  eventPlace,
  eventsInPeriod,
  eventTag,
  eventWhen,
  matchesKind,
  mondayColumn,
  monthFirst,
  monthLast,
  periodRange,
  periodTitle,
  weekStartOf,
  whereToGo,
  windowMonths,
  type CalendarEvent,
  type CalendarPlace,
  type SeasonBand,
} from "../events-calendar";

function ev(id: string, firstDate: string, lastDate: string, over: Partial<CalendarEvent> = {}): CalendarEvent {
  const nights = Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000) + 1;
  return {
    id,
    series: null,
    title: `Event ${id}`,
    city: "Kyoto",
    marketKey: "kyoto",
    neighbourhood: null,
    venue: "Hall",
    startsAt: `${firstDate}T10:00:00.000Z`,
    endsAt: null,
    nights,
    daysUntil: 3,
    firstDate,
    lastDate,
    startTime: null,
    ticketUrl: null,
    blurb: null,
    imagePath: null,
    vertical: "music",
    venueLocality: null,
    ...over,
  };
}

describe("events calendar rules", () => {
  it("K1 twelve months with their real years; December to January changes the year", () => {
    const w = windowMonths("2026-10");
    assert.equal(w.length, 12);
    assert.equal(w[0], "2026-10");
    assert.equal(w[2], "2026-12");
    assert.equal(w[3], "2027-01", "January after December is the next year");
    assert.equal(w[11], "2027-09");
    // The right events in each: a 30 Dec–2 Jan run is in both months, by year.
    const nye = ev("nye", "2026-12-30", "2027-01-02");
    const jan26 = ev("old", "2026-01-05", "2026-01-05");
    assert.deepEqual(eventsInPeriod([nye, jan26], monthFirst("2027-01"), monthLast("2027-01")).map((e) => e.id), ["nye"]);
    assert.deepEqual(eventsInPeriod([nye, jan26], monthFirst("2026-12"), monthLast("2026-12")).map((e) => e.id), ["nye"]);
  });

  it("K2 a season band is never a day mark and spans every month it covers", () => {
    const w = windowMonths("2026-10");
    assert.deepEqual(bandMonths({ startMonth: 10, endMonth: 11, isRecurring: true, year: null }, w), ["2026-10", "2026-11"]);
    assert.deepEqual(bandMonths({ startMonth: 12, endMonth: 2, isRecurring: true, year: null }, w), ["2026-12", "2027-01", "2027-02"]);
    assert.deepEqual(bandMonths({ startMonth: 7, endMonth: null, isRecurring: true, year: null }, w), ["2027-07"]);
    assert.equal(bandSpan(10, 11), "October and November");
    assert.equal(bandSpan(3, 5), "March to May");
    assert.equal(bandSpan(7, null), "July");
    // Day marks come from dated events only — a band contributes nothing to any day.
    const marks = dayMarks([], "2026-10");
    assert.ok(marks.every((m) => m.count === 0 && !m.longRun), "no dated event, no mark — whatever the bands say");
    const band: SeasonBand = { id: "b", title: "Autumn foliage", place: "Japan", country: "Japan", marketKeys: ["kyoto"], months: ["2026-10", "2026-11"], span: "October and November" };
    assert.equal(bandsInPeriod([band], "2026-11-03", "2026-11-03").length, 1, "a day in November shows the band in the list");
    assert.equal(bandsInPeriod([band], "2026-12-01", "2026-12-31").length, 0);
  });

  it("K3 a non-recurring season with a year shows only in that year", () => {
    const w = windowMonths("2026-10");
    assert.deepEqual(bandMonths({ startMonth: 11, endMonth: 1, isRecurring: false, year: 2026 }, w), ["2026-11", "2026-12", "2027-01"]);
    assert.deepEqual(bandMonths({ startMonth: 3, endMonth: 4, isRecurring: false, year: 2026 }, w), [], "March 2026 is not in the window");
    assert.deepEqual(bandMonths({ startMonth: 3, endMonth: 4, isRecurring: false, year: 2027 }, w), ["2027-03", "2027-04"]);
  });

  it("K4 the marks for a period and the rows are the same set", () => {
    const list = [
      ev("a", "2026-10-10", "2026-10-12"),
      ev("b", "2026-10-11", "2026-10-11"),
      ev("c", "2026-10-14", "2026-11-05"), // 23-day run
      ev("d", "2026-11-01", "2026-11-01"),
    ];
    for (const [from, to] of [["2026-10-01", "2026-10-31"], ["2026-10-12", "2026-10-18"], ["2026-10-11", "2026-10-11"], ["2026-11-01", "2026-11-01"]] as const) {
      const rows = new Set(eventsInPeriod(list, from, to).map((e) => e.id));
      const marked = new Set<string>();
      for (const ym of new Set([from.slice(0, 7), to.slice(0, 7)])) {
        for (const m of dayMarks(list, ym)) {
          if (m.date < from || m.date > to) continue;
          for (const e of list) if (e.firstDate <= m.date && e.lastDate >= m.date && (m.count > 0 || m.longRun)) marked.add(e.id);
        }
      }
      assert.deepEqual([...marked].sort(), [...rows].sort(), `${from}..${to}`);
    }
    const oct11 = dayMarks(list, "2026-10").find((m) => m.date === "2026-10-11")!;
    assert.equal(oct11.count, 2, "two short events on the 11th");
  });

  it("K5 an event with no stated vertical is under All only", () => {
    const e = ev("x", "2026-10-10", "2026-10-10", { vertical: null });
    assert.equal(matchesKind(e, "all"), true);
    for (const k of ["music", "fashion", "motorsport", "other", "season"] as const) assert.equal(matchesKind(e, k), false, k);
    assert.equal(matchesKind(ev("y", "2026-10-10", "2026-10-10", { vertical: "other" }), "other"), true);
  });

  it("K6 'outside the city' only where a locality is stored and differs", () => {
    assert.equal(eventPlace(ev("o", "2026-10-24", "2026-10-24", { venue: "Kyocera Dome Osaka", venueLocality: "Osaka" })), "Kyocera Dome Osaka, Osaka · outside the city, planned from Kyoto");
    assert.equal(eventPlace(ev("n", "2026-10-24", "2026-10-24", { venue: "Kyoto Concert Hall", venueLocality: null })), "Kyoto Concert Hall · Kyoto", "none stored: no claim either way");
    assert.equal(eventPlace(ev("s", "2026-10-24", "2026-10-24", { venue: "Hall", venueLocality: "kyoto" })), "Hall · Kyoto", "same city: no claim");
  });

  it("K7 a long run is an underline, not a count", () => {
    const run = ev("r", "2026-10-14", "2026-11-05");
    const short = ev("s", "2026-10-20", "2026-10-20");
    const m = dayMarks([run, short], "2026-10").find((x) => x.date === "2026-10-20")!;
    assert.equal(m.count, 1);
    assert.equal(m.longRun, true);
    const ten = ev("t", "2026-10-01", "2026-10-10");
    assert.equal(dayMarks([ten], "2026-10")[0].longRun, false, "ten days is not a long run");
  });

  it("K8 Where to go: every market, unrated said, best first, vibe narrows places only", () => {
    const place = (marketKey: string, city: string, seasons: CalendarPlace["seasons"], vibeTags: string[] = []): CalendarPlace => ({
      marketKey, city, country: "X", vibeTags, seasons,
    });
    const places = [
      place("goa", "Goa", {}),
      place("kyoto", "Kyoto", { "10": { group: "best", averageTemp: "16-22°C", crowdLevel: "High", scope: "country" } }, ["cultural", "foodie"]),
      place("edinburgh", "Edinburgh", { "10": { group: "good", averageTemp: null, crowdLevel: "Medium", scope: "country" } }, ["nightlife"]),
      place("porto", "Porto", { "10": { group: "off", averageTemp: null, crowdLevel: null, scope: "city" } }),
      place("bogota", "Bogotá", {}),
    ];
    const events = [ev("g", "2026-10-20", "2026-10-20", { marketKey: "bogota", city: "Bogotá" })];
    const rows = whereToGo(places, "2026-10", events, "all");
    assert.deepEqual(rows.map((r) => r.place.marketKey), ["kyoto", "edinburgh", "bogota", "goa", "porto"]);
    assert.equal(rows.find((r) => r.place.marketKey === "goa")!.group, "unrated", "no row = not rated, never dropped");
    assert.equal(rows.find((r) => r.place.marketKey === "kyoto")!.facts, "16-22°C · High crowds");
    assert.equal(rows.find((r) => r.place.marketKey === "edinburgh")!.facts, "Medium crowds");
    assert.equal(rows.find((r) => r.place.marketKey === "goa")!.facts, null);
    assert.equal(rows.find((r) => r.place.marketKey === "bogota")!.eventCount, 1);
    assert.deepEqual(whereToGo(places, "2026-10", events, "foodie").map((r) => r.place.marketKey), ["kyoto"]);
  });

  it("K9 Monday weeks and period titles", () => {
    assert.equal(mondayColumn("2026-10-05"), 0, "5 Oct 2026 is a Monday");
    assert.equal(mondayColumn("2026-10-11"), 6, "Sunday is the last column");
    assert.equal(weekStartOf("2026-10-11"), "2026-10-05");
    assert.deepEqual(periodRange("week", "2026-10", null, "2026-09-28"), { from: "2026-09-28", to: "2026-10-04" });
    assert.equal(periodTitle("week", "2026-10", null, "2026-09-28"), "28 Sep – 4 Oct");
    assert.equal(periodTitle("week", "2026-10", null, "2026-10-05"), "5 – 11 October");
    assert.equal(periodTitle("day", "2026-10", "2026-10-12", null), "Monday 12 October");
    assert.equal(periodTitle("month", "2027-01", null, null), "January 2027");
  });

  it("K10 tag and dates say only what the row holds", () => {
    assert.equal(eventTag(ev("a", "2026-10-10", "2026-10-12")), "Music · 3 days");
    assert.equal(eventTag(ev("b", "2026-10-14", "2026-11-05", { vertical: "other" })), "Festivals & culture · 23-day run");
    assert.equal(eventTag(ev("c", "2026-10-10", "2026-10-10", { vertical: null })), "One day");
    assert.equal(eventWhen(ev("d", "2026-10-16", "2026-10-16", { startTime: "21:30" })), "Fri 16 Oct · 21:30");
    assert.equal(eventWhen(ev("e", "2026-10-16", "2026-10-16")), "Fri 16 Oct", "no published time, none shown");
    assert.equal(eventWhen(ev("f", "2026-10-10", "2026-10-12")), "Sat 10 Oct – Mon 12 Oct");
  });
});
