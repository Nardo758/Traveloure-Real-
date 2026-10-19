#!/usr/bin/env node
/**
 * EV PR 0 (ledger `2026-10-18-serp-cache-off`): READ-ONLY. Prints the number of rows in `serp_cache` and
 * nothing else — no cache key, query, location or result is read. Nothing is deleted.
 *
 *   node scripts/count-serp-cache.cjs "<DATABASE_URL>"   (or DATABASE_URL in the environment)
 */
const { Client } = require("pg");

async function main() {
  const url = process.argv[2] || process.env.DATABASE_URL;
  if (!url) {
    console.error("usage: node scripts/count-serp-cache.cjs <DATABASE_URL>");
    process.exit(2);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query("SELECT count(*)::int AS n FROM serp_cache");
    await client.query("ROLLBACK");
    console.log(String(rows[0].n));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`count-serp-cache: ${err.code || err.message}`);
  process.exit(1);
});
