/**
 * seed-demand-fidelity-fixture.ts
 *
 * Seeds the MINIMAL Kyoto Partner-Demand fixture that the fidelity pixel gate
 * needs so /provider/market-research renders a populated hero — the "$240 …
 * early signal" enumerable own-book slip cell (R29) — instead of the honest
 * empty state. The gate is a VISUAL review instrument (baseline-freezing OFF);
 * this fixture exists only to give the screenshots real chrome to photograph
 * (Fraunces headline, gold-wash hero band, ±90 scrubber, window row links).
 *
 * It writes exactly two things, both owned by the CI provider
 * (ci-provider@traveloure.test) so the authenticated read path resolves them:
 *   1. one provider_services row with city='Kyoto' — this is how
 *      readPartnerDemandRollup() derives the partner's market (=[kyoto]);
 *   2. one partner_demand_rollup market-level cell — metric unmet_demand_slip,
 *      value {amount:240, count:3, valuedCount:3}, source_row_count=3. At the
 *      own-book ENUMERABLE floor of 3 (R29) this clears as ok+lowN, so the hero
 *      resolves slip-first to "$240 … early signal".
 *
 * NOT the real compute path (server/services/demand-rollup.*) — that derives
 * from real trips, of which CI has none for Kyoto. This is a display fixture,
 * deliberately labelled as such, run AFTER the server is ready so any startup
 * rollup job (which computes zero Kyoto rows and therefore deletes nothing on
 * these keys) has already run.
 *
 * Idempotent: deletes its own prior fixture rows before inserting. Run:
 *   npx tsx scripts/seed-demand-fidelity-fixture.ts
 */

import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PROVIDER_EMAIL = 'ci-provider@traveloure.test';
const FIXTURE_SERVICE_NAME = 'Kyoto Demand Fidelity Fixture';
const MARKET_SLUG = 'kyoto';

/** today + 2 days, UTC, as YYYY-MM-DD — safely in the future of Kyoto-local
 *  "today" (Asia/Tokyo is ahead of UTC) so classifyKind() files it as
 *  `requested`, and comfortably inside the ±90-day read window. */
function requestedDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

async function main() {
  // 1. Resolve the CI provider's user id (seeded by seed-ci-test-users.ts).
  const userRow = (
    await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [PROVIDER_EMAIL],
    )
  ).rows[0];
  if (!userRow) {
    throw new Error(
      `[seed-demand-fidelity] ${PROVIDER_EMAIL} not found — run seed-ci-test-users.ts first`,
    );
  }
  const userId = userRow.id;

  // 2. Ensure a Kyoto provider_services row exists for this provider so the
  //    read path derives markets=[kyoto]. Idempotent by (user_id, service_name).
  const existingSvc = (
    await pool.query<{ id: string }>(
      `SELECT id FROM provider_services WHERE user_id = $1 AND service_name = $2 LIMIT 1`,
      [userId, FIXTURE_SERVICE_NAME],
    )
  ).rows[0];
  if (!existingSvc) {
    await pool.query(
      `INSERT INTO provider_services (id, user_id, service_name, city, status)
       VALUES ($1, $2, $3, 'Kyoto', 'active')`,
      [crypto.randomUUID(), userId, FIXTURE_SERVICE_NAME],
    );
    console.log('[seed-demand-fidelity] inserted Kyoto provider_services row');
  } else {
    console.log('[seed-demand-fidelity] Kyoto provider_services row already present');
  }

  // 3. Replace-by-key the market-level slip cell (partner_id / service_id NULL).
  const date = requestedDate();
  await pool.query(
    `DELETE FROM partner_demand_rollup
     WHERE market_slug = $1 AND metric = 'unmet_demand_slip'
       AND partner_id IS NULL AND service_id IS NULL AND date = $2`,
    [MARKET_SLUG, date],
  );
  await pool.query(
    `INSERT INTO partner_demand_rollup
       (id, market_slug, date, metric, partner_id, service_id, value, source_row_count)
     VALUES ($1, $2, $3, 'unmet_demand_slip', NULL, NULL, $4::jsonb, 3)`,
    [
      crypto.randomUUID(),
      MARKET_SLUG,
      date,
      JSON.stringify({ amount: 240, count: 3, valuedCount: 3 }),
    ],
  );
  console.log(
    `[seed-demand-fidelity] inserted unmet_demand_slip cell $240/n=3 for ${MARKET_SLUG} on ${date}`,
  );
}

main()
  .then(() => pool.end())
  .then(() => {
    console.log('[seed-demand-fidelity] done ✅');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[seed-demand-fidelity] FAILED:', err);
    process.exit(1);
  });
