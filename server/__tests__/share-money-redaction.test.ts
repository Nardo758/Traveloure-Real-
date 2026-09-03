/**
 * SHARE-LINK MONEY REDACTION — the predicate and the walk, proven with no DB and no server.
 *
 * The HTTP-surface proof lives in `share-link-price-redaction.http.test.ts` (bench-only: it needs
 * a running app + a disposable database). THIS file proves the half that can be proven anywhere,
 * which is the half that decides the leak: WHICH keys count as money, and that the walk reaches
 * every depth of the real response shape.
 *
 * Run solo: npx tsx --test server/__tests__/share-money-redaction.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMoneyKey,
  redactMoneyForNonOwner,
  NON_MONEY_KEYS,
} from "../utils/share-money-redaction";

// The four keys that actually leaked, plus the shapes a future field would take.
const MONEY_KEYS = [
  "cost",
  "totalCost",
  "totalCostUsd",
  "estimatedCostUsd",
  "price",
  "perPersonCost",
  "budget",
  "platformFee",
  "insuranceFee",
  "amount",
  "refundAmount",
  "depositAmount",
  "balanceAmount",
  "savings",
  "providerEarnings",
  "payoutTotal",
];

test("R1 — every money-shaped key is recognised", () => {
  for (const k of MONEY_KEYS) {
    assert.equal(isMoneyKey(k), true, `${k} must be treated as money`);
  }
});

test("R2 — the named non-money exceptions are NOT stripped", () => {
  for (const k of NON_MONEY_KEYS) {
    assert.equal(isMoneyKey(k), false, `${k} is an explicit exception and must survive`);
  }
  // The itinerary keys a share link exists to carry.
  for (const k of ["id", "name", "startTime", "lat", "lng", "category", "description", "location", "duration", "dayNumber", "optimizationScore", "distanceMeters", "recommendedMode"]) {
    assert.equal(isMoneyKey(k), false, `${k} is not money`);
  }
});

test("R3 — the real response shape loses money at EVERY depth and keeps everything else", () => {
  const payload = {
    variant: {
      id: "v1",
      name: "Kyoto",
      totalCost: "1240.50",
      optimizationScore: 87,
      dateRange: { start: "2026-10-01", end: "2026-10-04" },
      days: [
        {
          dayNumber: 1,
          date: "2026-10-01",
          activities: [{ id: "a1", name: "Fushimi Inari", cost: 42, lat: 34.96, category: "sight" }],
          transportLegs: [
            { id: "l1", legOrder: 1, estimatedCostUsd: 6.5, energyCost: 20, estimatedDurationMinutes: 18 },
          ],
        },
      ],
      transportSummary: { totalLegs: 3, totalMinutes: 54, totalCostUsd: 19.25 },
    },
    // A nested amount of the kind §14/§19 keep appearing in — proves the walk is generic.
    bookings: [{ id: "b1", trackingNumber: "TR-1", amount: 300, platformFee: 30 }],
    permissions: "view",
    isOwner: false,
  };

  const redacted = redactMoneyForNonOwner(payload) as any;

  // (a) NO money key survives, at any depth.
  const found: string[] = [];
  (function walk(v: unknown, path: string) {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (v === null || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (isMoneyKey(k)) found.push(`${path}.${k}`);
      walk(val, `${path}.${k}`);
    }
  })(redacted, "$");
  assert.deepEqual(found, [], `money keys survived redaction: ${found.join(", ")}`);

  // (b) ABSENT, not zeroed (§13) — the key is gone, so `in` is false.
  assert.equal("cost" in redacted.variant.days[0].activities[0], false);
  assert.equal("totalCost" in redacted.variant, false);
  assert.equal("totalCostUsd" in redacted.variant.transportSummary, false);
  assert.equal("estimatedCostUsd" in redacted.variant.days[0].transportLegs[0], false);
  assert.equal("amount" in redacted.bookings[0], false);

  // (c) The itinerary itself is untouched — a price-free plan is still a plan.
  assert.equal(redacted.variant.name, "Kyoto");
  assert.equal(redacted.variant.optimizationScore, 87);
  assert.equal(redacted.variant.days[0].activities[0].name, "Fushimi Inari");
  assert.equal(redacted.variant.days[0].activities[0].lat, 34.96);
  assert.equal(redacted.variant.transportSummary.totalLegs, 3);
  assert.equal(redacted.variant.transportSummary.totalMinutes, 54);
  assert.equal(redacted.variant.days[0].transportLegs[0].energyCost, 20, "energyCost is a fatigue score, not money");
  assert.equal(redacted.variant.days[0].transportLegs[0].estimatedDurationMinutes, 18);
  assert.equal(redacted.variant.dateRange.start, "2026-10-01");
  assert.equal(redacted.bookings[0].trackingNumber, "TR-1");

  // (d) The input is never mutated — the owner's copy is emitted from the same object.
  assert.equal(payload.variant.totalCost, "1240.50");
  assert.equal(payload.variant.days[0].activities[0].cost, 42);
});

test("R4 — a Date is a leaf, not an object to rebuild", () => {
  const d = new Date("2026-10-01T00:00:00Z");
  const out = redactMoneyForNonOwner({ when: d, cost: 5 }) as any;
  assert.equal(out.when, d);
  assert.equal("cost" in out, false);
});
