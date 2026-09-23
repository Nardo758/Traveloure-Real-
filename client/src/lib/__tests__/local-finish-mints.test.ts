/**
 * Locked Decision 42 **D5** — the "Get a local expert" finish mints a slip and forwards its id.
 *
 * D5 was ratified on 2026-09-05 and was still unbuilt on 2026-09-23: the `local` branch navigated
 * to `/experts?destination=…` with no mint and no `tripId`, so the expert-detail request CTA — which
 * requires one (Locked Decision 32 (b)) — re-opened the planning modal the traveler had just
 * finished. These pins are the two halves of the fix, and each fails on the pre-D5 behaviour:
 * dropping `local` from `BRANCHES_THAT_MINT` fails M2, and dropping the id from the href fails H3.
 *
 * PURE. No DOM, no React, no network — both halves are a constant and a pure href builder, which is
 * why they can be asserted at all.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BRANCHES_THAT_MINT, BRANCHES_THAT_REQUIRE_THE_MINT } from "../plan-steps";
import {
  EXPERTS_BROWSE_PATH,
  buildExpertsBrowseHref,
} from "../experts-browse";

test("M1: `myself` still mints — D5 adds a branch, it does not move one", () => {
  assert.ok(BRANCHES_THAT_MINT.includes("myself"));
});

test("M2: D5 — `local` mints, because no expert touchpoint exists without a slip", () => {
  assert.ok(
    BRANCHES_THAT_MINT.includes("local"),
    "the local-expert finish must mint a plan row (LD 42 D5, applying LD 32's precondition)",
  );
});

test("M3: `ai` and `occasion` do NOT mint here — they are not merely untested", () => {
  // `ai` opens the drawer on the committed plan and mints on its own rail; `occasion` goes to
  // Stripe checkout and plans nothing. Asserting their ABSENCE is what stops the set growing by
  // accident into "every branch mints", which would create rows for a checkout that never happens.
  assert.equal(BRANCHES_THAT_MINT.includes("ai"), false);
  assert.equal(BRANCHES_THAT_MINT.includes("occasion"), false);
  assert.equal(BRANCHES_THAT_MINT.length, 2);
});

test("M4: the mint is REQUIRED only for `myself` — `local`'s destination is a PUBLIC browse", () => {
  // The regression this exists for was real and CI caught it: making `local` mint ALSO made it
  // gate a guest at sign-in, because a refused mint stopped the finish before it navigated. That
  // turned /experts — a page anyone could always reach — into a sign-in wall, which no ruling
  // asked for. D5 puts the MINT behind the gate, not the browse.
  assert.ok(BRANCHES_THAT_REQUIRE_THE_MINT.includes("myself"));
  assert.equal(
    BRANCHES_THAT_REQUIRE_THE_MINT.includes("local"),
    false,
    "a guest must still reach the public expert browse; they simply arrive with no tripId",
  );
  assert.equal(BRANCHES_THAT_REQUIRE_THE_MINT.length, 1);
});

test("M5: every required branch is also a minting branch — the sets cannot drift apart", () => {
  for (const branch of BRANCHES_THAT_REQUIRE_THE_MINT) {
    assert.ok(
      BRANCHES_THAT_MINT.includes(branch),
      `${branch} requires a mint it would never attempt`,
    );
  }
});

test("H1: both fields present — the browse is addressed by destination AND plan", () => {
  const href = buildExpertsBrowseHref({ destination: "Kyoto, Japan", tripId: "trip-1" });
  const url = new URL(href, "https://example.invalid");
  assert.equal(url.pathname, EXPERTS_BROWSE_PATH);
  assert.equal(url.searchParams.get("destination"), "Kyoto, Japan");
  assert.equal(url.searchParams.get("tripId"), "trip-1");
});

test("H2: §13 — an absent or blank field is DROPPED, never sent as a placeholder", () => {
  // The failure this prevents is concrete: `?tripId=undefined` is a string the detail page would
  // carry and the server would then have to refuse. An absent param is how the browse is told
  // "not known".
  assert.equal(buildExpertsBrowseHref({}), EXPERTS_BROWSE_PATH);
  assert.equal(buildExpertsBrowseHref({ destination: "   ", tripId: "  " }), EXPERTS_BROWSE_PATH);
  assert.equal(buildExpertsBrowseHref({ destination: null, tripId: undefined }), EXPERTS_BROWSE_PATH);
  for (const href of [
    buildExpertsBrowseHref({ destination: "Kyoto" }),
    buildExpertsBrowseHref({ destination: "Kyoto", tripId: "" }),
  ]) {
    assert.equal(href.includes("tripId"), false, `a blank plan id must not appear: ${href}`);
  }
});

test("H3: D5 — a minted plan reaches the browse even when the door knew no destination", () => {
  // The mint is what this ruling adds, so the id must survive on its own. A door that held no
  // city still hands the plan over; the browse simply shows every expert.
  const href = buildExpertsBrowseHref({ destination: null, tripId: "trip-9" });
  assert.equal(new URL(href, "https://example.invalid").searchParams.get("tripId"), "trip-9");
});

test("H4: values are encoded, so a comma or space cannot split the query", () => {
  const href = buildExpertsBrowseHref({ destination: "Kyoto, Japan", tripId: "a b&c=d" });
  const url = new URL(href, "https://example.invalid");
  assert.equal(url.searchParams.get("tripId"), "a b&c=d");
  assert.equal(url.searchParams.get("destination"), "Kyoto, Japan");
});
