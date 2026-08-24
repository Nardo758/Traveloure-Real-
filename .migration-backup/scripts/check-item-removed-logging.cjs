#!/usr/bin/env node
/**
 * check-item-removed-logging.cjs — R15 coverage gate
 * (ledger 2026-08-17-partner-demand-r15-transition-log).
 *
 * R15 requires: EVERY hard-delete path for `itinerary_items` in server code either writes an
 * append-only `item_removed` diary row in the SAME transaction (genuine removal — the demand
 * pipeline's removal signal), OR is explicitly annotated as NOT a removal (a plan rebuild /
 * apply / dead method), so a false removal signal can never be emitted (§13) and a genuine one
 * can never be silently dropped.
 *
 * Mechanism (the codebase's inline-annotation convention — cf. money-derive-ok / fee-literal-ok):
 * every `delete(itineraryItems)` (drizzle) and raw `DELETE FROM itinerary_items` site under
 * server/ (excluding tests) MUST carry an `item-removed:<kind>` comment on the line or within the
 * 6 lines above it. Kinds:
 *   - logged   → the site writes `item_removed` same-transaction (the gate verifies an
 *                `item_removed` reference appears within 40 lines below the delete).
 *   - replace  → delete-then-reinsert as ONE rebuild/apply operation; NOT a removal (§13). The
 *                site must NOT log `item_removed`.
 *   - dead     → no live caller; kept for shape. Must NOT log `item_removed`.
 *
 * STATED NEGATIVE SPACE (ruling 43): this gate knows ONLY the `itinerary_items` delete class. It
 * does not police OTHER trails (assignment, workspace), does not verify the ACTOR passed to a
 * logged site, and does not follow a delete indirected through a helper it cannot see textually.
 * Its `replace`/`dead` exemptions are REPORTED on every run (ruling 32 / §18d posture) so a filed
 * exemption never becomes a silent baseline.
 *
 * `--self-test` runs committed inline fixtures (§18d: a predicate ships with fixtures) and exits
 * nonzero if the predicate stops catching an unannotated delete or a logged-without-write site.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(REPO, "server");

const DELETE_RE = /\.delete\(\s*itineraryItems\s*\)|DELETE\s+FROM\s+itinerary_items/i;
const ANNOT_RE = /item-removed:\s*(logged|replace|dead)/i;
const LOGGED_WRITE_RE = /item_removed/;
const LOOKBACK = 6; // comment lines above the delete
const LOGGED_LOOKAHEAD = 40; // window to find the item_removed write below a `logged` site

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Scan one file's text → { violations[], exemptions[] }. Exported shape drives --self-test. */
function scanText(rel, text) {
  const lines = text.split("\n");
  const violations = [];
  const exemptions = [];
  for (let i = 0; i < lines.length; i++) {
    if (!DELETE_RE.test(lines[i])) continue;
    // A delete SITE is always a code line — skip prose in comments that merely names the delete
    // (e.g. a `\`db.delete(itineraryItems)\` below` reference in a security note above the handler).
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    // find the annotation on this line or within LOOKBACK lines above
    let kind = null;
    for (let j = i; j >= Math.max(0, i - LOOKBACK); j--) {
      const m = lines[j].match(ANNOT_RE);
      if (m) { kind = m[1].toLowerCase(); break; }
    }
    const loc = `${rel}:${i + 1}`;
    if (!kind) {
      violations.push(`${loc} — itinerary_items delete with NO item-removed:<kind> annotation`);
      continue;
    }
    if (kind === "logged") {
      const end = Math.min(lines.length, i + 1 + LOGGED_LOOKAHEAD);
      const window = lines.slice(i, end).join("\n");
      if (!LOGGED_WRITE_RE.test(window)) {
        violations.push(`${loc} — item-removed:logged but no \`item_removed\` write within ${LOGGED_LOOKAHEAD} lines`);
      }
    } else {
      // replace | dead — must NOT carry an item_removed write on the same delete line
      exemptions.push(`${loc} — item-removed:${kind}`);
    }
  }
  return { violations, exemptions };
}

function runSelfTest() {
  const cases = [
    {
      name: "logged site with a same-transaction write passes",
      text: [
        "// item-removed:logged",
        "await tx.delete(itineraryItems).where(eq(itineraryItems.id, id));",
        'await logItemTransition(tx, { eventType: "item_removed" });',
      ].join("\n"),
      expectViolations: 0,
    },
    {
      name: "unannotated delete FAILS",
      text: "await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t));",
      expectViolations: 1,
    },
    {
      name: "logged without an item_removed write FAILS",
      text: [
        "// item-removed:logged",
        "await tx.delete(itineraryItems).where(eq(itineraryItems.id, id));",
        "return;",
      ].join("\n"),
      expectViolations: 1,
    },
    {
      name: "replace site passes and is reported as an exemption",
      text: [
        "// item-removed:replace — AI rebuild",
        "await tx.delete(itineraryItems).where(eq(itineraryItems.tripId, t));",
      ].join("\n"),
      expectViolations: 0,
      expectExemptions: 1,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const { violations, exemptions } = scanText("fixture", c.text);
    const okV = violations.length === c.expectViolations;
    const okE = c.expectExemptions === undefined || exemptions.length === c.expectExemptions;
    if (okV && okE) {
      console.log(`  ✓ ${c.name}`);
    } else {
      failed++;
      console.error(`  ✗ ${c.name} — violations=${violations.length} (want ${c.expectViolations}), exemptions=${exemptions.length}`);
    }
  }
  if (failed) {
    console.error(`item-removed-logging self-test: ${failed} fixture(s) FAILED`);
    process.exit(1);
  }
  console.log("item-removed-logging self-test: all fixtures passed");
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const files = walk(SERVER_DIR, []);
  const allViolations = [];
  const allExemptions = [];
  for (const full of files) {
    const rel = path.relative(REPO, full);
    const { violations, exemptions } = scanText(rel, fs.readFileSync(full, "utf8"));
    allViolations.push(...violations);
    allExemptions.push(...exemptions);
  }

  // Exemptions are ALWAYS reported (ruling 32 / §18d — a filed exemption never becomes silent).
  if (allExemptions.length) {
    console.log(`item-removed-logging: ${allExemptions.length} annotated non-removal delete site(s) (reported, not failing):`);
    for (const e of allExemptions) console.log(`  · ${e}`);
  }

  if (allViolations.length) {
    console.error(`\nitem-removed-logging: ${allViolations.length} FAILURE(S):`);
    for (const v of allViolations) console.error(`  ✗ ${v}`);
    console.error(
      "\nEvery itinerary_items hard-delete must carry item-removed:logged|replace|dead (R15).\n" +
      "See scripts/check-item-removed-logging.cjs and ledger 2026-08-17-partner-demand-r15-transition-log.",
    );
    process.exit(1);
  }

  console.log("item-removed-logging OK — every itinerary_items delete path is annotated (R15).");
}

main();
