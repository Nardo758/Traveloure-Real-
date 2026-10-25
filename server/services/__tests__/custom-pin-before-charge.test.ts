/**
 * Custom pin is geocoded once and refused before any PaymentIntent, hold, or toll,
 * for a paid run, a Trip Pass run, and a free re-run.
 *
 * Run: npx tsx --test --test-force-exit server/services/__tests__/custom-pin-before-charge.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { placeCustomPinBeforeCharge } from "../custom-pin-place";
import { signCustomPinPlacement } from "../custom-pin-placement";
import { CUSTOM_PIN_PLACEMENT_MAX_AGE_MS } from "@shared/custom-location-pin";
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

const SECRET = "placement-test-secret";

describe("placeCustomPinBeforeCharge", () => {
  it("a refusal returns before any PaymentIntent, hold, ledger row, or itinerary insert", () => {
    const writes = [
      "paymentIntents.create",
      "chargeSavedMethod(",
      "reuseOrCreateOptimizationIntent(",
      "recordOptimizerRunTollFor(",
      ".insert(itineraryComparisons)",
      ".insert(itineraryVariants)",
      "createHold",
    ];
    const handlers: Array<[string, string, string, string]> = [
      [paymentsSrc, 'router.post("/api/optimization-payments"', 'router.post("/api/optimization-payments/cancel"', "if (!placedPin.ok)"],
      [routesSrc, 'app.post("/api/itinerary-comparisons", isAuthenticated', 'app.get("/api/dashboard/trip-scores"', "if (!placedPinForCreate.ok)"],
      [routesSrc, 'app.post("/api/itinerary-comparisons/:id/generate"', 'app.post("/api/itinerary-comparisons/:id/select"', "if (!placedPinForGenerate.ok)"],
    ];
    for (const [source, startText, endText, returnText] of handlers) {
      const handler = sliceBetween(source, startText, endText);
      const ret = handler.indexOf(returnText);
      assert.ok(ret > 0, returnText);
      const before = handler.slice(0, ret);
      for (const marker of writes) {
        assert.equal(before.includes(marker), false, `${returnText} precedes ${marker}`);
      }
      assert.match(handler, /activityStops/, `${returnText} looks up catalog ids on the same early gate`);
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
    const selected = { type: "hotel" as const, id: "hotel-1", name: "Catalog hotel", lat: 1, lng: 2 };
    const selectedOut = await placeCustomPinBeforeCharge({
      rawPin: selected,
      userId: "user-1",
      tripId: "trip-1",
      catalogPinExists: async () => true,
      geocode: async () => {
        calls += 1;
        return placed;
      },
    });
    assert.equal(calls, 0);
    assert.equal(selectedOut.ok, true);
    if (selectedOut.ok) {
      assert.equal(selectedOut.resolved, null);
      assert.equal(selectedOut.placement, null);
    }
    assert.equal("lat" in selected, false, "a found catalog id does not keep the client's lat/lng");

    const bare = { type: "activity" as const, name: "Pinned", lat: 35, lng: 135.7 };
    const bareOut = await placeCustomPinBeforeCharge({
      rawPin: bare,
      userId: "user-1",
      tripId: "trip-1",
      secret: SECRET,
      geocode: async () => {
        calls += 1;
        return placed;
      },
    });
    assert.equal(calls, 1, "a bare lat/lng is re-geocoded");
    assert.equal(bareOut.ok, true);
    if (bareOut.ok && bareOut.resolved && bareOut.placement) {
      assert.equal(bareOut.resolved.lat, placed.chosen.lat);
      assert.equal(bare.lat, placed.chosen.lat);
      assert.equal(bareOut.placement.source, "google_geocode");
      assert.equal(typeof bareOut.placement.at, "string");
      assert.equal(typeof bareOut.placement.sig, "string");
    }
  });

  it("accepts a valid signature without calling Google, and re-geocodes a tampered, expired, future, or unsigned placement", async () => {
    const issuedAt = Date.parse("2026-10-25T12:00:00.000Z");
    const placement = signCustomPinPlacement({
      name: "Gion",
      lat: 35.0037,
      lng: 135.7788,
      now: issuedAt,
      secret: SECRET,
    });
    let calls = 0;
    const geocode = async () => {
      calls += 1;
      return placed;
    };
    const raw = {
      type: "neighborhood" as const,
      name: "Gion",
      lat: 1,
      lng: 2,
      placement,
    };
    const accepted = await placeCustomPinBeforeCharge({
      rawPin: raw,
      userId: "user-1",
      tripId: "trip-1",
      secret: SECRET,
      now: () => issuedAt + 60_000,
      geocode,
    });
    assert.equal(calls, 0);
    assert.equal(accepted.ok, true);
    if (accepted.ok && accepted.resolved) {
      assert.equal(accepted.resolved.lat, 35.0037);
      assert.equal(accepted.resolved.lng, 135.7788);
      assert.equal(accepted.resolved.formattedAddress, null);
      assert.equal(raw.lat, 35.0037);
      assert.equal(accepted.placement?.sig, placement.sig);
    }

    const tamperedLat = { ...placement, lat: 35.1, lng: 135 };
    await placeCustomPinBeforeCharge({
      rawPin: { type: "neighborhood", name: "Gion", placement: tamperedLat },
      userId: "user-2",
      tripId: "trip-9",
      secret: SECRET,
      now: () => issuedAt + 60_000,
      geocode,
    });
    const tamperedName = await placeCustomPinBeforeCharge({
      rawPin: { type: "neighborhood", name: "Pontocho", placement },
      userId: "user-1",
      tripId: "trip-1",
      secret: SECRET,
      now: () => issuedAt + 60_000,
      geocode,
    });
    assert.equal(tamperedName.ok, true);
    const expired = await placeCustomPinBeforeCharge({
      rawPin: { type: "neighborhood", name: "Gion", placement },
      userId: "user-1",
      tripId: "trip-1",
      secret: SECRET,
      now: () => issuedAt + CUSTOM_PIN_PLACEMENT_MAX_AGE_MS + 1,
      geocode,
    });
    assert.equal(expired.ok, true);
    const future = await placeCustomPinBeforeCharge({
      rawPin: { type: "neighborhood", name: "Gion", placement },
      userId: "user-1",
      tripId: "trip-1",
      secret: SECRET,
      now: () => issuedAt - 1,
      geocode,
    });
    assert.equal(future.ok, true);
    const missing = await placeCustomPinBeforeCharge({
      rawPin: { type: "neighborhood", name: "Gion", lat: 35, lng: 135 },
      userId: "user-1",
      tripId: "trip-1",
      secret: SECRET,
      now: () => issuedAt,
      geocode,
    });
    assert.equal(missing.ok, true);
    assert.equal(calls, 5, "tampered lat, tampered name, expired, future, and missing sig each re-geocode");
  });

  it("geocodes a name-only pin, and a second call geocodes again unless it echoes the signature", async () => {
    let calls = 0;
    const geocode = async () => {
      calls += 1;
      return placed;
    };
    const first: { type: "hotel"; name: string; lat?: number; lng?: number; placement?: unknown } = { type: "hotel", name: "  Gion  " };
    const a = await placeCustomPinBeforeCharge({ rawPin: first, userId: "user-1", tripId: "trip-1", secret: SECRET, geocode });
    assert.equal(calls, 1);
    assert.equal(first.lat, placed.chosen.lat);
    assert.equal(a.ok && a.resolved && a.resolved.formattedAddress, "Gion, Kyoto");
    assert.equal(a.ok && a.placement && a.placement.source, "google_geocode");

    const echoed = await placeCustomPinBeforeCharge({
      rawPin: { type: "hotel", name: "Gion", placement: a.ok ? a.placement : null },
      userId: "user-2",
      tripId: "trip-9",
      secret: SECRET,
      geocode,
    });
    assert.equal(calls, 1, "a verified signature does not call Google on another instance");
    assert.equal(echoed.ok && echoed.resolved && echoed.resolved.lat, placed.chosen.lat);

    const again: { type: "hotel"; name: string } = { type: "hotel", name: "gion" };
    const b = await placeCustomPinBeforeCharge({ rawPin: again, userId: "user-1", tripId: "trip-1", secret: SECRET, geocode });
    assert.equal(calls, 2);
    assert.equal(b.ok && b.resolved && b.resolved.name, "gion");
  });

  it("a thrown geocode is provider_error", async () => {
    const thrown = await placeCustomPinBeforeCharge({
      rawPin: { type: "hotel", name: "Boom" },
      userId: "user-1",
      tripId: "trip-1",
      secret: SECRET,
      geocode: async () => {
        throw new Error("provider down");
      },
    });
    assert.equal(thrown.ok, false);
    if (!thrown.ok) assert.equal(thrown.body.reason, "provider_error");
  });

  it("returns 400 pinned_anchor_not_found for a catalog id miss and does not geocode or keep lat/lng", async () => {
    let calls = 0;
    const geocode = async () => {
      calls += 1;
      return placed;
    };
    const placement = signCustomPinPlacement({
      name: "Gion",
      lat: 35.0037,
      lng: 135.7788,
      now: Date.parse("2026-10-25T12:00:00.000Z"),
      secret: SECRET,
    });
    const cases: Array<{ type: "hotel" | "neighborhood" | "activity"; id: string }> = [
      { type: "hotel", id: "missing-hotel" },
      { type: "neighborhood", id: "missing-hood" },
      { type: "activity", id: "missing-stop" },
    ];
    for (const pin of cases) {
      const raw: { type: typeof pin.type; id: string; name: string; lat?: number; lng?: number; placement: typeof placement } = {
        ...pin,
        name: "Gion",
        lat: 35,
        lng: 135,
        placement,
      };
      const out = await placeCustomPinBeforeCharge({
        rawPin: raw,
        userId: "user-1",
        tripId: "trip-1",
        secret: SECRET,
        activityStops: [{ id: "other-stop", name: "Other", lat: 35, lng: 135 }],
        catalogPinExists: async () => false,
        geocode,
      });
      assert.equal(out.ok, false);
      if (!out.ok) {
        assert.equal(out.status, 400);
        assert.deepEqual(out.body, { error: "pinned_anchor_not_found" });
      }
      assert.equal("lat" in raw, false);
      assert.equal("lng" in raw, false);
    }
    assert.equal(calls, 0);

    let lookedUp = false;
    const customRaw: { type: "neighborhood"; id: string; name: string; lat?: number; lng?: number } = {
      type: "neighborhood",
      id: "custom:Gion",
      name: "Gion",
      lat: 1,
      lng: 2,
    };
    const customOut = await placeCustomPinBeforeCharge({
      rawPin: customRaw,
      userId: "user-1",
      tripId: "trip-1",
      secret: SECRET,
      catalogPinExists: async () => {
        lookedUp = true;
        return false;
      },
      geocode,
    });
    assert.equal(lookedUp, false, "a custom: id stays on the geocode path");
    assert.equal(calls, 1);
    assert.equal(customOut.ok, true);
    if (customOut.ok && customOut.resolved) assert.equal(customOut.resolved.lat, placed.chosen.lat);

    const foundStops = [{ id: "s1", name: "Gion tea", lat: 35.0037, lng: 135.7788 }];
    let sawStop = false;
    const found = await placeCustomPinBeforeCharge({
      rawPin: { type: "activity", id: "s1", name: "Client label", lat: 9, lng: 9 },
      userId: "user-1",
      tripId: "trip-1",
      activityStops: foundStops,
      catalogPinExists: async (_pin, stops) => {
        sawStop = stops.some((stop) => stop.id === "s1" && stop.lat === 35.0037);
        return sawStop;
      },
      geocode,
    });
    assert.equal(sawStop, true);
    assert.equal(found.ok, true);
    if (found.ok) assert.equal(found.resolved, null);
    assert.equal(calls, 1, "a found catalog id does not geocode");
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
    assert.match(handler, /activityStops/);
    const placeSrc = fs.readFileSync(path.resolve(process.cwd(), "server/services/custom-pin-place.ts"), "utf8");
    assert.match(placeSrc, /PINNED_ANCHOR_NOT_FOUND/);
    assert.doesNotMatch(placeSrc, /from ["']\.\.\/db["']/);
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
