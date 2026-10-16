/**
 * CP-2 (ledger `2026-10-16-cp2-public-copy`): `GET /api/fee-policies/keep-rates` states the rates
 * the fee resolver applies today, read through the resolver's own functions.
 *   E1 (amended by FE-2 ruling 6, ledger `2026-10-16-fe2-beta-cohort`): with no approval cohort the
 *      expert rate IS `getExpertSplitRates().platformFeeRate` and carries no cohort; with the approval
 *      cohort set, it is that cohort's band and carries the cohort label and notice days.
 *   E2 under `beta_flat` (or no policy) the provider rate IS the active `beta_flat` band.
 *   E3 under `tiered` there is no single provider rate, so it is null (§13).
 *   E4 (FE-2) past the cohort's end date the expert rate falls back to the ordinary split.
 * The policy row and the FE-2 settings are restored in after(); nothing else is written.
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

const KEY = "active_provider_commission_policy";
let saved: { exists: boolean; value: unknown } | null = null;
const fe2Saved = new Map<string, string | null>();

async function setFe2(key: string, value: string) {
  if (!fe2Saved.has(key)) {
    const r: any = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key} LIMIT 1`);
    fe2Saved.set(key, r.rows?.[0]?.setting_value ?? null);
  }
  await db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value) VALUES (${key}, ${value})
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value
  `);
}

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

after(async () => {
  for (const [key, value] of fe2Saved) {
    if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
    else await db.execute(sql`UPDATE platform_settings SET setting_value = ${value} WHERE setting_key = ${key}`);
  }
  if (!saved) return;
  if (saved.exists) {
    await db.execute(sql`UPDATE platform_settings SET setting_value = ${saved.value as any} WHERE setting_key = ${KEY}`);
  } else {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${KEY}`);
  }
});

test("E1: no approval cohort — the resolver's expert split, no cohort; with one — its band, label and notice", async () => {
  await setFe2("expert_approval_rate_cohort", "");
  const plain = await resolvePublicKeepRates();
  assert.equal(plain.expertPlatformRate, (await getExpertSplitRates()).platformFeeRate);
  assert.equal(plain.expertCohort, null);

  await setFe2("expert_approval_rate_cohort", "beta_2026");
  await setFe2("expert_beta_end_date", "");
  await setFe2("expert_rate_change_notice_days", "30");
  const band = await readBand("expert_beta_2026");
  assert.ok(band && band.rateType === "percent", "expert_beta_2026 is seeded (migration 382)");
  const cohort = await resolvePublicKeepRates();
  assert.equal(cohort.expertPlatformRate, band!.rate);
  assert.deepEqual(cohort.expertCohort, { label: "beta", noticeDays: 30 });
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

test("E4: past the cohort's end date the expert rate is the ordinary split again", async () => {
  await setFe2("expert_approval_rate_cohort", "beta_2026");
  await setFe2("expert_beta_end_date", "2020-01-01");
  const rates = await resolvePublicKeepRates();
  assert.equal(rates.expertPlatformRate, (await getExpertSplitRates()).platformFeeRate);
  assert.equal(rates.expertCohort, null);
});
