/**
 * trip-pass-copy.test.ts — ledger `2026-09-21-trip-pass-revision-claim`.
 *
 * THE DEFECT THIS PINS. Trip Pass sold "one expert revision" on two live traveler-facing
 * surfaces while no code path could deliver or record one. `consumeRevision` and
 * `coversAction(tripId, "expert_revision")` had ZERO callers outside tests; the service's own
 * comment says why ("no generalized revision action exists"). The two revision rails that DO
 * exist are other products — LD 46 artifact revisions on a service booking, and the ready-made
 * purchase's own INCLUDED revision, which is already inside that listing's price, so crediting a
 * Trip Pass against it would bill the same revision twice. Locked Decision 41 (f) had already
 * ruled on this case in words: "until that lane lands, do not describe those two as enforced
 * benefits." Two surfaces described it, on a $19 product that — unlike Plus — is not gated by
 * PLUS_SALES_ENABLED and sells today.
 *
 * WHY THIS FILE SCANS SERVER SOURCE TOO. A copy pin alone would be half a guard. T4 and T5 hold
 * the server side: the Trip Pass `expert_revision` entitlement is RETIRED (decision-maker
 * ratified 2026-09-21, ledger `2026-09-21-expert-revision-retired`), so they fail if either the
 * action or its `consumeRevision` hook returns. That is not a bureaucratic pin — re-introducing
 * a Trip-Pass-funded revision means the platform paying an earner at a platform-set rate, which
 * is a money decision, and it should fail a test rather than land as a rewire.
 *
 * THE PRODUCT IS NOT WHAT WAS RETIRED, and the distinction is the whole point: a traveler paying
 * their expert for a round of changes already works today, needs nothing from the Trip Pass
 * spine, and is unaffected by every assertion here. Ruling 11 grants a `plan_work` buyer's
 * expert `accepted` WRITE access on the plan at checkout, at the expert's own listing price.
 *
 * NEGATIVE SPACE (§18d) — read before trusting a green run:
 *   • These are SOURCE scans. They prove what the files say, not what renders. A benefit line
 *     injected from a server payload or a translation file would be invisible here.
 *   • T4 counts CALL SITES of one function name. A revision product built under a different
 *     entry point (a new service, a differently-named claim) would not trip it, and the copy
 *     would stay wrongly absent rather than wrongly present — the safer of the two failures,
 *     and stated rather than implied.
 *   • Nothing here asserts the entitlement is correct, only that no surface promises it. The
 *     allowance itself is proven by `trip-entitlement.db.test.ts` TP5/TP6.
 *
 * Run: npx tsx --test client/src/lib/__tests__/trip-pass-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const PRICING = read("client", "src", "pages", "pricing.tsx");
const CARD = read("client", "src", "components", "plancard", "TripPassCard.tsx");
const GRANT = read("server", "routes", "trip-pass.routes.ts");
const ENTITLEMENT = read("server", "services", "trip-entitlement.service.ts");

/**
 * CODE ONLY — block and line comments removed. Load-bearing here for the same reason it is in
 * `membership-checkout-shape.test.ts`: both surfaces now carry a COMMENT explaining that the
 * revision claim was removed and must not return, so those comments contain the very word the
 * assertions forbid. An assertion about code must read code.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

test("T1: the pricing page promises no expert revision", () => {
  const code = codeOnly(PRICING);
  assert.doesNotMatch(
    code,
    /revision/i,
    "pricing.tsx names a revision benefit again — LD 41 (f) forbids describing `expert_revision` " +
      "as enforced until its lane lands. If that lane HAS landed, update this test deliberately.",
  );
});

test("T2: the in-product upsell card promises no expert revision", () => {
  const code = codeOnly(CARD);
  assert.doesNotMatch(
    code,
    /revision/i,
    "TripPassCard.tsx names a revision benefit again. This card sits directly above the button " +
      "that charges, so a claim here is the sharpest version of the defect.",
  );
});

test("T3: the three benefits that ARE enforced are still named on both surfaces", () => {
  // The fix must not have been a gut job: what the server really enforces
  // (optimizer_run, ai_task, traveler_service_fee) must still be sold.
  assert.match(PRICING, /Unlimited AI runs & tasks on that trip/);
  assert.match(PRICING, /No service fee on that trip's bookings/);
  assert.match(CARD, /unlimited optimizer runs \+ AI tasks · service fee waived/);
});

test("T4: the entitlement itself is RETIRED — not merely unwired", () => {
  // THIS ASSERTION CHANGED MEANING, deliberately (decision-maker ratified 2026-09-21, ledger
  // `2026-09-21-expert-revision-retired`). It used to say "consumeRevision has no production
  // caller yet", which framed the benefit as pending. It is not pending: the investigation that
  // followed found the expert-revision PRODUCT already exists — Ruling 11
  // (`plan-work-access.service.ts`) grants a `plan_work` buyer's expert `accepted` WRITE access
  // on the plan at checkout, at the EXPERT'S OWN listing price. Trip Pass could only "include"
  // that by paying an earner at a platform-set rate, which is an unratified money decision. So
  // §18c was applied and the hook was DELETED rather than left as a future maybe.
  // CODE ONLY — the header legitimately NAMES `consumeRevision` while explaining why it was
  // deleted, so scanning raw source fails against correct code. Same trap the module docstring
  // above describes; an assertion about code must read code.
  assert.doesNotMatch(
    codeOnly(ENTITLEMENT),
    /consumeRevision/,
    "consumeRevision is back. It was deleted as a hook with no consumer and no ratified funder; " +
      "re-adding it means the Trip-Pass-funded revision was ratified, which is a money decision.",
  );
  assert.doesNotMatch(
    codeOnly(ENTITLEMENT),
    /"expert_revision"/,
    "expert_revision is a TripPassAction again — see above, that is a money decision, not a rewire.",
  );
  // And the retirement is EXPLAINED where a reader will look, not merely absent.
  assert.match(ENTITLEMENT, /RETIRED FROM THIS SPINE/);
});

test("T5: the grant no longer WRITES the retired allowance, and nothing was backfilled", () => {
  // The inverse of this file's original T5, which pinned that `revisionsRemaining: 1` was still
  // written. With the entitlement retired, writing it would be state nothing consumes (§18c).
  assert.doesNotMatch(
    codeOnly(GRANT),
    /revisionsRemaining/,
    "trip-pass.routes.ts is writing revisionsRemaining again — nothing reads it since the " +
      "entitlement was retired.",
  );
  // §13 — the NO-BACKFILL half is stated where the write used to be, so a later reader knows
  // that passes sold earlier still carry the key and that this is deliberate, not a leftover.
  assert.match(GRANT, /NO BACKFILL/);
});
