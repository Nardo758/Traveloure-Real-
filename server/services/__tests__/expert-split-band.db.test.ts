/**
 * Ruling 25 — expert_standard band drives the fallback expert/platform split.
 *
 * Proves against the live dev DB that an admin edit to the fee_bands
 * expert_standard row actually changes the fallback rates served by
 * getExpertSplitRates() and its consumers (within the 60s cache TTL, or
 * immediately after clearExpertSplitCache()):
 *   1. getExpertSplitRates() mirrors the seeded band (platform-take fraction).
 *   2. An admin edit + clearExpertSplitCache() flows through getExpertSplitRates()
 *      AND a consumer: resolveReadyMadeTakeRate() (the ready-made purchase route's
 *      fallback when the ready_made_trip band is inactive/missing).
 *   3. The in-process cache serves the old value until cleared/expired — the
 *      mechanism that bounds staleness to <60s after an admin edit.
 *   4. Constants fallback (75/25) kicks in when the band is inactive/missing.
 * All mutations are restored in finally blocks.
 *
 * Run with: npx tsx --test server/services/__tests__/expert-split-band.db.test.ts
 */

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import {
  getExpertSplitRates,
  clearExpertSplitCache,
  EXPERT_SHARE_RATE,
  PLATFORM_FEE_RATE,
} from "../commission";
import { resolveReadyMadeTakeRate } from "../ready-made-purchase.service";

const BAND_KEY = "expert_standard";

async function readBand(key: string): Promise<{ rate: number; active: boolean } | null> {
  const r = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS rate, is_active
    FROM fee_bands WHERE band_key = ${key} LIMIT 1
  `);
  const row = r.rows?.[0] as any;
  if (!row) return null;
  return { rate: Number(row.rate), active: !!row.is_active };
}

async function setBandRate(key: string, rate: number) {
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${rate} WHERE band_key = ${key}`);
}

async function setBandActive(key: string, active: boolean) {
  await db.execute(sql`UPDATE fee_bands SET is_active = ${active} WHERE band_key = ${key}`);
}

describe("expert_standard band → getExpertSplitRates (ruling 25)", () => {
  beforeEach(() => clearExpertSplitCache());

  it("mirrors the seeded band: platform take = band rate, expert share = 1 - rate", async () => {
    const band = await readBand(BAND_KEY);
    assert.ok(band, "expert_standard band must be seeded (migrations 033/174)");
    assert.ok(band!.active, "expert_standard band must be active");

    const rates = await getExpertSplitRates();
    assert.equal(rates.platformFeeRate, band!.rate);
    assert.equal(rates.expertShareRate, 1 - band!.rate);
  });

  it("an admin edit + clearExpertSplitCache() flows through getExpertSplitRates and resolveReadyMadeTakeRate", async () => {
    const original = (await readBand(BAND_KEY))!;
    const readyMade = await readBand("ready_made_trip");
    // Pick an edited rate that is valid (0 < r < 1) and different from the original.
    const edited = original.rate <= 0.5 ? original.rate + 0.1 : original.rate - 0.1;
    try {
      await setBandRate(BAND_KEY, edited);
      clearExpertSplitCache();

      const rates = await getExpertSplitRates();
      assert.equal(rates.platformFeeRate, edited);
      assert.equal(rates.expertShareRate, Math.round((1 - edited) * 1e10) / 1e10);

      // Consumer proof: with the ready_made_trip band deactivated,
      // resolveReadyMadeTakeRate falls back to the expert_standard split —
      // and must serve the freshly edited value (cache already cleared above).
      if (readyMade) await setBandActive("ready_made_trip", false);
      const takeRate = await resolveReadyMadeTakeRate();
      assert.equal(takeRate, edited);
    } finally {
      await setBandRate(BAND_KEY, original.rate);
      if (readyMade) await setBandActive("ready_made_trip", readyMade.active);
      clearExpertSplitCache();
    }
  });

  it("cache bounds staleness: serves old value until cleared, fresh value after", async () => {
    const original = (await readBand(BAND_KEY))!;
    const edited = original.rate <= 0.5 ? original.rate + 0.1 : original.rate - 0.1;
    try {
      const before = await getExpertSplitRates(); // primes the cache
      await setBandRate(BAND_KEY, edited);

      // Without a clear (and within the 60s TTL) the cached split is served.
      const cached = await getExpertSplitRates();
      assert.equal(cached.platformFeeRate, before.platformFeeRate);

      // After clearing (equivalent to TTL expiry), the edit is live.
      clearExpertSplitCache();
      const fresh = await getExpertSplitRates();
      assert.equal(fresh.platformFeeRate, edited);
    } finally {
      await setBandRate(BAND_KEY, original.rate);
      clearExpertSplitCache();
    }
  });

  it("constants fallback (75/25) kicks in when the band is inactive", async () => {
    const original = (await readBand(BAND_KEY))!;
    try {
      await setBandActive(BAND_KEY, false);
      clearExpertSplitCache();

      const rates = await getExpertSplitRates();
      assert.equal(rates.expertShareRate, EXPERT_SHARE_RATE);
      assert.equal(rates.platformFeeRate, PLATFORM_FEE_RATE);
    } finally {
      await setBandActive(BAND_KEY, original.active);
      clearExpertSplitCache();
    }
  });

  it("constants fallback kicks in when the band rate is out of the splittable range", async () => {
    const original = (await readBand(BAND_KEY))!;
    try {
      // rate=1 is not a valid platform-take fraction for a split (guard: 0 < rate < 1)
      await setBandRate(BAND_KEY, 1);
      clearExpertSplitCache();

      const rates = await getExpertSplitRates();
      assert.equal(rates.expertShareRate, EXPERT_SHARE_RATE);
      assert.equal(rates.platformFeeRate, PLATFORM_FEE_RATE);
    } finally {
      await setBandRate(BAND_KEY, original.rate);
      clearExpertSplitCache();
    }
  });

  after(async () => {
    // Sanity: band restored to its active, seeded state.
    const band = await readBand(BAND_KEY);
    assert.ok(band?.active, "expert_standard band must be restored active");
    clearExpertSplitCache();
  });
});
