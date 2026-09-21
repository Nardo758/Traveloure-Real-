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
 * WHY THIS FILE SCANS SERVER SOURCE TOO. A copy pin alone would be half a guard: it would keep
 * the claim off the page forever, including after someone legitimately BUILDS the revision
 * product, at which point the honest copy is the copy this lane removed. T4 is the inverse —
 * it fails the moment `consumeRevision` gains a production caller, and its message says to put
 * the line back. The guard is therefore about the AGREEMENT between what is sold and what is
 * enforced, in both directions, rather than about one wording.
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

test("T4: INVERSE — consumeRevision still has no production caller; if it gains one, restore the copy", () => {
  // Counted across the two files that would host a real consumption site. The definition itself
  // lives in trip-entitlement.service.ts, so that file is expected to contain the name.
  const productionCallSites = [GRANT, PRICING, CARD].filter((src) =>
    /consumeRevision\s*\(/.test(codeOnly(src)),
  );
  assert.equal(
    productionCallSites.length,
    0,
    "consumeRevision now has a caller — the expert-revision product may have been built. If so, " +
      "this test and the removed copy lines should be revisited TOGETHER: the benefit becomes " +
      "sellable again the moment something can spend it.",
  );
  // And the entitlement service still describes it as the unenforced hook.
  assert.match(ENTITLEMENT, /UNENFORCED today/, "trip-entitlement.service.ts no longer calls expert_revision unenforced");
});

test("T5: the allowance is still RECORDED at grant — we stopped advertising, not recording", () => {
  // Deleting the snapshot key would destroy the hook LD 41 (f) reserves AND silently downgrade
  // every pass already sold. Keeping it means a pass bought today is honoured if the lane lands.
  assert.match(
    codeOnly(GRANT),
    /revisionsRemaining:\s*1/,
    "trip-pass.routes.ts stopped recording revisionsRemaining — a pass sold today would then " +
      "carry no allowance to honour when the expert-revision lane ships.",
  );
});
