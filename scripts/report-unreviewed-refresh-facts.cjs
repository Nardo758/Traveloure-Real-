#!/usr/bin/env node
/**
 * report-unreviewed-refresh-facts.cjs — a READ-ONLY count of the stored official-refresh facts that CS-1 item 3 stops
 * showing until a person reviews them. Ledger `2026-10-19-cs1-fact-review`.
 *
 * WHAT IT COUNTS. `place_facts` rows with origin `official_refresh`, a dated fact type (hours, last_admission,
 * last_service, closure, transit, event), no reviewer in `verified_by`, and not superseded — grouped by fact type and
 * source id, each split into live (expires_at in the future or unset) and expired. Counts and ids only: no fact
 * value, no URL, no place.
 *
 * IT NEVER WRITES. `SET TRANSACTION READ ONLY` is issued before the query, and there is no INSERT, UPDATE or DELETE
 * in the file.
 *
 * Usage: node scripts/report-unreviewed-refresh-facts.cjs "<DATABASE_URL>" [--json]
 * Exit codes: 0 = counted; 2 = could not connect or query.
 */
"use strict";

const { Client } = require("pg");

// Keep in step with DATED_FACT_TYPES in shared/content-facts.ts (pinned by shared/__tests__/fact-review.test.ts).
const DATED_FACT_TYPES = ["hours", "last_admission", "last_service", "closed_dates", "transit", "event"];

const SQL = `
  SELECT fact_type, coalesce(source_id, '(none)') AS source_id,
         count(*) FILTER (WHERE expires_at IS NULL OR expires_at > now())::int AS live,
         count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= now())::int AS expired
    FROM place_facts
   WHERE origin = 'official_refresh'
     AND fact_type = ANY($1::text[])
     AND btrim(coalesce(verified_by, '')) = ''
     AND superseded_by IS NULL
   GROUP BY 1, 2
   ORDER BY 1, 2`;

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const url = argv.find((a) => !a.startsWith("--")) || process.env.DATABASE_URL;
  if (!url) {
    console.error('No database URL. Usage: node scripts/report-unreviewed-refresh-facts.cjs "<DATABASE_URL>"');
    process.exit(2);
  }
  const client = new Client({ connectionString: url });
  let rows;
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    rows = (await client.query(SQL, [DATED_FACT_TYPES])).rows;
    await client.query("ROLLBACK");
  } catch (err) {
    console.error(`[unreviewed-refresh-facts] query failed: ${String(err && err.message).slice(0, 200)}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {});
  }
  const total = rows.reduce((a, r) => ({ live: a.live + r.live, expired: a.expired + r.expired }), { live: 0, expired: 0 });
  if (json) {
    console.log(JSON.stringify({ rows, total }, null, 2));
    return;
  }
  console.log("[unreviewed-refresh-facts] read-only — nothing was written.");
  console.log("fact_type\tsource_id\tlive\texpired");
  for (const r of rows) console.log(`${r.fact_type}\t${r.source_id}\t${r.live}\t${r.expired}`);
  console.log(`TOTAL\t\t${total.live}\t${total.expired}`);
}

if (require.main === module) main();
module.exports = { DATED_FACT_TYPES, SQL };
