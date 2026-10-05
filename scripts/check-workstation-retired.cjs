#!/usr/bin/env node
/**
 * check-workstation-retired.cjs — R322 (step 7a, R-bh): the Workstation's retired surfaces stay gone.
 *
 * `ItemsEditorPanel`, `CanvasMapSection`, `TransportLegsPanel` and the standalone `LeafletPlanMap`
 * were replaced by `MapControlCenter` + `WorkstationDays` (DayBlock / ItemRow role expert / LegRow).
 *
 *   node scripts/check-workstation-retired.cjs            — the SOURCE: no definition or mount of the
 *                                                            four under client/src, and the deleted file
 *                                                            stays deleted.
 *   node scripts/check-workstation-retired.cjs --bundle   — the BUILT bundle (dist/public): none of the
 *                                                            testids only those components drew.
 *   node scripts/check-workstation-retired.cjs --self-test — committed fixtures (§18d).
 *
 * STATED NEGATIVE SPACE (§18d): a minifier renames functions, so the bundle check reads TESTIDS, not
 * component names; it sees only the strings listed below, and a retired control re-added under a new
 * testid is invisible to it. The source check reads `function X(` / `<X` / `X =` forms and a file
 * import; a re-implementation under another name is invisible to both.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const RETIRED = ["ItemsEditorPanel", "CanvasMapSection", "TransportLegsPanel", "LeafletPlanMap"];
const RETIRED_FILE = "client/src/components/expert/leaflet-plan-map.tsx";
const RETIRED_TESTIDS = [
  "button-toggle-item-editor",
  "button-toggle-transport-legs",
  "button-toggle-plan-map",
  "text-plan-map-unavailable",
  "button-map-day-filter-all",
  "tray-unlocated-items",
  "dialog-confirm-generate-transport",
];

/** Pure. Offending forms of a retired name in one source text. */
function sourceHits(text) {
  const hits = [];
  for (const n of RETIRED) {
    const re = new RegExp(`(function\\s+${n}\\s*\\(|<${n}\\b|\\b(const|let)\\s+${n}\\s*=)`);
    if (re.test(text)) hits.push(n);
  }
  if (/from\s+["'][^"']*leaflet-plan-map["']/.test(text) && !hits.includes("LeafletPlanMap")) hits.push("LeafletPlanMap");
  return hits;
}

/** Pure. Retired testids present in one bundle chunk. */
function bundleHits(text) {
  return RETIRED_TESTIDS.filter((t) => text.includes(t));
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

function selfTest() {
  const cases = [
    { name: "a definition", fn: sourceHits, text: "function ItemsEditorPanel({ a }) {}", want: ["ItemsEditorPanel"] },
    { name: "a mount", fn: sourceHits, text: "<CanvasMapSection tripId={x} />", want: ["CanvasMapSection"] },
    { name: "an import of the deleted file", fn: sourceHits, text: 'import { X } from "@/components/expert/leaflet-plan-map";', want: ["LeafletPlanMap"] },
    { name: "a comment naming it", fn: sourceHits, text: "// replaces `ItemsEditorPanel`", want: [] },
    { name: "a retired testid in a chunk", fn: bundleHits, text: 'x("button-toggle-item-editor")', want: ["button-toggle-item-editor"] },
    { name: "a live testid", fn: bundleHits, text: 'x("button-generate-transport")', want: [] },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = c.fn(c.text);
    const ok = JSON.stringify(got) === JSON.stringify(c.want);
    console.log(`${ok ? "ok  " : "FAIL"} ${c.name}: ${JSON.stringify(got)}`);
    if (!ok) failed++;
  }
  if (failed) process.exit(1);
  console.log(`workstation-retired self-test: ${cases.length}/${cases.length} fixtures pass`);
}

function main(bundle) {
  const offenders = [];
  if (bundle) {
    const dir = path.join(REPO, "dist", "public");
    if (!fs.existsSync(dir)) {
      console.error("dist/public is missing — run the build first");
      process.exit(1);
    }
    for (const f of walk(dir, []).filter((f) => f.endsWith(".js"))) {
      const hits = bundleHits(fs.readFileSync(f, "utf8"));
      if (hits.length) offenders.push(`${path.relative(REPO, f)}: ${hits.join(", ")}`);
    }
  } else {
    if (fs.existsSync(path.join(REPO, RETIRED_FILE))) offenders.push(`${RETIRED_FILE} exists`);
    for (const f of walk(path.join(REPO, "client", "src"), []).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const hits = sourceHits(fs.readFileSync(f, "utf8"));
      if (hits.length) offenders.push(`${path.relative(REPO, f)}: ${hits.join(", ")}`);
    }
  }
  if (offenders.length) {
    console.error(`Retired Workstation surfaces are back (R322):`);
    for (const o of offenders) console.error(`  ${o}`);
    process.exit(1);
  }
  console.log(`workstation-retired guard (${bundle ? "bundle" : "source"}): clean`);
}

if (process.argv.includes("--self-test")) selfTest();
else main(process.argv.includes("--bundle"));

module.exports = { sourceHits, bundleHits };
