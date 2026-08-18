#!/usr/bin/env node
/**
 * Coords-preservation guard (R26, ledger 2026-08-18-partner-demand-coords-fix) — a linkage-style
 * regression pin for the three producer-side coordinate copy-fixes (the coords analog of the
 * providerServiceId H1/H5/H9 fixes that `check-linkage-preservation.cjs` guards).
 *
 * THE INVARIANT: the item write sites that read a coord-bearing SOURCE must copy its lat/lng onto
 * the row so neighborhood history can accrue (R26; NULL stays NULL — no invention, §13):
 *   - DMO → ready-made draft     (server/routes/expert-workspace.routes.ts) — source dmo_extracted_places
 *   - cart → convert-to-itinerary (server/routes.ts)                        — source provider_services
 * NOTE — the optimizer variant producer was in the original R26 list but was DEMOTED to the FOLLOWUP:
 * its `ItineraryItem` interface carries no lat/lng, so there was nothing in hand to copy (the coords
 * are absent one layer up, a real project — see the 3.1b-T trace correction). It is deliberately NOT
 * guarded here.
 *
 * Each fix is anchored by the marker `R26 coords cheap-fix`. This guard asserts every such marker is
 * followed WITHIN A FEW LINES by both a `latitude:` and a `longitude:` write — so a partial
 * regression (copy removed, marker left) fails CI. Narrowly scoped (no codebase-wide churn).
 * `--self-test` runs fixtures (§18d).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..");

const TARGET_FILES = [
  "server/routes/expert-workspace.routes.ts",
  "server/routes.ts",
];
const MARKER = "R26 coords cheap-fix";
const LOOKAHEAD = 6;
const EXPECTED_MARKERS = 2; // one per real cheap-fix path (DMO draft, cart-convert)

function scan(rel, text) {
  const errs = [];
  const lines = text.split("\n");
  let markers = 0;
  lines.forEach((line, i) => {
    if (!line.includes(MARKER)) return;
    markers++;
    const window = lines.slice(i, Math.min(lines.length, i + 1 + LOOKAHEAD)).join("\n");
    if (!/\blatitude\s*:/.test(window) || !/\blongitude\s*:/.test(window)) {
      errs.push(`${rel}:${i + 1} — a "${MARKER}" marker is not followed by both latitude: and longitude: within ${LOOKAHEAD} lines (R26 copy dropped?)`);
    }
  });
  return { errs, markers };
}

function runSelfTest() {
  const cases = [
    { name: "marker with lat+lng passes", text: "// R26 coords cheap-fix\nlatitude: x ?? null,\nlongitude: y ?? null,", expect: 0 },
    { name: "marker missing lng fails", text: "// R26 coords cheap-fix\nlatitude: x ?? null,", expect: 1 },
    { name: "marker with neither fails", text: "// R26 coords cheap-fix\nfoo: 1,", expect: 1 },
    { name: "no marker → nothing required", text: "latitude: x,\n// unrelated", expect: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = scan("x.ts", c.text).errs.length;
    if (got === c.expect) console.log(`  ✓ ${c.name}`);
    else { failed++; console.error(`  ✗ ${c.name} — got ${got}, want ${c.expect}`); }
  }
  if (failed) { console.error(`coords-preservation self-test: ${failed} FAILED`); process.exit(1); }
  console.log("coords-preservation self-test: all fixtures passed");
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();
  const errs = [];
  let total = 0;
  for (const rel of TARGET_FILES) {
    const full = path.join(REPO, rel);
    if (!fs.existsSync(full)) { errs.push(`${rel} — target file missing`); continue; }
    const r = scan(rel, fs.readFileSync(full, "utf8"));
    errs.push(...r.errs);
    total += r.markers;
  }
  if (total < EXPECTED_MARKERS) {
    errs.push(`expected ≥${EXPECTED_MARKERS} "${MARKER}" markers across the three paths, found ${total} — a coords fix was removed?`);
  }
  if (errs.length) {
    console.error(`coords-preservation guard: ${errs.length} FAILURE(S):`);
    for (const e of errs) console.error(`  ✗ ${e}`);
    console.error("\nSee ledger 2026-08-18-partner-demand-coords-fix (R26).");
    process.exit(1);
  }
  console.log(`coords-preservation guard OK — ${total} R26 copy-fix(es) intact across the three paths.`);
}
main();
