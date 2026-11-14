/**
 * LL-1 — the pure rules the plan surfaces read: where a stop's in-app "Details" goes, and which
 * travel-mode icon a leg shows. The spec is `live-links.md`, LL-1 only: in-app links, NO outside URLs.
 *
 * The strings asserted here are PENDING Leon's stamp and are plain placeholders; this test pins that
 * they exist in ONE file and stay listed, so the PR body and the code cannot drift apart.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PENDING_LL1_STRINGS,
  isInAppHref,
  stopDetailHref,
  travelModeAriaLabel,
  travelModeIcon,
} from "../plan-stop-links";

test("LL-1: every stop type opens an in-app page, and nothing else", () => {
  assert.equal(stopDetailHref({ kind: "event", sourceId: "evt_9" }), "/events/evt_9");
  assert.equal(stopDetailHref({ kind: "experience", slug: "kyoto-tea" }), "/experiences/kyoto-tea");
  assert.equal(stopDetailHref({ kind: "gem", city: "Kyoto" }), "/places/Kyoto");
  assert.equal(stopDetailHref({ kind: "place", city: "Kyoto" }), "/places/Kyoto");
  assert.equal(stopDetailHref({ kind: "activity", city: "Kyoto" }), "/places/Kyoto");

  // A stop that names nothing this app can open gets NO link rather than a guessed one.
  assert.equal(stopDetailHref({ kind: "event" }), null, "an event with no sourceId");
  assert.equal(stopDetailHref({ kind: "experience" }), null, "an experience with no slug");
  assert.equal(stopDetailHref(null), null);

  // A PRICED item is still just its in-app page: no checkout, no booking, no Ask.
  const priced = stopDetailHref({ kind: "priced_experience", slug: "hot-air" });
  assert.equal(priced, "/experiences/hot-air");
  assert.ok(!/checkout|book|ask/.test(priced ?? ""), "no priced control is reachable from the plan");
});

test("LL-1: no href this module produces can leave the origin", () => {
  const hrefs = [
    stopDetailHref({ kind: "event", sourceId: "e1" }),
    stopDetailHref({ kind: "experience", slug: "s1" }),
    stopDetailHref({ kind: "gem", city: "Kyoto" }),
  ];
  for (const h of hrefs) {
    assert.ok(isInAppHref(h), `${h} is in-app`);
    assert.ok(!/^https?:|^\/\//.test(h ?? ""), `${h} is not external`);
  }
  assert.equal(isInAppHref("https://example.com"), false);
  assert.equal(isInAppHref("//example.com"), false);
  assert.equal(isInAppHref(null), false);
});

test("LL-1: walk, train, bus and taxi each map to their icon and label; anything else maps to none", () => {
  assert.equal(travelModeIcon("walk"), "walk");
  assert.equal(travelModeIcon("train"), "train");
  assert.equal(travelModeIcon("bus"), "bus");
  assert.equal(travelModeIcon("taxi"), "taxi");
  // Water travel: the two values the codebase actually uses (maps.ts/navigate.ts unions).
  assert.equal(travelModeIcon("ferry"), "boat");
  assert.equal(travelModeIcon("boat"), "boat");
  assert.equal(travelModeIcon("FERRY"), "boat", "case does not matter");
  assert.equal(travelModeIcon("WALK"), "walk", "case does not matter");

  // water_taxi is a localName on a ferry profile, never a mode value - it must not map.
  for (const unknown of ["transit", "tram", "rideshare", "drive", "private_driver", "water_taxi", "", null, undefined]) {
    assert.equal(travelModeIcon(unknown as any), null, `${unknown} draws no icon`);
  }

  assert.equal(travelModeAriaLabel("walk"), PENDING_LL1_STRINGS.ariaWalk);
  assert.equal(travelModeAriaLabel("train"), PENDING_LL1_STRINGS.ariaTrain);
  assert.equal(travelModeAriaLabel("bus"), PENDING_LL1_STRINGS.ariaBus);
  assert.equal(travelModeAriaLabel("taxi"), PENDING_LL1_STRINGS.ariaTaxi);
  assert.equal(travelModeAriaLabel("boat"), PENDING_LL1_STRINGS.ariaBoat);
  assert.equal(PENDING_LL1_STRINGS.ariaBoat, "Boat to the next stop");
});

test("LL-1: the pending strings live in ONE file and are marked for Leon", () => {
  const src = fs.readFileSync("client/src/lib/plan-stop-links.ts", "utf8");
  assert.equal(PENDING_LL1_STRINGS.backToPlan, "Back to plan");
  assert.equal(PENDING_LL1_STRINGS.onDay(3), "On Day 3");
  const marks = (src.match(/\/\/ PENDING Leon wording/g) ?? []).length;
  assert.equal(marks, 5, "only the five icon labels are still pending; onDay/backToPlan are approved");
});
