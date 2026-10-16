/**
 * CP-2 (ledger `2026-10-16-cp2-public-copy`): `GET /api/fee-policies/keep-rates` states the rates
 * the fee resolver applies today, read through the resolver's own functions.
 *   E1 the expert rate IS `getExpertSplitRates().platformFeeRate`.
 *   E2 under `beta_flat` (or no policy) the provider rate IS the active `beta_flat` band.
 *   E3 under `tiered` there is no single provider rate, so it is null (§13).
 *   E4 (LW-1g, ledger `2026-10-16-lw1g-earn-calculator`) the Ready-Made rate IS
 *      `resolveReadyMadeTakeRate()`, and it follows the `ready_made_trip` band when an admin edits it.
 * The policy row and the band are restored in after(); nothing else is written.
 *
 * Run solo: npx tsx --test server/__tests__/earn-keep-rates.db.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { resolvePublicKeepRates } from "../services/earn-keep-rates.service";
import { getExpertSplitRates } from "../services/commission";
import { BETA_FLAT_BAND, readBand } from "../services/fee-resolution.service";
import { resolveReadyMadeTakeRate } from "../services/ready-made-purchase.service";

const KEY = "active_provider_commission_policy";
let saved: { exists: boolean; value: unknown } | null = null;

async function readPolicyRow() {
  const r: any = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${KEY} LIMIT 1`);
  const row = r.rows?.[0];
  return { exists: !!row, value: row?.setting_value ?? null };
}
async function setPolicy(value: string) {
  if (!saved) saved = await readPolicyRow();
  const updated: any = await db.execute(sql`UPDATE platform_settings SET setting_value = ${value} WHERE setting_key = ${KEY} RETURNING setting_key`);
  if ((updated.rows ?? []).length === 0) {
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${KEY}, ${value})`);
  }
}

let savedReadyMadeRate: string | null | undefined;
after(async () => {
  if (savedReadyMadeRate !== undefined) {
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${savedReadyMadeRate} WHERE band_key = 'ready_made_trip'`);
  }
  if (!saved) return;
  if (saved.exists) {
    await db.execute(sql`UPDATE platform_settings SET setting_value = ${saved.value as any} WHERE setting_key = ${KEY}`);
  } else {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${KEY}`);
  }
});

test("E1: the expert rate is the resolver's expert split", async () => {
  const rates = await resolvePublicKeepRates();
  assert.equal(rates.expertPlatformRate, (await getExpertSplitRates()).platformFeeRate);
});

test("E2: under beta_flat the provider rate is the beta_flat band", async () => {
  await setPolicy("beta_flat");
  const band = await readBand(BETA_FLAT_BAND);
  const rates = await resolvePublicKeepRates();
  assert.equal(rates.providerPlatformRate, band && band.rateType === "percent" ? band.rate : null);
});

test("E3: under tiered there is no single provider rate", async () => {
  await setPolicy("tiered");
  assert.equal((await resolvePublicKeepRates()).providerPlatformRate, null);
});

test("E4: the Ready-Made rate is the purchase path's own rate, and follows the band", async () => {
  assert.equal((await resolvePublicKeepRates()).readyMadePlatformRate, await resolveReadyMadeTakeRate());
  const r: any = await db.execute(sql`SELECT default_rate::text AS rate FROM fee_bands WHERE band_key = 'ready_made_trip' AND is_active = true LIMIT 1`);
  if (!r.rows?.[0]) return; // no active band here: the fallback is what E4's first line already pinned
  savedReadyMadeRate = r.rows[0].rate;
  const edited = Number(savedReadyMadeRate) === 0.15 ? "0.2" : "0.15"; // fee-literal-ok: a test edit of the band, then restored
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${edited} WHERE band_key = 'ready_made_trip'`);
  assert.equal((await resolvePublicKeepRates()).readyMadePlatformRate, Number(edited));
});
