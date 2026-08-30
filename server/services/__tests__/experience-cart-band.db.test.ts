/**
 * Ruling 25 / migration 174 — experience_cart_checkout band integration proof.
 *
 * SCOPE (explicit, per the R3/F6 note in payments.routes.ts): the actual cart
 * CHARGE and fee-preview paths resolve per-item rates via resolveCommissionRates()
 * — the old 0.30 literal "matched no actual rate" and was display/diagnostic only.
 * This band therefore controls the typed EXPERIENCE_CART breakdown surface
 * (calculateCommission via requireExperienceCartRate), NOT per-item checkout math.
 *
 * Proves against the live dev DB:
 *   1. requireExperienceCartRate() returns the seeded band value (0.30 default).
 *   2. An admin edit to the band changes the calculateCommission breakdown.
 *   3. Deactivating (or missing) the band fails LOUDLY — no silent fallback.
 * All mutations are restored in finally blocks.
 *
 * Run with: npx tsx --test server/services/__tests__/experience-cart-band.db.test.ts
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { requireExperienceCartRate, EXPERIENCE_CART_BAND_KEY } from "../commission";
import { calculateCommission, BookingType } from "../../utils/commissionCalculator";

async function readBand(): Promise<{ rate: number; active: boolean }> {
  const r = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS rate, is_active
    FROM fee_bands WHERE band_key = ${EXPERIENCE_CART_BAND_KEY} LIMIT 1
  `);
  const row = r.rows?.[0] as any;
  assert.ok(row, "experience_cart_checkout band must be seeded (migration 174)");
  return { rate: Number(row.rate), active: !!row.is_active };
}

describe("experience_cart_checkout band (migration 174)", () => {
  it("requireExperienceCartRate returns the seeded band value and drives the breakdown", async () => {
    const band = await readBand();
    const rate = await requireExperienceCartRate();
    assert.equal(rate, band.rate);

    const result = calculateCommission(100, BookingType.EXPERIENCE_CART, { experienceCartRate: rate });
    assert.equal(result.commissionRate, rate);
    assert.equal(result.platformFee, Math.round(100 * rate * 100) / 100);
  });

  it("an admin edit to the band changes the resolved rate and breakdown", async () => {
    const original = await readBand();
    const edited = Math.round((original.rate + 0.05) * 100) / 100;
    try {
      await db.execute(sql`
        UPDATE fee_bands SET default_rate = ${edited}
        WHERE band_key = ${EXPERIENCE_CART_BAND_KEY}
      `);
      const rate = await requireExperienceCartRate();
      assert.equal(rate, edited);
      const result = calculateCommission(200, BookingType.EXPERIENCE_CART, { experienceCartRate: rate });
      assert.equal(result.platformFee, Math.round(200 * edited * 100) / 100);
    } finally {
      await db.execute(sql`
        UPDATE fee_bands SET default_rate = ${original.rate}
        WHERE band_key = ${EXPERIENCE_CART_BAND_KEY}
      `);
    }
  });

  it("deactivated/missing band fails loudly (no silent fallback)", async () => {
    try {
      await db.execute(sql`
        UPDATE fee_bands SET is_active = false
        WHERE band_key = ${EXPERIENCE_CART_BAND_KEY}
      `);
      await assert.rejects(
        () => requireExperienceCartRate(),
        /Experience cart fee band not configured/,
      );
    } finally {
      await db.execute(sql`
        UPDATE fee_bands SET is_active = true
        WHERE band_key = ${EXPERIENCE_CART_BAND_KEY}
      `);
    }
  });

  it("calculateCommission throws when no DB-derived rate is passed", () => {
    assert.throws(
      () => calculateCommission(100, BookingType.EXPERIENCE_CART),
      /requires options\.experienceCartRate/,
    );
  });

  after(async () => {
    // Sanity: band restored to an active state.
    const band = await readBand();
    assert.ok(band.active);
  });
});
