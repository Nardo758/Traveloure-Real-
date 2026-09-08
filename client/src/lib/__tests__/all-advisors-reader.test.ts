/**
 * THE ADVISOR READER RETURNS ALL OF THEM. Ledger `2026-09-07-all-advisors-reader`;
 * CLAUDE.md Locked Decision 42 **D7** — "a reader that silently returns one of many is a plan
 * quietly hiding a person who can write to it".
 *
 * WHY PINS AND NOT A BROWSER RUN. Both halves of this regress invisibly. A `LIMIT 1` creeping back
 * into the query renders a perfectly ordinary Expert card that happens to omit a person; a status
 * literal creeping back in front of the shared allow-list drops `assigned` advisors — who hold §12
 * WRITE access — out of the response entirely, which is what this lane found.
 *
 *   A1  The reader has no `LIMIT`, returns an array, and gates on the SHARED read allow-list
 *       (`TRIP_ADVISOR_ACCESS_STATUSES`) rather than a re-typed status pair (§18 rule 1).
 *   A2  The route answers with `advisors`, and keeps `advisor` as the NAMED first element rather
 *       than a silent `[0]` — the six existing client surfaces keep working.
 *   A3  `slipOtherAdvisorsLine` names the others, counts a nameless row without inventing a name,
 *       and renders NOTHING for zero or one advisor (§13).
 *
 * Pure: no DOM, no DB, no fetch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slipOtherAdvisorsLine } from "../slip-rail";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

test("A1 the reader returns every advisor, gated on the shared read allow-list", () => {
  const svc = read("server/services/booking-actions.service.ts");
  const start = svc.indexOf("export async function listTripExpertAdvisors(");
  assert.ok(start > 0, "listTripExpertAdvisors must exist");
  const body = svc.slice(start, svc.indexOf("\n}", start));
  assert.ok(!/LIMIT\s+1/i.test(body), "the advisor reader must not LIMIT 1");
  assert.ok(!/'pending',\s*'accepted'/.test(body), "the status set must not be re-typed inline");
  assert.ok(body.includes("TRIP_ADVISOR_ACCESS_STATUSES"), "it must read the shared allow-list");
  assert.ok(/Promise<any\[\]>/.test(body), "it must return a list");
  // The singular reader is gone rather than kept beside its replacement.
  assert.ok(!/export async function getTripExpertAdvisor\(/.test(svc));
});

test("A2 the route publishes the whole list and names the pick it keeps", () => {
  const routes = read("server/routes/booking-actions.ts");
  const start = routes.indexOf("router.get('/trips/:id/expert-advisor'");
  assert.ok(start > 0);
  const handler = routes.slice(start, routes.indexOf("\n});", start));
  assert.ok(handler.includes("listTripExpertAdvisors("), "it must call the plural reader");
  assert.ok(/advisors,\s*advisor:\s*advisors\[0\]/.test(handler), "advisor stays the first of advisors");
  // The ownership gate is untouched — the widening is what is returned, never who may read it.
  assert.ok(handler.includes("isTripOwner("), "the owner gate must remain");
});

test("A3 the other-advisors line names them, counts honestly, and is silent for one", () => {
  const aya = { first_name: "Aya", last_name: "Tanaka" };
  const ben = { first_name: "Ben", last_name: "Ochoa" };
  const nameless = { first_name: null, last_name: null };

  // §13: zero or one advisor states nothing at all.
  assert.equal(slipOtherAdvisorsLine([]), null);
  assert.equal(slipOtherAdvisorsLine(undefined), null);
  assert.equal(slipOtherAdvisorsLine([aya]), null);

  assert.equal(slipOtherAdvisorsLine([aya, ben]), "Also on this plan: Ben Ochoa");
  // A nameless row is COUNTED but never given a placeholder name.
  assert.equal(slipOtherAdvisorsLine([aya, nameless]), "1 more expert on this plan");
  assert.equal(
    slipOtherAdvisorsLine([aya, ben, nameless]),
    "2 more experts on this plan, including Ben Ochoa",
  );
});
