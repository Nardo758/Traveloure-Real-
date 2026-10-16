#!/usr/bin/env node
/**
 * Raise one GitHub Actions `::notice` per skipped test in a Playwright JSON report, carrying the test's own skip
 * reason (ledger `2026-10-15-sandbox-rates-unavailable-skip`). A skipped spec leaves the job green, so without this a
 * skip is invisible on main; the notice puts it on the run's summary and the commit's checks.
 *
 * Usage: node scripts/report-playwright-skips.cjs <results.json> <notice title>
 * A missing or unreadable report is said once and exits 0: this step reports, it never decides the job.
 */
const fs = require("fs");

function escapeData(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProp(s) {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function collectSkips(report) {
  const out = [];
  const walk = (suite, trail) => {
    const here = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const skipped = t.status === "skipped" || (t.results ?? []).some((r) => r.status === "skipped");
        if (!skipped) continue;
        const reasons = [...(t.annotations ?? []), ...(t.results ?? []).flatMap((r) => r.annotations ?? [])]
          .filter((a) => a.type === "skip")
          .map((a) => a.description)
          .filter(Boolean);
        out.push({ name: [...here, spec.title].join(" › "), reason: reasons[0] ?? "no reason given" });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const s of report.suites ?? []) walk(s, []);
  return out;
}

if (require.main === module) {
  const [file, title = "Skipped test"] = process.argv.slice(2);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.log(`report-playwright-skips: no readable report at ${file} (${err.message}); nothing to report.`);
    process.exit(0);
  }
  const skips = collectSkips(report);
  for (const s of skips) console.log(`::notice title=${escapeProp(title)}::${escapeData(`${s.name}: ${s.reason}`)}`);
  console.log(`report-playwright-skips: ${skips.length} skipped test(s).`);
}

module.exports = { collectSkips, escapeData, escapeProp };
