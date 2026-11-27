/**
 * WL-1 read-only check: waitlist rows whose own consent_at is set but that have no
 * consent_records row. This does not backfill anything. Run with DATABASE_URL:
 *   npx tsx scripts/wl1-consent-gap-count.ts
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";

const r = await db.execute(sql`
  SELECT count(*)::int AS count
  FROM launch_waitlist w
  WHERE w.consent_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM consent_records c WHERE c.waitlist_id = w.id)
`);
console.log(`[wl1-consent-gap] missing_consent_records=${(r.rows[0] as any)?.count ?? 0}`);
await pool.end();
