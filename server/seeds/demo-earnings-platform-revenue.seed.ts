/**
 * Demo-data backfill: platform_revenue counterparts for seeded expert earnings.
 *
 * The dev/demo DB contains 18 seeded expert_earnings rows (demo experts'
 * statements) inserted without the platform_revenue counterpart the production
 * mint path always creates. The statements page joins
 * expert_earnings.reference_id → platform_revenue.source_id and only surfaces
 * counterpart-backed activity, so those demo statements rendered empty.
 *
 * These demo rows have no authoritative source transactions (their
 * reference_ids point to nothing real), so counterpart money fields are
 * derived from the earning amount using the live 0.25 commission band
 * (expert keeps 75%) and PROCESSING_FEE_RATE — the same split the production
 * mint would produce for a USD booking at the standard band. Their
 * reference_type values already use canonical *_commission names, which map
 * directly onto platform_revenue.source_type.
 *
 * Safety:
 * - Scoped to an explicit allowlist of the 18 known demo earning IDs; never
 *   touches other earnings rows.
 * - Idempotent: skips any earning that already has a counterpart.
 * - DEV/STAGING ONLY: refuses to run when NODE_ENV === 'production' OR when
 *   DATABASE_URL matches PROD_DATABASE_URL (guards against a misconfigured
 *   environment). Not imported by server boot or migrations; run manually:
 *     npx tsx server/seeds/demo-earnings-platform-revenue.seed.ts
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { PROCESSING_FEE_RATE } from "../services/commission";

const EXPERT_SHARE = 0.75; // matches live 0.25 commission band

/** The 18 dev-seeded demo earnings rows missing counterparts (audited 2026-08-15). */
const DEMO_EARNING_IDS = [
  "12ce5f2e-5229-41a4-b0af-6e6fcb375fa6",
  "12bdb92b-16bf-40a1-82f9-87c4b2feb37e",
  "25ed4ef2-88ee-4814-8002-db697c5395d9",
  "fbec2233-c585-4d9f-8606-8ec3b0423edd",
  "fe49c1a4-559b-428b-a4ad-7dcad3578993",
  "2e720c1e-6ad5-4b8f-9035-f6c4b1a65521",
  "16611e84-6cf4-4117-a0ae-bf42bbd0a9ce",
  "089417b0-5836-40c8-89e8-cf5d16c31325",
  "7c9d4cb9-671b-4834-94c0-167ec15db367",
  "f84bd5e0-d9d8-4b15-a854-0f9d5993048c",
  "e716f983-06b1-400b-92a8-f41226961ae7",
  "b0514140-c9fe-4e99-b87e-f4f73d14d9eb",
  "0dff454e-2164-40a8-becc-f7649d0391f1",
  "1fa34786-b277-4012-a714-ae96ae895c3e",
  "dc79a27d-dad4-4e41-b77e-9733ba7d3fe6",
  "5324cdb6-6131-4348-9aed-d39dec460489",
  "71db737d-f98d-4dc3-9cf8-2cc578767595",
  "4242242b-8df3-4d6f-b114-64e0fbbc35e9",
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("demo-earnings-platform-revenue.seed.ts must never run in production");
  }
  if (
    process.env.PROD_DATABASE_URL &&
    process.env.DATABASE_URL === process.env.PROD_DATABASE_URL
  ) {
    throw new Error("DATABASE_URL points at the production database — refusing to run");
  }

  const result = await db.execute(sql`
    INSERT INTO platform_revenue (
      id, source_type, source_id, gross_amount, platform_fee, net_amount,
      processing_fees, currency, expert_id, expert_earnings,
      description, metadata, status, transaction_date, created_at
    )
    SELECT
      gen_random_uuid(),
      ee.reference_type,
      ee.reference_id,
      round(ee.amount / ${EXPERT_SHARE}, 2),
      round(ee.amount / ${EXPERT_SHARE} - ee.amount, 2),
      round((ee.amount / ${EXPERT_SHARE} - ee.amount) * ${1 - PROCESSING_FEE_RATE}, 2),
      round((ee.amount / ${EXPERT_SHARE} - ee.amount) * ${PROCESSING_FEE_RATE}, 2),
      'USD',
      ee.expert_id,
      ee.amount,
      ee.description,
      jsonb_build_object('seed', 'demo-earnings-platform-revenue'),
      'recorded',
      ee.created_at,
      ee.created_at
    FROM expert_earnings ee
    WHERE ee.id IN (${sql.join(DEMO_EARNING_IDS.map((id) => sql`${id}`), sql`, `)})
      AND ee.reference_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM platform_revenue pr WHERE pr.source_id = ee.reference_id
      )
    RETURNING id
  `);
  console.log(`Backfilled ${result.rows.length} platform_revenue counterpart(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
