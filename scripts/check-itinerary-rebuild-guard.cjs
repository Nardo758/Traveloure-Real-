#!/usr/bin/env node
/**
 * check-itinerary-rebuild-guard.cjs — D-1 completeness gate
 * (ledger 2026-08-31-rebuild-delete-money-guard; filed in #676, wired here).
 *
 * The D-1 money-safety class: a "rebuild the AI items" delete keyed on `origin` (or on nothing)
 * can destroy an itinerary_items row the traveler committed money to (`ready_for_checkout` /
 * `purchased`, or a row carrying a `booking_id`). The one shared predicate
 * `itineraryItemRebuildDeletable()` (server/services/itinerary-rebuild-guard.ts) spares those rows;
 * every rebuild delete must AND it in. This gate makes "someone writes a fourth instance without the
 * guard" a red build instead of a silent hole — the same move as `check-privileged-field-completeness`
 * after the §19 families.
 *
 * RULE: every TRIP-SCOPED `delete(itineraryItems)` / `DELETE FROM itinerary_items` site under
 * server/ (excluding tests) MUST either
 *   - AND in `itineraryItemRebuildDeletable()` within its statement, OR
 *   - carry an explicit `// rebuild-guard-exempt: <reason>` on the line or within the 6 lines above.
 * A trip-scoped delete is one whose WHERE references `itineraryItems.tripId` / `trip_id` (a bulk
 * delete). A single-row delete (`where(eq(itineraryItems.id, …))` with no tripId) is NOT rebuild-shape
 * and is ignored — targeted removals are the R15 guard's concern, not this one.
 *
 * STATED NEGATIVE SPACE (ruling 43 / §18d): this gate knows ONLY the itinerary_items rebuild-delete
 * class. It does not verify that an exemption's stated reason is TRUE (an `in_planning-only` claim on a
 * delete that is not in_planning-only would pass — the reason is a human assertion, reviewed, not
 * proven), does not follow a delete indirected through a helper it cannot see textually, and does not
 * police any other table. Its exemptions are REPORTED on every run so a filed exemption never becomes a
 * silent baseline (ruling 32 posture).
 *
 * `--self-test` runs committed inline fixtures (§18d: a predicate ships with fixtures) and exits
 * nonzero if the predicate stops catching an unguarded rebuild delete or starts flagging a guarded /
 * exempt / single-row one.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(REPO, "server");

const DELETE_RE = /\.delete\(\s*itineraryItems\s*\)|DELETE\s+FROM\s+itinerary_items/i;
const TRIPSCOPE_RE = /itineraryItems\.tripId|\btrip_id\b/;
const SINGLEID_RE = /itineraryItems\.id\b/;
const GUARD_RE = /itineraryItemRebuildDeletable\s*\(/;
const EXEMPT_RE = /rebuild-guard-exempt:\s*\S/i;
const LOOKBACK = 6; // comment lines above the delete
const WINDOW = 12; // lines below the delete to capture a multi-line .where(...) statement

/** Collect the delete statement's text: from line i down to the line that closes it (`;`) or +WINDOW. */
function statementWindow(lines, i) {
  const end = Math.min(lines.length - 1, i + WINDOW);
  const parts = [];
  for (let j = i; j <= end; j++) {
    parts.push(lines[j]);
    if (lines[j].includes(";")) break;
  }
  return { text: parts.join("\n"), end: i + parts.length - 1 };
}

/** Scan one file's text → { violations[], exemptions[] }. Exported shape drives --self-test. */
function scanText(rel, text) {
  const lines = text.split("\n");
  const violations = [];
  const exemptions = [];
  for (let i = 0; i < lines.length; i++) {
    if (!DELETE_RE.test(lines[i])) continue;
    // A delete SITE is a code line — skip prose in comments that merely names the delete
    // (e.g. a "`db.delete(itineraryItems)` below" reference in a security note above the handler).
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    const { text: stmt, end } = statementWindow(lines, i);
    const tripScoped = TRIPSCOPE_RE.test(stmt);
    const singleId = SINGLEID_RE.test(stmt) && !tripScoped;
    if (singleId || !tripScoped) continue; // not a rebuild-shape (bulk) delete

    const loc = `${rel}:${i + 1}`;
    // Guard must appear IN the statement; an exemption may sit inline or up to LOOKBACK lines above.
    if (GUARD_RE.test(stmt)) { exemptions.push(`${loc} — guarded (itineraryItemRebuildDeletable)`); continue; }
    let exemptReason = null;
    for (let j = Math.max(0, i - LOOKBACK); j <= end; j++) {
      const m = lines[j].match(EXEMPT_RE);
      if (m) { exemptReason = lines[j].slice(lines[j].search(EXEMPT_RE)).trim(); break; }
    }
    if (exemptReason) { exemptions.push(`${loc} — ${exemptReason}`); continue; }
    violations.push(`${loc} — trip-scoped itinerary_items delete with NO itineraryItemRebuildDeletable() and no // rebuild-guard-exempt:<reason>`);
  }
  return { violations, exemptions };
}

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

function runSelfTest() {
  const cases = [
    {
      name: "guarded trip-scoped rebuild delete passes",
      text: `await db.delete(itineraryItems).where(and(\n  eq(itineraryItems.tripId, tripId),\n  itineraryItemRebuildDeletable(),\n));`,
      expectViolations: 0,
    },
    {
      name: "unguarded trip-scoped rebuild delete FAILS",
      text: `await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));`,
      expectViolations: 1,
    },
    {
      name: "exempt-annotated trip-scoped delete passes",
      text: `// rebuild-guard-exempt: in_planning-only — never touches routed/booked rows\nawait db.delete(itineraryItems).where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.routingStatus, "in_planning")));`,
      expectViolations: 0,
    },
    {
      name: "single-row delete is not rebuild-shape (ignored)",
      text: `await tx.delete(itineraryItems).where(eq(itineraryItems.id, id));`,
      expectViolations: 0,
    },
    {
      name: "prose reference in a comment is not a site",
      text: `// (\`db.delete(itineraryItems)\` below, scoped by tripId) burns AI spend`,
      expectViolations: 0,
    },
  ];
  let failures = 0;
  for (const c of cases) {
    const { violations } = scanText("<fixture>", c.text);
    const ok = violations.length === c.expectViolations;
    console.log(`  ${ok ? "✓" : "✗"} ${c.name}`);
    if (!ok) { failures++; console.log(`      expected ${c.expectViolations} violation(s), got ${violations.length}: ${JSON.stringify(violations)}`); }
  }
  if (failures) { console.error(`itinerary-rebuild-guard self-test: ${failures} fixture(s) FAILED`); process.exit(1); }
  console.log("itinerary-rebuild-guard self-test: all fixtures passed");
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();
  const files = walk(SERVER_DIR, []);
  const allViolations = [];
  const allExemptions = [];
  for (const f of files) {
    const rel = path.relative(REPO, f);
    const { violations, exemptions } = scanText(rel, fs.readFileSync(f, "utf8"));
    allViolations.push(...violations);
    allExemptions.push(...exemptions);
  }
  if (allExemptions.length) {
    console.log(`itinerary-rebuild-guard: ${allExemptions.length} rebuild-delete site(s) accounted for (reported, not failing):`);
    for (const e of allExemptions.sort()) console.log(`  · ${e}`);
  }
  if (allViolations.length) {
    console.error(`\nitinerary-rebuild-guard: ${allViolations.length} UNGUARDED rebuild-delete site(s):`);
    for (const v of allViolations.sort()) console.error(`  ✗ ${v}`);
    console.error(`\nFix: AND \`itineraryItemRebuildDeletable()\` into the delete's WHERE, or add \`// rebuild-guard-exempt: <reason>\` if the delete provably cannot touch a checked-out/purchased/booked row (an in_planning-only delete, or a dead method).`);
    process.exit(1);
  }
  console.log("itinerary-rebuild-guard OK — every trip-scoped itinerary_items delete is guarded or exempt (D-1).");
}

main();
