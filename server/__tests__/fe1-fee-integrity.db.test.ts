/**
 * FE-1 FEE INTEGRITY (ledger `2026-10-12-fe1-fee-integrity`).
 *
 * (a) The per-earner override is now stated as the PLATFORM FEE (`users.commission_override_platform_fee_percent`,
 *     migration 375). Both resolvers — `resolveProviderRate` and `resolveCommissionRates` — prefer it; the
 *     deprecated `commission_override_expert_share_percent` stays readable:
 *       O1 both set → the platform-fee column wins;
 *       O2 old only → the old arithmetic, unchanged (earner share = old/100);
 *       O3 neither → the policy path, unchanged (no entity_override);
 *       O4 the pure rule's edges.
 * (b) The fee-band PATCH writes its `fee_band_update` audit row in the SAME transaction as the edit:
 *       B1 a successful edit records before/after for every PATCH-able field;
 *       B2 an audit write that fails rolls the edit back and the PATCH answers an error.
 *
 * NO RATE LITERALS from fee_bands: band expectations are read from the table. The override values are
 * test inputs, not platform rates.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ? process.env.STRIPE_SECRET_KEY
  : "sk_test_dummy";

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const { resolveProviderRate } = await import("../services/fee-resolution.service");
const { resolveCommissionRates } = await import("../services/commission");
const { resolveCommissionOverride } = await import("../services/commission-override");
const adminRouter = (await import("../routes/admin.routes")).default;

const SUFFIX = `fe1-${process.pid}`;
let categoryId: string;
let earnerId: string;
let adminId: string;
const BAND = "expert_review_flat";
let bandBefore: Record<string, unknown>;

async function setOverrides(platformFee: number | null, expertShare: number | null) {
  await db.execute(sql`
    UPDATE users SET commission_override_platform_fee_percent = ${platformFee},
                     commission_override_expert_share_percent = ${expertShare}
     WHERE id = ${earnerId}
  `);
}

before(async () => {
  const cat = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, commission_band_key)
    VALUES (gen_random_uuid()::text, ${"zz-" + SUFFIX}, ${"zz-" + SUFFIX}, 'moderate')
    RETURNING id
  `);
  categoryId = String((cat.rows[0] as any).id);
  const usr = await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${SUFFIX + "@traveloure.test"}, 'service_provider')
    RETURNING id
  `);
  earnerId = String((usr.rows[0] as any).id);
  const adm = await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${SUFFIX + "-admin@traveloure.test"}, 'admin')
    RETURNING id
  `);
  adminId = String((adm.rows[0] as any).id);
  const b = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS default_rate, CAST(min_rate AS FLOAT) AS min_rate,
           CAST(max_rate AS FLOAT) AS max_rate, CAST(max_amount AS FLOAT) AS max_amount,
           display_name, description, is_active
      FROM fee_bands WHERE band_key = ${BAND}
  `);
  assert.ok(b.rows?.length, `${BAND} must be seeded (migration 137)`);
  bandBefore = b.rows[0] as Record<string, unknown>;
});

after(async () => {
  await db.execute(sql`
    UPDATE fee_bands SET default_rate = ${bandBefore.default_rate as number}, min_rate = ${bandBefore.min_rate as number | null},
           max_rate = ${bandBefore.max_rate as number | null}, max_amount = ${bandBefore.max_amount as number | null},
           display_name = ${bandBefore.display_name as string | null}, description = ${bandBefore.description as string | null},
           is_active = ${bandBefore.is_active as boolean}
     WHERE band_key = ${BAND}
  `);
  await db.execute(sql`DELETE FROM access_audit_logs WHERE actor_id = ${adminId}`);
  await db.execute(sql`DELETE FROM service_categories WHERE id = ${categoryId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${earnerId}, ${adminId})`);
  await pool.end();
});

// ── (a) the override ─────────────────────────────────────────────────────────────────────────

test("O1: both columns set — the platform-fee override wins in both resolvers", async () => {
  await setOverrides(12, 60);
  try {
    const provider = await resolveProviderRate({ categoryId, providerId: earnerId });
    assert.equal(provider.rateSource, "entity_override");
    assert.equal(provider.platformRate, 0.12);
    assert.equal(Number(provider.providerShareRate.toFixed(10)), 0.88);
    assert.equal(provider.bandId, null);

    const legacy = await resolveCommissionRates({ category: "activities", expertId: earnerId });
    assert.equal(legacy.platformFeeRate, 0.12);
    assert.equal(Number(legacy.expertShareRate.toFixed(10)), 0.88);
  } finally {
    await setOverrides(null, null);
  }
});

test("O2: only the deprecated expert-share column set — the old arithmetic is unchanged", async () => {
  await setOverrides(null, 80);
  try {
    const provider = await resolveProviderRate({ categoryId, providerId: earnerId });
    assert.equal(provider.rateSource, "entity_override");
    assert.equal(provider.providerShareRate, 0.8); // old: pct / 100
    assert.equal(Number(provider.platformRate.toFixed(10)), 0.2); // old: 1 - share

    const legacy = await resolveCommissionRates({ category: "activities", expertId: earnerId });
    assert.equal(legacy.expertShareRate, 0.8);
    assert.equal(Number(legacy.platformFeeRate.toFixed(10)), 0.2);
  } finally {
    await setOverrides(null, null);
  }
});

test("O3: neither set — the policy path is unchanged (no entity_override)", async () => {
  await setOverrides(null, null);
  const provider = await resolveProviderRate({ categoryId, providerId: earnerId });
  const noProvider = await resolveProviderRate({ categoryId });
  assert.notEqual(provider.rateSource, "entity_override");
  assert.deepEqual(provider, noProvider, "with no override the earner prices exactly as the policy does");

  const legacy = await resolveCommissionRates({ category: "activities", expertId: earnerId });
  const legacyNoExpert = await resolveCommissionRates({ category: "activities" });
  assert.deepEqual(legacy, legacyNoExpert);
});

test("O4: the one rule — precedence, range, and absence", () => {
  assert.deepEqual(resolveCommissionOverride({ platformFeePercent: "15.00", expertSharePercent: "70.00" }), {
    platformRate: 0.15, earnerShareRate: 0.85, source: "platform_fee_override",
  });
  const old = resolveCommissionOverride({ platformFeePercent: null, expertSharePercent: "70" });
  assert.equal(old?.source, "expert_share_override");
  assert.equal(old?.earnerShareRate, 0.7);
  // An out-of-range platform fee is not set; the old column then applies.
  assert.equal(resolveCommissionOverride({ platformFeePercent: 150, expertSharePercent: 70 })?.source, "expert_share_override");
  assert.equal(resolveCommissionOverride({ platformFeePercent: null, expertSharePercent: null }), null);
  assert.equal(resolveCommissionOverride(null), null);
  // Zero is a real override (a 0% platform fee), not an absence.
  assert.equal(resolveCommissionOverride({ platformFeePercent: 0 })?.platformRate, 0);
});

// ── (b) the fee-band PATCH and its audit row ───────────────────────────────────────────────────

function patchHandler() {
  const layer = (adminRouter as any).stack.find(
    (l: any) => l.route?.path === "/api/admin/fee-bands/:bandKey" && l.route?.methods?.patch,
  );
  assert.ok(layer, "the fee-band PATCH route is registered");
  return layer.route.stack.at(-1).handle;
}

function capture() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

function patchRequest(body: Record<string, unknown>) {
  return {
    params: { bandKey: BAND },
    body,
    user: { claims: { sub: adminId } },
    ip: "127.0.0.1",
    get: () => "fe1-test",
  };
}

async function auditRows() {
  const r = await db.execute(sql`
    SELECT metadata FROM access_audit_logs
     WHERE actor_id = ${adminId} AND action = 'fee_band_update' AND resource_id = ${BAND}
     ORDER BY created_at
  `);
  return (r.rows ?? []) as Array<{ metadata: any }>;
}

test("B1: a band edit commits with ONE audit row carrying before/after for every PATCH-able field", async () => {
  const handler = patchHandler();
  const nextRate = Number(bandBefore.default_rate) + 1;
  const res = capture();
  await handler(patchRequest({
    defaultRate: nextRate,
    displayName: "FE-1 display",
    description: "FE-1 description",
    confirm: true,
  }) as any, res as any);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));

  const rows = await auditRows();
  assert.equal(rows.length, 1);
  const { before, after } = rows[0].metadata;
  for (const field of ["default_rate", "min_rate", "max_rate", "max_amount", "display_name", "description", "is_active"]) {
    assert.ok(field in before, `before carries ${field}`);
    assert.ok(field in after, `after carries ${field}`);
  }
  assert.equal(before.default_rate, bandBefore.default_rate);
  assert.equal(after.default_rate, nextRate);
  assert.equal(before.display_name, bandBefore.display_name);
  assert.equal(after.display_name, "FE-1 display");
  assert.equal(after.description, "FE-1 description");
  assert.equal(after.min_rate, bandBefore.min_rate);
  assert.equal(after.max_rate, bandBefore.max_rate);
});

test("B2: when the audit row cannot be written, the edit rolls back and the PATCH answers an error", async () => {
  const handler = patchHandler();
  const current = await db.execute(sql`SELECT CAST(default_rate AS FLOAT) AS r, display_name FROM fee_bands WHERE band_key = ${BAND}`);
  const rateBefore = (current.rows[0] as any).r as number;
  const nameBefore = (current.rows[0] as any).display_name as string | null;
  const auditBefore = (await auditRows()).length;

  await db.execute(sql.raw(`
    CREATE OR REPLACE FUNCTION fe1_reject_fee_band_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.action = 'fee_band_update' AND NEW.resource_id = '${BAND}' THEN
        RAISE EXCEPTION 'simulated audit write failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER fe1_reject_fee_band_audit BEFORE INSERT ON access_audit_logs
      FOR EACH ROW EXECUTE FUNCTION fe1_reject_fee_band_audit();
  `));
  try {
    const res = capture();
    await handler(patchRequest({ defaultRate: rateBefore + 2, displayName: "must not land", confirm: true }) as any, res as any);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.code, "fee_band_audit_failed");
  } finally {
    await db.execute(sql.raw(`
      DROP TRIGGER IF EXISTS fe1_reject_fee_band_audit ON access_audit_logs;
      DROP FUNCTION IF EXISTS fe1_reject_fee_band_audit();
    `));
  }
  const after = await db.execute(sql`SELECT CAST(default_rate AS FLOAT) AS r, display_name FROM fee_bands WHERE band_key = ${BAND}`);
  assert.equal((after.rows[0] as any).r, rateBefore, "the rate edit was rolled back");
  assert.equal((after.rows[0] as any).display_name, nameBefore, "the display-name edit was rolled back");
  assert.equal((await auditRows()).length, auditBefore, "no audit row was written");
});
