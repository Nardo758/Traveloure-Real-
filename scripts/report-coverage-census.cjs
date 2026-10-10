#!/usr/bin/env node
/**
 * report-coverage-census.cjs <market> — READ-ONLY coverage census for one market (FD-5, ledger
 * `2026-10-10-fd5-coverage-targets`). Per production neighbourhood slug: local picks (gems), local notes
 * (nuggets), local facts, and official hours / last entry / last service by source, against the targets in
 * `server/config/coverage-targets.config.ts` for both day types. Also prints the gems whose slug names no
 * neighbourhood here and the target slugs the market has no row for. The logic is
 * `server/services/coverage-census.service.ts` + `shared/coverage-targets.ts`; this file only connects and prints.
 *
 * IT NEVER WRITES: the session runs `SET default_transaction_read_only = on` before any query.
 *
 * USAGE
 *   node scripts/report-coverage-census.cjs kyoto "<DATABASE_URL>"        # markdown
 *   node scripts/report-coverage-census.cjs kyoto "<DATABASE_URL>" --json
 *   (DATABASE_URL from the environment when the second argument is omitted)
 */
require("tsx/cjs/api").register();
const path = require("path");
const { Client } = require("pg");
const { loadCoverageCensus } = require(path.join(__dirname, "..", "server", "services", "coverage-census.service.ts"));
const { coverageTargetsForMarket } = require(path.join(__dirname, "..", "server", "config", "coverage-targets.config.ts"));
const { renderCensusMarkdown } = require(path.join(__dirname, "..", "shared", "coverage-targets.ts"));

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  const json = process.argv.includes("--json");
  const market = args[0];
  const url = args[1] || process.env.DATABASE_URL;
  if (!market || !url) {
    console.error('usage: node scripts/report-coverage-census.cjs <market> "<DATABASE_URL>" [--json]');
    process.exit(2);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    const census = await loadCoverageCensus(market, coverageTargetsForMarket(market), (text, params) => client.query(text, params));
    process.stdout.write(json ? JSON.stringify(census, null, 2) + "\n" : renderCensusMarkdown(census) + "\n");
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
