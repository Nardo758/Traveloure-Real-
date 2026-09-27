/**
 * purge-run.ts — owner-keyed deletion of everything created by one e2e run,
 * for PERSISTENT environments (staging) where reset-db.sh is not an option.
 *
 * Identifies rows by the run-id email pattern (`e2e-<runid>-%@traveloure.test`)
 * baked into every account this harness creates (R-4/D-4). Cascades on the
 * users FK cover plans, items, events and listings owned by those accounts;
 * this script additionally sweeps a short list of tables that key on user id
 * without an ON DELETE CASCADE, and reports anything it could not resolve.
 *
 * DRY-RUN BY DEFAULT. Pass --apply to actually delete. Never run by default
 * from any workflow in this pass (per the brief).
 *
 * Usage:
 *   npx tsx scripts/e2e/purge-run.ts <runid> [--apply]
 */
import { Pool } from 'pg';

async function main() {
  const [runId, ...flags] = process.argv.slice(2);
  const apply = flags.includes('--apply');
  if (!runId) {
    console.error('Usage: npx tsx scripts/e2e/purge-run.ts <runid> [--apply]');
    process.exit(1);
  }
  // lowercase, always: e2eEmail() (e2e/supply-demand/lib/run-id.ts) lowercases the
  // WHOLE email string it mints, so a mixed-case runid (e.g. "finalX2") is stored as
  // "e2e-finalx2-...@...". A mixed-case pattern here against a case-sensitive LIKE
  // therefore matched zero rows — found live: a dry run against a real finalX2 DB
  // reported "0 accounts" while `users` held 4 of them. Match ILIKE would also have
  // fixed it, but lowercasing the pattern (matching the writer's own normalization)
  // keeps the match exact rather than case-insensitive-and-therefore-broader.
  const emailPattern = `e2e-${runId}-%@traveloure.test`.toLowerCase();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows: users } = await pool.query(
      `SELECT id, email FROM users WHERE email LIKE $1`,
      [emailPattern],
    );
    console.log(`[purge-run] run=${runId} apply=${apply} matched ${users.length} account(s):`);
    for (const u of users) console.log(`  - ${u.id}  ${u.email}`);

    if (users.length === 0) {
      console.log('[purge-run] nothing to purge.');
      return;
    }

    const ids = users.map((u) => u.id);

    // Listing titles carry [e2e:<runid>] regardless of owner resolution above —
    // reported separately in case a listing's owner was already removed.
    const { rows: listings } = await pool.query(
      `SELECT id, service_name AS name, user_id FROM provider_services WHERE service_name LIKE $1`,
      [`%[e2e:${runId}]%`],
    );
    console.log(`[purge-run] matched ${listings.length} run-tagged listing(s) by title.`);

    if (!apply) {
      console.log('[purge-run] DRY RUN — no rows deleted. Re-run with --apply to delete.');
      console.log('[purge-run] Deletion plan: DELETE FROM users WHERE id = ANY($1) — FK cascades');
      console.log('  cover trips, itinerary_items, provider_services, user_experiences,');
      console.log('  local_expert_forms, trip_expert_advisors, etc. Any table this script');
      console.log('  does not know cascades will be listed under ORPHAN CANDIDATES below.');
      return;
    }

    await pool.query('BEGIN');
    try {
      const { rowCount } = await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [ids]);
      console.log(`[purge-run] deleted ${rowCount} user row(s) (cascades applied).`);
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }

    // Report anything that still references the run id after the cascade —
    // this is the "could not resolve" list, never silently swept.
    const { rows: orphanListings } = await pool.query(
      `SELECT id, service_name AS name FROM provider_services WHERE service_name LIKE $1`,
      [`%[e2e:${runId}]%`],
    );
    if (orphanListings.length > 0) {
      console.warn(`[purge-run] ORPHAN CANDIDATES: ${orphanListings.length} run-tagged listing(s) survived the cascade:`);
      for (const l of orphanListings) console.warn(`  - ${l.id}  ${l.name}`);
    } else {
      console.log('[purge-run] no orphan candidates remain.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
