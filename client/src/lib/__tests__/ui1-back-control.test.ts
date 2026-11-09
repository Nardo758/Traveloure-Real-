/**
 * UI-1 · B-7 — the top bar's back control (ruled 2026-11-09, Leon).
 *
 * The board draws an arrow, not a target, so the target is decided in ONE module (`@/lib/slip-back`)
 * and pinned here:
 *
 *   B1 an owner with no in-app history falls back to `/plans` (the plan list)
 *   B2 a GUEST with no in-app history falls back to the plan's city in Browse — never to sign-in
 *   B3 a guest plan naming no city falls back to Browse itself, never to a guessed city
 *   B4 "in-app history" means same-origin: a cross-origin referrer is not history
 *   B5 a fresh tab (one history entry) is not history, whatever the referrer
 *   B6 an in-app push (empty referrer) still reads as history — the SPA never reloads the document
 *   B7 the header actually wires the decision: the arrow is a real link, before the eyebrow, and it
 *      steps back when it can
 *
 * Run: npx tsx --test client/src/lib/__tests__/ui1-back-control.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sameOriginHistory, slipBackCity, slipBackHref } from "../slip-back";

const SRC = fs.readFileSync("client/src/components/plancard/SlipView.tsx", "utf8");
const ORIGIN = "https://traveloure.test";

describe("B-7 — the back control falls back by rail, never to a wall", () => {
  it("B1 an owner with no in-app history goes to the plan list", () => {
    assert.equal(slipBackHref({ guest: false, destination: "Kyoto, Japan" }), "/plans");
    assert.equal(slipBackHref({ guest: false, destination: null }), "/plans");
  });

  it("B2 a guest with no in-app history goes to the plan's city in Browse", () => {
    assert.equal(slipBackHref({ guest: true, destination: "Kyoto, Japan" }), "/discover/location/Kyoto");
    assert.equal(slipBackHref({ guest: true, destination: "Kyoto" }), "/discover/location/Kyoto");
    // One path segment, encoded — a two-word city is still a city, not two segments.
    assert.equal(slipBackHref({ guest: true, destination: "Mexico City" }), "/discover/location/Mexico%20City");
    for (const guest of [
      slipBackHref({ guest: true, destination: "Kyoto, Japan" }),
      slipBackHref({ guest: true, destination: null }),
    ]) {
      // The ruling's hard edge: a guest has no plan list, and `/plans` is protected — sending them
      // there would turn "back" into a sign-in wall.
      assert.doesNotMatch(guest, /sign-?in|log-?in|\/auth/, "a back control never sends a guest to a wall");
      assert.notEqual(guest, "/plans", "a guest has no plan list to return to");
    }
  });

  it("B3 a guest plan naming no city falls back to Browse itself", () => {
    assert.equal(slipBackHref({ guest: true, destination: null }), "/discover");
    assert.equal(slipBackHref({ guest: true, destination: "   " }), "/discover");
    assert.equal(slipBackHref({ guest: true, destination: ", Japan" }), "/discover");
    assert.equal(slipBackCity("  , Japan"), null, "an empty head is no city, not a blank slug");
    assert.equal(slipBackCity("Kyoto, Japan"), "Kyoto");
  });
});

describe("B-7 — when stepping back stays inside the app", () => {
  it("B4 a cross-origin referrer is not in-app history", () => {
    assert.equal(
      sameOriginHistory({ referrer: "https://www.google.com/search?q=traveloure", historyLength: 2, origin: ORIGIN }),
      false,
      "back would leave the app for Google",
    );
    assert.equal(
      sameOriginHistory({ referrer: "not a url", historyLength: 3, origin: ORIGIN }),
      false,
      "an unparseable referrer is not evidence of anything",
    );
  });

  it("B5 a fresh tab has no history behind it", () => {
    assert.equal(sameOriginHistory({ referrer: "", historyLength: 1, origin: ORIGIN }), false);
  });

  it("B6 an in-app push still reads as history (the SPA leaves no referrer)", () => {
    assert.equal(
      sameOriginHistory({ referrer: "", historyLength: 2, origin: ORIGIN }),
      true,
      "My Trips → plan is an in-app push; back must return to My Trips",
    );
    assert.equal(
      sameOriginHistory({ referrer: `${ORIGIN}/my-trips`, historyLength: 3, origin: ORIGIN }),
      true,
      "a same-origin referrer is the same answer",
    );
  });

  it("B7 the header wires it: a real link before the eyebrow, stepping back when it can", () => {
    const back = SRC.indexOf('data-testid="slip-back"');
    const eyebrow = SRC.indexOf('data-testid="slip-occasion-name"');
    assert.ok(back > 0, "the control exists");
    assert.ok(eyebrow > 0, "the eyebrow survives the regroup");
    assert.ok(back < eyebrow, "the arrow leads the row, before the eyebrow");
    // The href is the fallback; the click only overrides it when it may.
    assert.match(SRC, /href=\{backHref\}/, "the link's target is the ruled fallback");
    assert.match(SRC, /slipBackHref\(\{ guest: !!guest, destination: trip\?\.destination/, "guest-ness comes from the guest rail, city from the plan");
    assert.match(SRC, /sameOriginHistory\(\{/, "the same-origin question is asked, from one module");
    assert.match(SRC, /window\.history\.back\(\)/, "in-app history steps back");
    // Accessible name, and a hit area a thumb can find (>= 32px square).
    assert.match(SRC, /aria-label="Back"/);
    assert.match(SRC, /h-9 w-9/, "a 36px target, not a bare glyph");
  });
});
