/**
 * form-status-is-not-a-gate.test.ts — board §7
 *
 * THE DEFECT. `provider_services.form_status` has NO writer anywhere under `server/` except the
 * seed files: `seeds/beta-data-extended.ts` writes `"approved"`, and the real creation paths
 * write NULL (`storage.ts:3067`, `:4034`). Three queries in `recommendation.service.ts`
 * nevertheless filtered `formStatus = 'approved'`, so they matched SEEDED rows and excluded every
 * genuine listing — on surfaces reached by the live, unauthenticated `GET /api/recommendations/user`.
 *
 * THE FIX WAS A SUBSTITUTION, NOT A DELETION, and that distinction is the point of this file.
 * Removing the predicate would have recommended UNAPPROVED listings: CLAUDE.md's F2 rule is that
 * every PUBLIC `provider_services` surface filters `approval_status = 'approved'`. The gate was
 * right and the column was wrong. `approvalStatus` is the ratified vocabulary, and this very file
 * already used it correctly one function over — which is what made the wrong column legible.
 *
 * WHY A SOURCE ASSERTION. The failure mode is a query that runs, returns rows, and errors on
 * nothing — it is invisible to any behavioural test that does not already know the expected row
 * count for a seeded-vs-real database. What is checkable is the predicate itself.
 *
 * STATED NEGATIVE SPACE (§18d). It proves no `formStatus` EQUALITY FILTER survives under
 * `server/`; it does not prove the surrounding query is otherwise correct, does not look at
 * `client/`, and deliberately permits the column to be SELECTED for display (the admin console
 * shows it) and WRITTEN by seeds. If the column ever gains a real writer, this test is the thing
 * to come back and re-argue — it asserts today's fact, not a law of nature.
 *
 * Run with: npx tsx --test server/__tests__/form-status-is-not-a-gate.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Every .ts file under server/, excluding tests and seeds. */
function serverFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules" || entry.name === "seeds") continue;
      serverFiles(full, out);
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

test("F1: no equality filter on form_status survives anywhere under server/", () => {
  const offenders: string[] = [];
  // `eq(<anything>.formStatus, …)` / `eq(<anything>.form_status, …)` — the drizzle predicate shape.
  const re = /\beq\(\s*[A-Za-z_$][\w$.]*\.(formStatus|form_status)\s*,/;
  for (const file of serverFiles(path.join(ROOT, "server"))) {
    const src = fs.readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => {
      if (re.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    "form_status has no writer outside the seeds, so filtering on it silently excludes every real " +
      `listing. Gate on approvalStatus instead:\n${offenders.join("\n")}`,
  );
});

test("F2: the three recommendation queries gate on approvalStatus", () => {
  const src = fs.readFileSync(path.join(ROOT, "server/services/recommendation.service.ts"), "utf8");
  const gates = src.match(/eq\(providerServices\.approvalStatus,\s*"approved"\)/g) ?? [];
  // Three substituted sites plus the pre-existing `approvedListings` read that was already correct.
  assert.ok(
    gates.length >= 4,
    `expected at least 4 approvalStatus gates in recommendation.service.ts, found ${gates.length} — ` +
      "if a query lost its gate, a public surface is now recommending unapproved listings",
  );
});

test("F3: the column still has no writer outside the seeds — the premise this rests on", () => {
  const writers: string[] = [];
  for (const file of serverFiles(path.join(ROOT, "server"))) {
    const src = fs.readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => {
      // A write is `formStatus: <value>` in an insert/update object. Two shapes are NOT writes and
      // are excluded deliberately: an explicit `null` (the real creation paths, which is the whole
      // point), and a drizzle SELECT projection `formStatus: <table>.formStatus` (the admin console
      // displays the column, which stays legitimate).
      const m = line.match(/\bformStatus:\s*(?!null\b)(?![A-Za-z_$][\w$]*\.formStatus\b)(\S)/);
      if (m) writers.push(`${path.relative(ROOT, file)}:${i + 1}`);
    });
  }
  assert.deepEqual(
    writers,
    [],
    "form_status gained a writer outside the seeds. F1's premise no longer holds — re-argue it " +
      `rather than deleting this test:\n${writers.join("\n")}`,
  );
});
