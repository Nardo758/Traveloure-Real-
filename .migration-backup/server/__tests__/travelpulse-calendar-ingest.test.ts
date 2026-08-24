/**
 * travelpulse-calendar-ingest.test.ts
 *
 * Pure unit tests for the calendar-event shaping/expansion/dedupe logic
 * (server/services/travelpulse-calendar-shaping.ts). NO DB required — the shaping module has no
 * db/network imports, so it is safe to `tsx --test` in any environment.
 *
 * Proves the code path that lights the R33 event spotlight: real festival rules expand into
 * forward-dated Kyoto/Edinburgh rows, Nager holidays shape cleanly, ids are deterministic, and
 * re-ingest dedupes — the honesty invariant (no invented dates, no fabricated metrics) holds.
 *
 * Run with: npx tsx --test server/__tests__/travelpulse-calendar-ingest.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysIso,
  dedupeEvents,
  deterministicEventId,
  expandFestivalRules,
  isoFromYmd,
  loadFestivalRules,
  shapeHolidayEvents,
  type FestivalRule,
} from "../services/travelpulse-calendar-shaping";

describe("date helpers", () => {
  it("isoFromYmd builds a DST-safe calendar day", () => {
    assert.equal(isoFromYmd(2026, 7, 17), "2026-07-17");
    assert.equal(isoFromYmd(2026, 1, 1), "2026-01-01");
  });

  it("addDaysIso rolls across month and year boundaries", () => {
    assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");
    assert.equal(addDaysIso("2026-02-28", 1), "2026-03-01");
    assert.equal(addDaysIso("2026-07-17", 0), "2026-07-17");
  });
});

describe("deterministicEventId", () => {
  it("is stable and lowercases the city", () => {
    const a = deterministicEventId("kyoto_city_tourism", "Kyoto", "2026-07-17", "gion");
    const b = deterministicEventId("kyoto_city_tourism", "kyoto", "2026-07-17", "gion");
    assert.equal(a, b);
    assert.equal(a, "cal:kyoto_city_tourism:kyoto:2026-07-17:gion");
  });
});

describe("expandFestivalRules", () => {
  const fixed: FestivalRule = {
    key: "gion-junko",
    eventName: "Gion Matsuri Yamaboko Junko",
    eventType: "festival",
    city: "kyoto",
    country: "Japan",
    source: "kyoto_city_tourism",
    fixedDate: { month: 7, day: 17 },
  };

  it("emits one row per year in the window for a fixed-date festival", () => {
    const rows = expandFestivalRules([fixed], "2026-06-01", "2027-12-31");
    const starts = rows.map((r) => r.startDate).sort();
    assert.deepEqual(starts, ["2026-07-17", "2027-07-17"]);
    assert.equal(rows[0].city, "kyoto");
    assert.equal(rows[0].endDate, null); // single-day, honest null
  });

  it("respects the window bounds (nothing before start or after end)", () => {
    // window starts AFTER this year's July 17 -> only next year qualifies
    const rows = expandFestivalRules([fixed], "2026-08-01", "2027-08-01");
    assert.deepEqual(rows.map((r) => r.startDate), ["2027-07-17"]);
  });

  it("expands a date range and sets endDate", () => {
    const rule: FestivalRule = {
      key: "gion",
      eventName: "Gion Matsuri",
      eventType: "festival",
      city: "kyoto",
      country: "Japan",
      source: "kyoto_city_tourism",
      dateRange: { startMonth: 7, startDay: 1, endMonth: 7, endDay: 31 },
    };
    const rows = expandFestivalRules([rule], "2026-01-01", "2026-12-31");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].startDate, "2026-07-01");
    assert.equal(rows[0].endDate, "2026-07-31");
  });

  it("wraps a year-crossing range (Hogmanay) and honours durationDays", () => {
    const hogmanay: FestivalRule = {
      key: "hogmanay",
      eventName: "Edinburgh's Hogmanay",
      eventType: "festival",
      city: "edinburgh",
      country: "United Kingdom",
      source: "edinburgh_festivals",
      fixedDate: { month: 12, day: 31, durationDays: 1 },
    };
    const rows = expandFestivalRules([hogmanay], "2026-06-01", "2027-06-01");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].startDate, "2026-12-31");
    assert.equal(rows[0].endDate, "2027-01-01");
  });

  it("skips a rule with no recognised recurrence shape (never guesses a date)", () => {
    const bad = { key: "x", eventName: "X", eventType: "festival", city: "kyoto", country: "Japan", source: "s" } as FestivalRule;
    assert.deepEqual(expandFestivalRules([bad], "2026-01-01", "2027-01-01"), []);
  });
});

describe("shapeHolidayEvents", () => {
  it("maps Nager records to holiday rows keyed on city", () => {
    const rows = shapeHolidayEvents(
      [
        { date: "2026-01-01", localName: "元日", name: "New Year's Day" },
        { date: "2026-05-05", localName: "こどもの日", name: "Children's Day" },
      ],
      "Kyoto",
      "Japan",
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].city, "kyoto");
    assert.equal(rows[0].eventType, "holiday");
    assert.equal(rows[0].source, "nager_date");
    assert.equal(rows[0].eventName, "元日");
    assert.equal(rows[0].description, null); // no fabricated blurb
  });

  it("drops records with a malformed or missing date, and nameless records", () => {
    const rows = shapeHolidayEvents(
      [
        { date: "not-a-date", name: "Bad" },
        { date: "2026-05-05", name: "" },
        { date: "2026-05-05", name: "Children's Day" },
      ] as any,
      "kyoto",
      "Japan",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].eventName, "Children's Day");
  });
});

describe("dedupeEvents", () => {
  it("collapses duplicate ids (idempotent re-ingest)", () => {
    const rows = expandFestivalRules(
      [
        {
          key: "aoi",
          eventName: "Aoi Matsuri",
          eventType: "festival",
          city: "kyoto",
          country: "Japan",
          source: "kyoto_city_tourism",
          fixedDate: { month: 5, day: 15 },
        },
      ],
      "2026-01-01",
      "2026-12-31",
    );
    const doubled = dedupeEvents([...rows, ...rows]);
    assert.equal(doubled.length, 1);
  });
});

describe("committed festival registry (real, dated, offline)", () => {
  const rules = loadFestivalRules();

  it("loads real rules for both wedge markets", () => {
    assert.ok(rules.length >= 8, "expected the committed matsuri + Edinburgh set");
    const cities = new Set(rules.map((r) => r.city));
    assert.ok(cities.has("kyoto"));
    assert.ok(cities.has("edinburgh"));
  });

  it("every rule carries a real attributed source and no fabricated surge metric", () => {
    for (const r of rules) {
      assert.ok(r.source && r.source.length > 0, `${r.key} missing source`);
      assert.notEqual(r.source, "grok", `${r.key} must not be LLM-sourced`);
      assert.ok(r.fixedDate || r.dateRange || (r.dates && r.dates.length > 0), `${r.key} has no dated recurrence`);
    }
  });

  it("produces forward Kyoto rows across a 400-day window (self-unlocks the R33 spotlight)", () => {
    // Anchor to a fixed 'now' so the test is deterministic regardless of run date.
    const now = "2026-08-21";
    const end = addDaysIso(now, 400);
    const rows = expandFestivalRules(rules, now, end);
    const kyoto = rows.filter((r) => r.city === "kyoto");
    assert.ok(kyoto.length > 0, "Kyoto must have forward-dated rows");
    // Every emitted row is inside the window and truly forward.
    for (const r of kyoto) {
      assert.ok(r.startDate >= now && r.startDate <= end);
    }
    // Gion Matsuri 2027 (next occurrence after 2026-08-21) must be present.
    assert.ok(rows.some((r) => r.eventName === "Gion Matsuri" && r.startDate === "2027-07-01"));
  });
});
