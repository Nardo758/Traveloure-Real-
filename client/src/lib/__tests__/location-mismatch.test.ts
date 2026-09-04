/**
 * LOCATION MISMATCH — the negatives are the point.
 * Ledger `2026-09-04-location-mismatch`; reader: client/src/lib/location-mismatch.ts.
 *
 * WHY THIS EXISTS. This surface's entire value is that it never overclaims: a false alert on a plan
 * that is fine is worse than a missed one. Every way the decision could turn a NON-answer into an
 * answer is therefore pinned here, not just the happy mismatch:
 *
 *   M1  a listing with NO location — null, undefined, "", whitespace, and the stored "Unknown"
 *       sentinel (`provider_services.location` defaults to it) — produces NO alert, and never a
 *       headline reading "This is in Unknown."
 *   M2  a missing comparison target is silence too. Absent on EITHER side ⇒ no alert (§13).
 *   M3  agreement survives case, whitespace and a ", Country" / broadening suffix — the shapes a
 *       provider actually types. These are the false-alert cases; each one must stay quiet.
 *   M4  a genuine mismatch alerts, and reports BOTH cities in their original casing.
 *   M5  the near-miss negatives: a loose substring rule would match "York" to "New York" and
 *       "City" to "Kansas City". Leading-prefix-only is what stops it, so it is pinned in both
 *       directions.
 *   M6  the ratified resolution order — a named event's own location WINS over the plan's
 *       destination, and an event with NO location falls through to the plan rather than
 *       suppressing the check or inventing a place.
 *   M7  the two shared segments that must not silence the mock's own case: "Osaka, Japan" vs
 *       "Kyoto, Japan" share "japan" and MUST still flag.
 *   M8  the copy is derived from the decision, never restated at a call site.
 *
 * Pure unit: no DOM, no DB, no fetch.
 * Run: npx tsx --test client/src/lib/__tests__/location-mismatch.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MISMATCH_HONESTY_LINE,
  displayCity,
  evaluateLocationMismatch,
  locationSegments,
  locationsAgree,
  mismatchHeadline,
  mismatchSubline,
  segmentsAgree,
  type MismatchAlert,
} from "../location-mismatch";

/** Every spelling of "this row never answered the location question". */
const NO_LOCATION: Array<string | null | undefined> = [
  null,
  undefined,
  "",
  "   ",
  "Unknown",
  "unknown",
  "  UNKNOWN  ",
  ",,",
];

function alertOf(decision: ReturnType<typeof evaluateLocationMismatch>): MismatchAlert {
  assert.equal(decision.mismatch, true, "expected an alert");
  return decision as MismatchAlert;
}

describe("M1 — a listing with no location never alerts", () => {
  for (const raw of NO_LOCATION) {
    it(`listingLocation ${JSON.stringify(raw)} ⇒ no alert`, () => {
      const decision = evaluateLocationMismatch({
        listingLocation: raw,
        planDestination: "Kyoto",
      });
      assert.deepEqual(decision, { mismatch: false, reason: "no_listing_location" });
    });
  }

  it('"Unknown" is a sentinel, not a city — it can never reach a headline', () => {
    assert.deepEqual(locationSegments("Unknown"), []);
    assert.equal(displayCity("Unknown"), "");
    // The sentinel is dropped even when it rides beside a real segment.
    assert.deepEqual(locationSegments("Unknown, Japan"), ["japan"]);
  });
});

describe("M2 — a missing comparison target is silence, never a warning", () => {
  for (const raw of NO_LOCATION) {
    it(`planDestination ${JSON.stringify(raw)} ⇒ no alert`, () => {
      const decision = evaluateLocationMismatch({
        listingLocation: "Osaka, Japan",
        planDestination: raw,
      });
      assert.deepEqual(decision, { mismatch: false, reason: "no_comparison_location" });
    });
  }

  it("no plan and no event at all ⇒ no alert", () => {
    assert.deepEqual(evaluateLocationMismatch({ listingLocation: "Osaka" }), {
      mismatch: false,
      reason: "no_comparison_location",
    });
  });
});

describe("M3 — agreement survives the shapes providers actually type", () => {
  const agreeing: Array<[string, string, string]> = [
    ["exact", "Kyoto", "Kyoto"],
    ["case", "kyoto", "KYOTO"],
    ["whitespace", "   Kyoto   ", "Kyoto"],
    ["listing carries a country suffix", "Kyoto, Japan", "Kyoto"],
    ["plan carries a country suffix", "Kyoto", "Kyoto, Japan"],
    ["both carry a country suffix", "Kyoto, Japan", "Kyoto, Japan"],
    ["punctuation and inner spacing", "St. Louis", "St Louis"],
    ["diacritics", "Zürich", "Zurich"],
    ["a broadening word appended", "Osaka", "Osaka Bay Area"],
    ["listing district-qualified", "Gion, Kyoto, Japan", "Kyoto"],
    ["plan district-qualified", "Kyoto", "Gion, Kyoto"],
  ];
  for (const [label, listing, plan] of agreeing) {
    it(`${label}: ${JSON.stringify(listing)} vs ${JSON.stringify(plan)} ⇒ no alert`, () => {
      assert.deepEqual(evaluateLocationMismatch({ listingLocation: listing, planDestination: plan }), {
        mismatch: false,
        reason: "match",
      });
    });
  }
});

describe("M4 — a genuine mismatch alerts and names both cities as written", () => {
  it("the mock's own case", () => {
    const alert = alertOf(
      evaluateLocationMismatch({ listingLocation: "Osaka, Japan", planDestination: "Kyoto" }),
    );
    assert.equal(alert.listingCity, "Osaka");
    assert.equal(alert.comparisonCity, "Kyoto");
    assert.equal(alert.source, "plan");
  });

  it("original casing is preserved on both sides — the row's own words, not a normalized form", () => {
    const alert = alertOf(
      evaluateLocationMismatch({ listingLocation: "SAN diego, CA", planDestination: "  Los Angeles, CA  " }),
    );
    assert.equal(alert.listingCity, "SAN diego");
    assert.equal(alert.comparisonCity, "Los Angeles");
  });
});

describe("M5 — near-misses must NOT match loosely", () => {
  const nearMisses: Array<[string, string]> = [
    ["York", "New York"],
    ["New York", "York"],
    ["City", "Kansas City"],
    ["Kansas City", "City"],
    ["Ford", "Bradford"],
    ["Portland", "Port"],
  ];
  for (const [listing, plan] of nearMisses) {
    it(`${JSON.stringify(listing)} vs ${JSON.stringify(plan)} ⇒ alert (no loose containment)`, () => {
      assert.equal(
        evaluateLocationMismatch({ listingLocation: listing, planDestination: plan }).mismatch,
        true,
      );
    });
  }

  it("segmentsAgree is prefix-only, and word-aligned — it never matches a bare substring", () => {
    assert.equal(segmentsAgree("kyoto", "kyoto japan"), true);
    assert.equal(segmentsAgree("kyoto japan", "kyoto"), true);
    assert.equal(segmentsAgree("york", "new york"), false);
    assert.equal(segmentsAgree("port", "portland"), false);
    assert.equal(segmentsAgree("", "kyoto"), false);
  });
});

describe("M6 — resolution order: the named event wins, an unset event location falls through", () => {
  it("event location wins over the plan's destination", () => {
    const alert = alertOf(
      evaluateLocationMismatch({
        listingLocation: "Kyoto",
        eventLocation: "Osaka",
        planDestination: "Kyoto",
      }),
    );
    assert.equal(alert.source, "event");
    assert.equal(alert.comparisonCity, "Osaka");
    assert.equal(alert.listingCity, "Kyoto");
  });

  it("event location wins in the quiet direction too — it can silence a plan-level mismatch", () => {
    assert.deepEqual(
      evaluateLocationMismatch({
        listingLocation: "Osaka, Japan",
        eventLocation: "Osaka",
        planDestination: "Kyoto",
      }),
      { mismatch: false, reason: "match" },
    );
  });

  for (const raw of NO_LOCATION) {
    it(`event location ${JSON.stringify(raw)} ⇒ falls through to the plan's destination`, () => {
      const alert = alertOf(
        evaluateLocationMismatch({
          listingLocation: "Osaka",
          eventLocation: raw,
          planDestination: "Kyoto",
        }),
      );
      assert.equal(alert.source, "plan");
      assert.equal(alert.comparisonCity, "Kyoto");
    });
  }

  it("an event with no location and no plan destination is still silence, not a fallback guess", () => {
    assert.deepEqual(
      evaluateLocationMismatch({ listingLocation: "Osaka", eventLocation: "  ", planDestination: null }),
      { mismatch: false, reason: "no_comparison_location" },
    );
  });
});

describe("M7 — a shared trailing qualifier must not silence the check", () => {
  it('"Osaka, Japan" vs "Kyoto, Japan" still flags despite both naming Japan', () => {
    const alert = alertOf(
      evaluateLocationMismatch({ listingLocation: "Osaka, Japan", planDestination: "Kyoto, Japan" }),
    );
    assert.equal(alert.listingCity, "Osaka");
    assert.equal(alert.comparisonCity, "Kyoto");
  });

  it("locationsAgree anchors on the target's FIRST segment", () => {
    assert.equal(locationsAgree("Osaka, Japan", "Kyoto, Japan"), false);
    assert.equal(locationsAgree("Gion, Kyoto, Japan", "Kyoto, Japan"), true);
  });
});

describe("M8 — the copy is derived from the decision", () => {
  it("headline states the listing's city as a fact", () => {
    const alert = alertOf(
      evaluateLocationMismatch({ listingLocation: "Osaka, Japan", planDestination: "Kyoto" }),
    );
    assert.equal(mismatchHeadline(alert), "This is in Osaka.");
    assert.equal(mismatchSubline(alert), "Every event on your plan is in Kyoto.");
  });

  it("the event-sourced subline says which thing names the city", () => {
    const alert = alertOf(
      evaluateLocationMismatch({
        listingLocation: "Osaka",
        eventLocation: "Kyoto",
        planDestination: "Tokyo",
      }),
    );
    assert.equal(mismatchSubline(alert), "The event you're adding to is in Kyoto.");
  });

  it("the honesty line claims nothing beyond the string comparison", () => {
    assert.equal(
      MISMATCH_HONESTY_LINE,
      "Nothing is measured or guessed here. It is simply not in a city your plan names.",
    );
    assert.ok(!/\bkm\b|\bmiles?\b|\bminutes?\b|\bdistance\b/i.test(MISMATCH_HONESTY_LINE));
  });
});
