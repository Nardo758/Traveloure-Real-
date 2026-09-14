/**
 * THE MINT BODY IS CHECKED AGAINST THE MINT SCHEMA, NOT AGAINST A MEMORY OF IT.
 * Ledger `2026-09-14-trips-mint-400`.
 *
 * WHY THIS PIN EXISTS. `POST /api/trips` parses `insertTripSchema` (`shared/routes.ts`
 * `api.trips.create.input`), and `trips.budget` is
 * `decimal("budget", { precision: 10, scale: 2 })` — which drizzle-zod declares a STRING, and
 * which the route itself then reads as one (`parseFloat(sanitizedInput.budget)`). A caller that
 * sends the obvious `budget: 3000` is answered
 * `400 {"message":"Expected string, received number"}`. That is what happened to
 * `playwright/tests/seam-cross-console.spec.ts`, and it was invisible for as long as the spec
 * was orphaned: the body LOOKS right, the column IS a number in Postgres, and nothing but a
 * live request says otherwise.
 *
 * Locked Decision 42 D12 says the schema is the mint authority and no mint may reshape what it
 * declares, so the answer is never `z.coerce` on the schema — it is the body conforming. This
 * file is the standing proof that the ONE client mint door (`buildTripMintBody`, Locked
 * Decision 32 rule 4) still conforms, and it asserts that by PARSING the real body through the
 * real schema. Nothing here restates a field list, a type or a shape: a column added to `trips`
 * tomorrow changes what this test parses against, automatically.
 *
 *   M1  The mint door's body parses clean against `insertTripSchema`.
 *   M2  Every key the mint door sends is a key the schema ADMITS — a key the schema does not
 *       carry is stripped in silence, so the traveler's answer would be dropped with no error
 *       anywhere (§13). This is the `guestCount` class the seam spec was carrying.
 *   M3  The schema is the authority on TYPE and does not coerce: a number where it declares a
 *       string is REFUSED, with the exact message the live route returned. A green M3 is what
 *       says "the 400 is the schema holding the line", not an accident of the body.
 *   M4  The mint door states no server-derived field (`marketSlug`, `timezone`) — Locked
 *       Decision 30's omissions, re-read from the schema rather than from this comment.
 *
 * Pure unit: no DOM, no DB, no fetch, no React.
 * Run: npx tsx --test client/src/lib/__tests__/trip-mint-body-schema.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTripMintBody } from "../trip-slip";
import { insertTripSchema } from "../../../../shared/schema";

const BASICS = {
  destination: "Kyoto",
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  title: "Kyoto Seam Trip",
};

/** The schema's own admitted-key set, read off the schema — never typed out here. */
function admittedKeys(): Set<string> {
  return new Set(Object.keys(insertTripSchema.shape));
}

describe("the client mint body conforms to the mint schema", () => {
  it("M1 — buildTripMintBody's body parses clean against insertTripSchema", () => {
    const parsed = insertTripSchema.safeParse(buildTripMintBody(BASICS));
    assert.equal(
      parsed.success,
      true,
      `the ONE mint door's body must satisfy the schema POST /api/trips parses; issues: ${
        parsed.success ? "" : JSON.stringify(parsed.error.issues)
      }`
    );
  });

  it("M2 — every key the mint door sends is one the schema admits (an unknown key is stripped in silence)", () => {
    const admitted = admittedKeys();
    for (const key of Object.keys(buildTripMintBody(BASICS))) {
      assert.ok(
        admitted.has(key),
        `mint body key "${key}" is not admitted by insertTripSchema — zod would strip it and the ` +
          `traveler's answer would vanish with no error (§13)`
      );
    }
  });

  it("M3 — the schema does not coerce: a number for a string-declared field is refused", () => {
    // `budget` is the instance the seam spec hit. The assertion is about the SCHEMA's posture,
    // so it reads the refusal the schema actually produces rather than asserting a literal 400.
    const withNumericBudget = { ...buildTripMintBody(BASICS), budget: 3000 } as Record<string, unknown>;
    const parsed = insertTripSchema.safeParse(withNumericBudget);
    assert.equal(parsed.success, false, "a numeric budget must NOT be coerced into the decimal column's string");
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path.join(".") === "budget");
      assert.ok(issue, `the refusal must name budget; got ${JSON.stringify(parsed.error.issues)}`);
      assert.equal(issue!.message, "Expected string, received number");
    }

    // ...and the same field as a string is admitted, so M3 is a type rule and not a ban on budgets.
    const withStringBudget = insertTripSchema.safeParse({ ...buildTripMintBody(BASICS), budget: "3000" });
    assert.equal(withStringBudget.success, true, "a string budget is what the decimal column takes");
  });

  it("M4 — the mint door states no server-derived field (Locked Decision 30)", () => {
    const body = buildTripMintBody(BASICS) as Record<string, unknown>;
    const admitted = admittedKeys();
    for (const derived of ["marketSlug", "timezone"]) {
      // Read from the schema first: these are omitted there, which is what makes them
      // server-derived. If one ever became admissible, this test says so rather than passing.
      assert.equal(admitted.has(derived), false, `${derived} must stay omitted from insertTripSchema`);
      assert.equal(derived in body, false, `the mint body must not state ${derived}`);
    }
  });
});
