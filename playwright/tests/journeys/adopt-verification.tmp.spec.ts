import { test, expect, request as pwRequest } from "@playwright/test";
import {
  BASE_URL,
  registerUser,
  createTrip,
  createItem,
  confirmPaymentIntentTestMode,
  hasStripeTestKey,
  rows,
  scalar,
  closePool,
} from "./_journey-helpers";

test.setTimeout(360_000);

async function pay(ctx: any, tripId: string): Promise<string | undefined> {
  const payment = await ctx.post(`${BASE_URL}/api/optimization-payments`, { data: { tripId } });
  expect(payment.status(), await payment.text()).toBe(200);
  const body = await payment.json();
  if (body.freeRerun) {
    expect(body.feeCents).toBe(0);
    return undefined;
  }
  expect(body.paymentIntentId).toBeTruthy();
  expect(await confirmPaymentIntentTestMode(body.paymentIntentId)).toBe("succeeded");
  return body.paymentIntentId;
}

async function waitForVariants(comparisonId: string) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const variants = await rows<any>(
      `SELECT id, source, anchor_type, anchor_name, anchor_lat, anchor_lng, anchor_median_meters
       FROM itinerary_variants WHERE comparison_id=$1 ORDER BY sort_order`,
      [comparisonId],
    );
    const status = await scalar<string>(
      `SELECT status FROM itinerary_comparisons WHERE id=$1`,
      [comparisonId],
    );
    if (status !== "generating" && variants.length > 0) return { status, variants };
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(`timed out waiting for ${comparisonId}`);
}

async function runCase(
  ctx: any,
  label: string,
  tripId: string,
  pin?: Record<string, unknown>,
) {
  const paymentIntentId = await pay(ctx, tripId);
  const trip = await rows<any>(
    `SELECT to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date
     FROM trips WHERE id=$1`,
    [tripId],
  );
  const comparisonRes = await ctx.post(`${BASE_URL}/api/itinerary-comparisons`, {
    data: {
      tripId,
      title: `Adopt verification ${label}`,
      destination: "Kyoto, Japan",
      startDate: trip[0].start_date,
      endDate: trip[0].end_date,
    },
  });
  expect(comparisonRes.status(), await comparisonRes.text()).toBe(201);
  const comparisonId = (await comparisonRes.json()).id;

  const generateRes = await ctx.post(
    `${BASE_URL}/api/itinerary-comparisons/${comparisonId}/generate`,
    { data: { ...(paymentIntentId ? { optimizationPaymentId: paymentIntentId } : {}), ...(pin ? { pinnedAnchor: pin } : {}) } },
  );
  expect(generateRes.status(), `${label}: ${await generateRes.text()}`).toBe(200);
  const result = await waitForVariants(comparisonId);
  console.log(JSON.stringify({ label, comparisonId, status: result.status, variants: result.variants }, null, 2));
  return result;
}

test("Adopt optimization B2-B4 live contract", async () => {
  test.skip(!hasStripeTestKey(), "Stripe test key unavailable");
  const ctx = await pwRequest.newContext();
  const owner = await registerUser(ctx, "adopt-verification");
  const tripId = await createTrip(ctx, "Adopt verification trip");
  await createItem(ctx, tripId, "Kiyomizu-dera", 1, {
    latitude: "34.9949",
    longitude: "135.7850",
    estimatedCost: "20",
  });

  const candidatesRes = await ctx.get(
    `${BASE_URL}/api/itinerary-comparisons/nonexistent/anchor-candidates`,
  );
  expect([401, 404]).toContain(candidatesRes.status());

  const candidateComparisonRes = await ctx.post(`${BASE_URL}/api/itinerary-comparisons`, {
    data: {
      tripId,
      title: "Candidate read",
      destination: "Kyoto, Japan",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
    },
  });
  expect(candidateComparisonRes.status()).toBe(201);
  const candidateComparisonId = (await candidateComparisonRes.json()).id;
  const candidates = await ctx.get(
    `${BASE_URL}/api/itinerary-comparisons/${candidateComparisonId}/anchor-candidates`,
  );
  expect(candidates.status()).toBe(200);
  const candidateBody = await candidates.json();
  expect(candidateBody.hotel.length).toBeGreaterThanOrEqual(2);
  expect(candidateBody.neighborhood.length).toBeGreaterThan(0);
  expect(candidateBody.activity.length).toBeGreaterThan(0);
  console.log("B1", JSON.stringify({
    hotel: candidateBody.hotel.slice(0, 2),
    neighborhood: candidateBody.neighborhood[0],
    activity: candidateBody.activity[0],
  }, null, 2));

  const hotel = candidateBody.hotel[0];
  const hotelResult = await runCase(ctx, "B2 pinned hotel", tripId, {
    type: "hotel",
    id: hotel.anchorId,
    name: hotel.name,
    lat: 0,
    lng: 0,
  });
  expect(hotelResult.variants.length).toBeGreaterThanOrEqual(1);
  for (const variant of hotelResult.variants) {
    if (variant.source === "ai_optimized") {
      expect(variant.anchor_type).toBe("hotel");
      expect(variant.anchor_name).toBe(hotel.name);
      expect(Number(variant.anchor_lat)).toBeCloseTo(Number(hotel.lat), 4);
      expect(Number(variant.anchor_lng)).toBeCloseTo(Number(hotel.lng), 4);
      expect(variant.anchor_median_meters).not.toBeNull();
    }
  }

  const customTripId = await createTrip(ctx, "Adopt verification custom trip");
  await createItem(ctx, customTripId, "Kiyomizu-dera custom", 1, {
    latitude: "34.9949",
    longitude: "135.7850",
    estimatedCost: "20",
  });
  const customResult = await runCase(ctx, "B3 custom neighborhood", customTripId, {
    type: "neighborhood",
    name: "Custom Higashiyama pin",
    lat: 35.0037,
    lng: 135.7788,
  });
  for (const variant of customResult.variants) {
    if (variant.source === "ai_optimized") {
      expect(variant.anchor_type).toBe("neighborhood");
      expect(variant.anchor_name).toBe("Custom Higashiyama pin");
      expect(Number(variant.anchor_lat)).toBeCloseTo(35.0037, 4);
      expect(Number(variant.anchor_lng)).toBeCloseTo(135.7788, 4);
      expect(variant.anchor_median_meters).not.toBeNull();
    }
  }

  const autoTripId = await createTrip(ctx, "Adopt verification auto trip");
  await createItem(ctx, autoTripId, "Kiyomizu-dera auto", 1, {
    latitude: "34.9949",
    longitude: "135.7850",
    estimatedCost: "20",
  });
  const autoResult = await runCase(ctx, "B4 auto", autoTripId);
  console.log("B4 variant count", autoResult.variants.length);
  await ctx.dispose();
  await closePool();
});