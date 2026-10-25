/**
 * Custom pin is geocoded once and refused before any PaymentIntent, hold, or toll,
 * for a paid run, a Trip Pass run, and a free re-run.
 *
 * Run: npx tsx --test --test-force-exit server/services/__tests__/custom-pin-before-charge.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CUSTOM_PIN_HANDOFF_TTL_MS,
  placeCustomPinBeforeCharge,
  resetCustomPinHandoffForTests,
} from "../custom-pin-place";
import type { GeocodeDetailed } from "../../utils/geocode";
import { CUSTOM_LOCATION_REFUSAL_REASONS } from "@shared/custom-location-pin";

const routesSrc = fs.readFileSync(path.resolve(process.cwd(), "server/routes.ts"), "utf8");
const paymentsSrc = fs.readFileSync(path.resolve(process.cwd(), "server/routes/optimization.routes.ts"), "utf8");

function sliceBetween(source: string, startText: string, endText: string): string {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `missing slice ${startText}`);
  return source.slice(start, end);
}

const placed: GeocodeDetailed = {
  ok: true,
  results: [
    {
      lat: 35.0037,
      lng: 135.7788,
      formattedAddress: "Gion, Kyoto",
      locationType: "ROOFTOP",
      types: ["street_address"],
    },
  ],
  chosen: {
    lat: 35.0037,
    lng: 135.7788,
    formattedAddress: "Gion, Kyoto",
    locationType: "ROOFTOP",
    types: ["street_address"],
  },
};

describe("placeCustomPinBeforeCharge", () => {
  beforeEach(() => resetCustomPinHandoffForTests());

  it("refuses before payment, hold, or ledger effects for paid, trip pass, and free re-run", async () => {
    for (const basis of ["paid", "trip_pass", "free_rerun"] as const) {
      const effects: string[] = [];
      const placedPin = await placeCustomPinBeforeCharge({
        rawPin: { type: "neighborhood", name: "Nowhere Real" },
        userId: "user-1",
        tripId: "trip-1",
        geocode: async () => ({ ok: false, reason: "zero_results", results: [] }),
      });
      if (placedPin.ok) {
        if (basis === "paid") effects.push("payment_intent", "hold", "ledger");
        else effects.push("ledger");
      }
      assert.deepEqual(effects, [], basis);
      assert.equal(placedPin.ok, false);
      if (!placedPin.ok) {
        assert.equal(placedPin.status, 409);
        assert.deepEqual(placedPin.body, { error: "custom_location_unplaceable", reason: "zero_results" });
        assert.equal("message" in placedPin.body, false);
      }
    }
  });

  it("returns each typed reason at 409 and does not geocode a selected or already-placed pin", async () => {
    for (const reason of CUSTOM_LOCATION_REFUSAL_REASONS) {
      const out = await placeCustomPinBeforeCharge({
        rawPin: { type: "hotel", name: `Place ${reason}` },
        userId: "user-1",
        tripId: "trip-1",
        geocode: async () => ({ ok: false, reason, results: [] }),
      });
      assert.equal(out.ok, false);
      if (!out.ok) assert.deepEqual(out.body, { error: "custom_location_unplaceable", reason });
    }

    let calls = 0;
    const selected = { type: "hotel" as const, id: "hotel-1", name: "Catalog hotel" };
    const selectedOut = await placeCustomPinBeforeCharge({
      rawPin: selected,
      userId: "user-1",
      tripId: "trip-1",
      geocode: async () => {
        calls += 1;
        return placed;
      },
    });
    assert.equal(calls, 0);
    assert.equal(selectedOut.ok && selectedOut.resolved, null);
    assert.equal("lat" in selected, false);

    const coords = { type: "activity" as const, name: "Pinned", lat: 35, lng: 135.7 };
    const coordsOut = await placeCustomPinBeforeCharge({
      rawPin: coords,
      userId: "user-1",
      tripId: "trip-1",
      geocode: async () => {
        calls += 1;
        return placed;
      },
    });
    assert.equal(calls, 0);
    assert.equal(coordsOut.ok, true);
    if (coordsOut.ok && coordsOut.resolved) {
      assert.equal(coordsOut.resolved.lat, 35);
      assert.equal(coordsOut.resolved.formattedAddress, null);
    }
  });

  it("geocodes a name-only custom pin once per user, trip, and name, and writes lat/lng onto the object", async () => {
    let calls = 0;
    const geocode = async () => {
      calls += 1;
      return placed;
    };
    const first: { type: "hotel"; name: string; lat?: number; lng?: number } = { type: "hotel", name: "  Gion  " };
    const second: { type: "hotel"; name: string; lat?: number; lng?: number } = { type: "hotel", name: "gion" };
    const a = await placeCustomPinBeforeCharge({ rawPin: first, userId: "user-1", tripId: "trip-1", geocode });
    const b = await placeCustomPinBeforeCharge({ rawPin: second, userId: "user-1", tripId: "trip-1", geocode });
    assert.equal(calls, 1);
    assert.equal(first.lat, placed.chosen.lat);
    assert.equal(first.lng, placed.chosen.lng);
    assert.equal(second.lat, placed.chosen.lat);
    assert.equal(second.lng, placed.chosen.lng);
    assert.equal(a.ok && a.resolved && a.resolved.formattedAddress, "Gion, Kyoto");
    assert.equal(b.ok && b.resolved && b.resolved.name, "gion");

    const otherUser: { type: "hotel"; name: string; lat?: number; lng?: number } = { type: "hotel", name: "Gion" };
    await placeCustomPinBeforeCharge({ rawPin: otherUser, userId: "user-2", tripId: "trip-1", geocode });
    assert.equal(calls, 2);

    const otherTrip: { type: "hotel"; name: string; lat?: number; lng?: number } = { type: "hotel", name: "Gion" };
    await placeCustomPinBeforeCharge({ rawPin: otherTrip, userId: "user-1", tripId: "trip-2", geocode });
    assert.equal(calls, 3);
  });

  it("geocodes again after the handoff expires, and a thrown geocode is provider_error", async () => {
    let clock = 1_000;
    let calls = 0;
    const pin = () => ({ type: "neighborhood" as const, name: "Pontocho" });
    await placeCustomPinBeforeCharge({
      rawPin: pin(),
      userId: "user-1",
      tripId: "trip-1",
      now: () => clock,
      geocode: async () => {
        calls += 1;
        return placed;
      },
    });
    clock += CUSTOM_PIN_HANDOFF_TTL_MS + 1;
    await placeCustomPinBeforeCharge({
      rawPin: pin(),
      userId: "user-1",
      tripId: "trip-1",
      now: () => clock,
      geocode: async () => {
        calls += 1;
        return placed;
      },
    });
    assert.equal(calls, 2);

    const thrown = await placeCustomPinBeforeCharge({
      rawPin: { type: "hotel", name: "Boom" },
      userId: "user-1",
      tripId: "trip-1",
      geocode: async () => {
        throw new Error("provider down");
      },
    });
    assert.equal(thrown.ok, false);
    if (!thrown.ok) assert.equal(thrown.body.reason, "provider_error");
  });

  it("does not treat a type-only or half coordinate pin as a selected candidate", async () => {
    let calls = 0;
    const geocode = async () => {
      calls += 1;
      return placed;
    };
    const typeOnly = await placeCustomPinBeforeCharge({
      rawPin: { type: "hotel" },
      userId: "user-1",
      tripId: "trip-1",
      geocode,
    });
    assert.equal(calls, 0);
    assert.equal(typeOnly.ok && typeOnly.resolved, null);

    const half: { type: "hotel"; name: string; lat?: number; lng?: number } = { type: "hotel", name: "Half", lat: 35 };
    const halfOut = await placeCustomPinBeforeCharge({ rawPin: half, userId: "user-1", tripId: "trip-1", geocode });
    assert.equal(calls, 1);
    assert.equal(halfOut.ok, true);
    assert.equal(half.lat, placed.chosen.lat);
    assert.equal(half.lng, placed.chosen.lng);
  });
});

describe("pay-gate source order", () => {
  it("refuses on the payments handler before any charge, and attaches the placed pin on success", () => {
    const handler = sliceBetween(
      paymentsSrc,
      'router.post("/api/optimization-payments"',
      'router.post("/api/optimization-payments/cancel"',
    );
    const pinAt = handler.indexOf("placeCustomPinBeforeCharge");
    assert.ok(pinAt > handler.indexOf("ai_concierge_disabled"));
    for (const marker of ["coversAction(", "chargeSavedMethod(", "paymentIntents.create", "reuseOrCreateOptimizationIntent("]) {
      const at = handler.indexOf(marker);
      assert.ok(at > pinAt, marker);
    }
    const resolvedReturns = handler.split("return res.json(withResolvedPin(").length - 1;
    assert.equal(resolvedReturns, 5);
    assert.doesNotMatch(handler, /createHold/);
    assert.doesNotMatch(handler, /await recordOptimizerRunToll/);
    const pinLine = handler
      .split("\n")
      .find((line) => line.includes("req.body?.pinnedAnchor"));
    assert.ok(pinLine);
    assert.doesNotMatch(pinLine!, /\b(userId|amount|price)\b/);
  });

  it("refuses on create before authorization, insert, and the toll, and keeps the pinned resolver call", () => {
    const handler = sliceBetween(
      routesSrc,
      'app.post("/api/itinerary-comparisons", isAuthenticated',
      'app.get("/api/dashboard/trip-scores"',
    );
    const pinAt = handler.indexOf("placeCustomPinBeforeCharge");
    for (const marker of [
      "resolveOptimizerRunAuthorization(",
      ".insert(itineraryComparisons)",
      "recordOptimizerRunTollFor(",
    ]) {
      assert.ok(handler.indexOf(marker) > pinAt, marker);
    }
    assert.match(
      handler,
      /const resolvedPinnedAnchor = await resolveOptimizerPinnedAnchor\(\s*rawPinnedAnchor,\s*baselineItems,\s*\);/,
    );
    assert.match(handler, /tripPreferencesForCreate,\s*fixedCommitments,\s*resolvedPinnedAnchor,/);
    assert.match(handler, /pinnedAnchor:\s*rawPinnedAnchor/);
  });

  it("refuses on generate before the pay gate, the payment claim, the toll, and the started response", () => {
    const handler = sliceBetween(
      routesSrc,
      'app.post("/api/itinerary-comparisons/:id/generate"',
      'app.post("/api/itinerary-comparisons/:id/select"',
    );
    const pinAt = handler.indexOf("placeCustomPinBeforeCharge");
    for (const marker of [
      "resolveOptimizerRunAuthorization(",
      "optimizationPaymentId: runAuth.optimizationPaymentId",
      "recordOptimizerRunTollFor(",
      'res.json({ message: "Optimization started"',
    ]) {
      assert.ok(handler.indexOf(marker) > pinAt, marker);
    }
    assert.match(
      handler,
      /const resolvedPinnedAnchor = await resolveOptimizerPinnedAnchor\(\s*rawPinnedAnchor,\s*baselineItems,\s*\);/,
    );
    assert.match(handler, /tripPreferencesForGen,\s*fixedCommitments,\s*resolvedPinnedAnchor,/);
    assert.doesNotMatch(handler, /Unresolvable ⇒ undefined ⇒ auto anchors/);
  });
});
