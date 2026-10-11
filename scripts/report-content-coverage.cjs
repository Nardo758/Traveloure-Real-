#!/usr/bin/env node
/**
 * report-content-coverage.cjs <market> — READ-ONLY need × source matrix for one market (content
 * sourcing brief §5; A6 decision 1B, ledger `2026-10-01-a6-sub-needs`). Rows nest one level: each
 * need carries its named sub-needs. All the logic is `shared/content-coverage.ts` (pure, unit-tested);
 * this file only reads `content_sources` and prints.
 *
 * IT NEVER WRITES: the session runs `SET default_transaction_read_only = on` before any query.
 *
 * SS-1a (ledger `2026-10-10-ss1a-registry-entry-sheet`): it also checks the refresh targets config
 * (`server/config/content-source-targets.config.ts`) against EVERY registry row. A target naming a source
 * id no row holds, or otherwise invalid, is printed and the script EXITS 1 (SS-1 ruling 2: fail loudly).
 *
 * USAGE
 *   node scripts/report-content-coverage.cjs kyoto "<DATABASE_URL>"        # markdown
 *   node scripts/report-content-coverage.cjs kyoto "<DATABASE_URL>" --json
 *   (DATABASE_URL from the environment when the second argument is omitted)
 */
require("tsx/cjs/api").register();
const path = require("path");
const { Client } = require("pg");
const { buildCoverageReport, renderCoverageMarkdown } = require(path.join(__dirname, "..", "shared", "content-coverage.ts"));
const { validateTargets, targetProblemLine } = require(path.join(__dirname, "..", "shared", "content-source-targets.ts"));
const { CONTENT_SOURCE_TARGETS } = require(path.join(__dirname, "..", "server", "config", "content-source-targets.config.ts"));

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--json");
  const json = process.argv.includes("--json");
  const market = args[0];
  const url = args[1] || process.env.DATABASE_URL;
  if (!market || !url) {
    console.error('usage: node scripts/report-content-coverage.cjs <market> "<DATABASE_URL>" [--json]');
    process.exit(2);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    const { rows } = await client.query(
      `select id, name, market, covers, does_not_cover, active, terms_checked_at, license_class, public_ok
         from content_sources
        where market is null or lower(btrim(market)) = lower(btrim($1))
        order by (market is null), id`,
      [market],
    );
    const report = buildCoverageReport(
      market,
      rows.map((r) => ({
        id: r.id, name: r.name, market: r.market, covers: r.covers, doesNotCover: r.does_not_cover,
        active: r.active, termsCheckedAt: r.terms_checked_at, licenseClass: r.license_class, publicOk: r.public_ok,
      })),
    );
    const all = await client.query(`select id, homepage, covers, does_not_cover from content_sources`);
    const targetProblems = validateTargets(
      CONTENT_SOURCE_TARGETS,
      all.rows.map((r) => ({ id: r.id, homepage: r.homepage, covers: r.covers, doesNotCover: r.does_not_cover })),
    );
    process.stdout.write(json ? JSON.stringify({ ...report, targetProblems }, null, 2) + "\n" : renderCoverageMarkdown(report) + "\n");
    if (targetProblems.length) {
      console.error(`\nREFRESH TARGETS INVALID (${targetProblems.length}) — server/config/content-source-targets.config.ts:`);
      for (const p of targetProblems) console.error(`  ${targetProblemLine(p)}`);
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
