/**
 * §23 / ruling 112 Q8 — THE EDIT-SPLIT PANEL MAY NOT UNDER-STATE THE REVIEW LANE.
 *
 * `shared/edit-split.ts` is the ONE authored statement of which fields on an APPROVED listing
 * re-enter review. Two consumers read it, and that is the whole point of the module:
 *   - the PATCH handler imports `IDENTITY_EDIT_FIELDS` and stages exactly those into
 *     `pending_changes` (so the module IS the server's predicate, by construction);
 *   - `ServiceForm`'s "Editing a live listing" panel renders `IDENTITY_EDIT_LANE` and
 *     `SAFE_EDIT_LANE_LABELS`, so the provider is TOLD the split before editing (S-1).
 *
 * The module's own comment promised that a field added to `IDENTITY_EDIT_FIELDS` without a
 * display home "fails at type/test time rather than silently rendering a panel that under-states
 * the review lane". `IDENTITY_EDIT_LANE_COVERAGE` was exported for exactly that — AND READ BY
 * NOTHING. This file is that missing assertion.
 *
 * Why it matters, concretely: the failure is a §13 falsehood on the one surface built to prevent
 * one. A field present in the server's list but absent from the panel means the provider reads
 * "goes live immediately" for an edit the server will actually hold for re-review — on a LIVE,
 * bookable listing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  IDENTITY_EDIT_FIELDS,
  IDENTITY_EDIT_LANE,
  IDENTITY_EDIT_LANE_COVERAGE,
  SAFE_EDIT_LANE_LABELS,
  type IdentityEditField,
} from "../edit-split";

test("every identity field the SERVER stages has a display home in the panel", () => {
  const missing = IDENTITY_EDIT_FIELDS.filter((f) => !IDENTITY_EDIT_LANE_COVERAGE.has(f));
  assert.deepEqual(
    missing,
    [],
    `these fields re-enter review server-side but the panel never names them, so a provider is ` +
      `told they go live immediately: ${missing.join(", ")}`,
  );
});

test("the panel names no field the server does not actually stage", () => {
  // The inverse error is just as dishonest, one direction over: a panel row for a field the
  // handler does not hold would warn a provider off an edit that in fact applies immediately.
  const serverFields = new Set<string>(IDENTITY_EDIT_FIELDS);
  const overstated = [...IDENTITY_EDIT_LANE_COVERAGE].filter((f) => !serverFields.has(f));
  assert.deepEqual(
    overstated,
    [],
    `the panel claims these re-enter review but the handler stages none of them: ${overstated.join(", ")}`,
  );
});

test("each field is claimed by exactly ONE display row", () => {
  // Two rows naming the same column is a panel that lists the same edit twice under different
  // human labels — which reads as two separate rules to the provider.
  const seen = new Map<IdentityEditField, number>();
  for (const row of IDENTITY_EDIT_LANE) {
    for (const f of row.fields) seen.set(f, (seen.get(f) ?? 0) + 1);
  }
  const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([f]) => f);
  assert.deepEqual(duplicated, [], `claimed by more than one display row: ${duplicated.join(", ")}`);
});

test("no display row is empty, and every row carries a label", () => {
  for (const row of IDENTITY_EDIT_LANE) {
    assert.ok(row.label.trim().length > 0, "a display row must carry a human label");
    assert.ok(row.fields.length > 0, `display row "${row.label}" names no column — it would render a rule nothing enforces`);
  }
});

test("the safe lane is display copy only and never names a column", () => {
  // SAFE_EDIT_LANE_LABELS is the complement in the mock's words; the server's rule is
  // "not identity ⇒ immediate". If a label ever matched a column name it would invite a reader
  // to treat this list as a second predicate beside the handler's.
  const serverFields = new Set<string>(IDENTITY_EDIT_FIELDS);
  for (const label of SAFE_EDIT_LANE_LABELS) {
    assert.ok(label.trim().length > 0, "a safe-lane label must not be blank");
    assert.ok(!serverFields.has(label), `safe-lane label "${label}" collides with an identity column name`);
  }
});
