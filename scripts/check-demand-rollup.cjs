#!/usr/bin/env node
/**
 * check-demand-rollup.cjs — Partner Demand 2B discipline gate
 * (ledger 2026-08-18-partner-demand-2b). Grep gate over the demand-rollup code. Enforces:
 *
 *   1. NO `totalRevenue` read anywhere in the demand-rollup code — `providerServices.totalRevenue`
 *      is BANNED as an analytics source (Locked Decision 3); money reads use `feeLedger` only, and
 *      it is R12-blocked here anyway.
 *   2. Demand MATH lives ONLY in demand-rollup.compute.ts — the metric computation functions
 *      (`computeUnmetSlip` / `computeSlipFunnel`) are DEFINED nowhere else (L6 single-computation).
 *   3. Floor thresholds come from config — a bare floor comparison (`>= 5|10|25`, `< 5|10|25`) may
 *      appear ONLY in server/config/demand-floors.config.ts; the service/routes read the config
 *      helpers (`clearsFloor` / `floorFor` / `DEMAND_FLOORS`), never a literal.
 *
 * STATED NEGATIVE SPACE (ruling 43): fee literals are the fee-literal-guard's job, not this gate's;
 * this gate does not police non-demand files, and it matches the metric-fn NAMES textually (a
 * renamed re-implementation would need its own name added here). `--self-test` runs fixtures (§18d).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..");

const COMPUTE_HOME = "server/services/demand-rollup.compute.ts";
const FLOOR_CONFIG = "server/config/demand-floors.config.ts";
// The 2B demand-rollup MODULE — the four files this lane authors end-to-end. All three checks
// (totalRevenue ban, floor-literal + computation confinement) apply to exactly these.
// Phase 4 (recruitment one-pager) extends the same discipline to the demand-onepager module: the
// generator READS the floored rollup and lays it out — it must never re-derive a demand figure
// (no metric-fn def, no bare floor/window literal, no totalRevenue read). This is the dispatch's
// "no-computation grep (generator reads, never derives)" gate. Note demand-onepager.compute.ts does
// SELECT a variant and FORMAT copy (that is not demand math) — the strict checks target metric-fn
// definitions and floor literals, which it has none of.
const STRICT_FILES = [
  "server/services/demand-rollup.compute.ts",
  "server/services/demand-rollup.service.ts",
  "server/jobs/demandRollup.ts",
  "server/config/demand-floors.config.ts",
  "server/services/demand-onepager.compute.ts",
  "server/services/demand-onepager.render.ts",
  "server/services/demand-onepager.service.ts",
];
// STATED NEGATIVE SPACE (ruling 43): this gate does NOT scan server/routes/demand.routes.ts. That is
// a MIXED legacy file — the two 2B endpoints added there only CALL the service functions (they never
// read providerServices), while its PRE-EXISTING business-advisor `getBenchmarkFacts` genuinely reads
// the banned `providerServices.totalRevenue` denorm (Locked Decision 3) for a benchmark. That read is
// legacy debt outside this lane, flagged separately at the HARD STOP — not something a 2B gate should
// either police or launder. The 2B analytics reads all happen in the module above, which IS scanned.
const TOTALREV_FILES = STRICT_FILES;
// STEP 3.2 "no client math" gate: the Market Research page renders endpoint fields only — every
// TOTAL comes from the server-computed `summary` (L6). A client-side `.reduce(` over demand rows
// would re-derive a figure on the client, exactly what L6/§18-rule-1 forbid. This list is narrow
// (the demand surfaces), and the idiom is the canonical client-summation tell.
// 3.3 Catalog funnel rows added a SECOND demand surface: the services page renders per-listing
// funnel cells. Same rule — it renders server fields (stallStage, stage counts, floor) and must
// never .reduce() a total out of demand rows (L6 "no client math").
const CLIENT_NOMATH_FILES = [
  "client/src/pages/provider/market-research.tsx",
  "client/src/pages/provider/services.tsx",
  // 3.3 Item 1.2 — Calendar ghost slots + month demand aggregate. The aggregate arrives computed
  // in the /api/me/calendar `demand` field; the page must never .reduce() a total from the rows.
  "client/src/pages/provider/calendar.tsx",
  // 3.4 Item 2.2 — Performance → Demand tab renders the L6 rollup month figures + funnel line;
  // every figure comes from the server summary/stallStage, never re-derived on the client.
  "client/src/pages/provider/performance.tsx",
];
const CLIENT_MATH = /\.reduce\s*\(/;
const COMPUTE_FN_DEF = /\bfunction\s+(computeUnmetSlip|computeSlipFunnel|computeUnmetStay)\b/;
// R29 added the enumerable own-book tier (3) — a bare floor comparison against any tier value
// (3/5/10/25) may live ONLY in demand-floors.config.ts; the read path calls clearsFloor/floorForScope.
const FLOOR_LITERAL = /[<>]=?\s*(3|5|10|25)\b/;
// R20 (ledger 2026-08-18-partner-demand-phase3): the ±90 window is ONE config constant
// (DEMAND_WINDOW_DAYS). A bare `90` in a demand path is a literal that would drift from the config,
// so it may appear ONLY in demand-floors.config.ts. \b90\b won't match 86_400_000 / slice(0, 10).
const WINDOW_LITERAL = /\b90\b/;
// Only the BANNED denorm counter — a local `totalRevenue` computed from serviceBookings SUM is the
// real number and is fine (Locked Decision 3 bans the providerServices.totalRevenue denorm only).
const BANNED_TOTALREV = /providerServices\s*\.\s*totalRevenue|\btotal_revenue\b/;

function scanClientNoMath(rel, text) {
  const errs = [];
  text.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (CLIENT_MATH.test(code)) {
      errs.push(`${rel}:${i + 1} — client-side .reduce() over demand data; totals come from the server 'summary' (L6 no-client-math)`);
    }
  });
  return errs;
}

function scan(rel, text, strict) {
  const errs = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const n = i + 1;
    const code = line.replace(/\/\/.*$/, ""); // ignore trailing line comments
    if (BANNED_TOTALREV.test(code)) {
      errs.push(`${rel}:${n} — reads providerServices.totalRevenue (BANNED analytics source, Locked Decision 3)`);
    }
    if (strict) {
      if (COMPUTE_FN_DEF.test(code) && rel !== COMPUTE_HOME) {
        errs.push(`${rel}:${n} — defines a demand-metric function outside ${COMPUTE_HOME} (L6 single-computation)`);
      }
      if (FLOOR_LITERAL.test(code) && rel !== FLOOR_CONFIG) {
        errs.push(`${rel}:${n} — bare floor literal comparison; floors come from ${FLOOR_CONFIG} (clearsFloor/floorFor)`);
      }
      if (WINDOW_LITERAL.test(code) && rel !== FLOOR_CONFIG) {
        errs.push(`${rel}:${n} — bare 90 (±window) literal; the window comes from ${FLOOR_CONFIG} (DEMAND_WINDOW_DAYS)`);
      }
    }
  });
  return errs;
}

function runSelfTest() {
  const cases = [
    { name: "totalRevenue read fails (any demand file)", rel: "server/routes/demand.routes.ts", text: "const r = providerServices.totalRevenue;", strict: false, expect: 1 },
    { name: "compute fn outside home fails (strict file)", rel: "server/services/demand-rollup.service.ts", text: "function computeUnmetSlip(){}", strict: true, expect: 1 },
    { name: "compute fn IN home passes", rel: COMPUTE_HOME, text: "export function computeUnmetSlip(){}", strict: true, expect: 0 },
    { name: "floor literal outside config fails (strict file)", rel: "server/services/demand-rollup.service.ts", text: "if (n >= 10) render();", strict: true, expect: 1 },
    { name: "floor literal IN config passes", rel: FLOOR_CONFIG, text: "return count >= 10;", strict: true, expect: 0 },
    { name: "R29 enumerable floor literal (3) outside config fails", rel: "server/services/demand-rollup.service.ts", text: "if (n >= 3) render();", strict: true, expect: 1 },
    { name: "R29 enumerable floor literal (3) IN config passes", rel: FLOOR_CONFIG, text: "return count >= 3;", strict: true, expect: 0 },
    { name: "window literal (90) outside config fails", rel: "server/services/demand-rollup.service.ts", text: "const to = addDaysISO(today, 90);", strict: true, expect: 1 },
    { name: "window literal (90) IN config passes", rel: FLOOR_CONFIG, text: "export const DEMAND_WINDOW_DAYS = 90;", strict: true, expect: 0 },
    { name: "86_400_000 does not trip the 90 window gate", rel: COMPUTE_HOME, text: "const ms = t + days * 86_400_000;", strict: true, expect: 0 },
    { name: "legacy floor/compute in mixed non-strict file is not policed", rel: "server/routes/demand.routes.ts", text: "if (sampleSize >= 5) { function computeUnmetSlip(){} }", strict: false, expect: 0 },
    { name: "clean service line passes", rel: "server/services/demand-rollup.service.ts", text: "const ok = clearsFloor(row);", strict: true, expect: 0 },
  ];
  const clientCases = [
    { name: "client .reduce() over demand data fails", text: "const total = rows.reduce((s, r) => s + r.value.amount, 0);", expect: 1 },
    { name: "client render of a server summary field passes", text: "const total = summary.requested.slipAmount;", expect: 0 },
  ];
  let failed = 0;
  for (const c of clientCases) {
    const got = scanClientNoMath("client/src/pages/provider/market-research.tsx", c.text).length;
    if (got === c.expect) console.log(`  ✓ ${c.name}`);
    else { failed++; console.error(`  ✗ ${c.name} — got ${got} err(s), want ${c.expect}`); }
  }
  for (const c of cases) {
    const got = scan(c.rel, c.text, c.strict).length;
    if (got === c.expect) console.log(`  ✓ ${c.name}`);
    else { failed++; console.error(`  ✗ ${c.name} — got ${got} err(s), want ${c.expect}`); }
  }
  if (failed) { console.error(`demand-rollup gate self-test: ${failed} FAILED`); process.exit(1); }
  console.log("demand-rollup gate self-test: all fixtures passed");
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();
  const errs = [];
  for (const rel of TOTALREV_FILES) {
    const full = path.join(REPO, rel);
    if (!fs.existsSync(full)) continue;
    errs.push(...scan(rel, fs.readFileSync(full, "utf8"), STRICT_FILES.includes(rel)));
  }
  for (const rel of CLIENT_NOMATH_FILES) {
    const full = path.join(REPO, rel);
    if (!fs.existsSync(full)) continue;
    errs.push(...scanClientNoMath(rel, fs.readFileSync(full, "utf8")));
  }
  if (errs.length) {
    console.error(`demand-rollup gate: ${errs.length} FAILURE(S):`);
    for (const e of errs) console.error(`  ✗ ${e}`);
    console.error("\nSee ledger 2026-08-18-partner-demand-2b and scripts/check-demand-rollup.cjs.");
    process.exit(1);
  }
  console.log("demand-rollup gate OK — no totalRevenue, computation confined to the L6 module, floors from config.");
}
main();
