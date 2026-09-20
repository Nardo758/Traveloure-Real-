/**
 * LISTING PRICE GATE — the pins (ledger `2026-09-20-quote-listing-goes-live`).
 *
 * NO DATABASE IS REACHED — `listing-price-gate.ts` imports nothing, so this suite proves the
 * predicate's pure branches and the STATIC placement of its two call sites, the same posture
 * `offering-activation-gate.test.ts` takes for its own gate.
 *
 * THE DEFECT THIS FIXES: `server/routes.ts`'s POST and PATCH `/api/provider/services` handlers
 * each carried an inline "EX-2" publish gate — `!Number.isFinite(effPrice) || effPrice <= 0` —
 * with NO exemption for `priceType === "custom_quote"`. A quote-approve listing (Locked Decision
 * 49 — a custom quote is a `service_quotes` row, never a price on the listing; `priceAuthority:
 * "server_quote"` in `offering-commerce-contract.ts`) could therefore never reach `status:"active"`
 * through either route: the create/reactivate rails answered `400 PRICE_REQUIRED` before the
 * request ever reached `checkOfferingActivationGate` (which DOES already know the archetype and
 * would have let it through), and `requestQuote` refuses `listing_not_found` for any listing that
 * is not `status='active' AND approval_status='approved'`.
 *
 * P1–P3 pin the predicate itself; W1–W2 pin that BOTH routes.ts call sites actually call it
 * (§18 rule 1 — a fixed predicate nobody wires in is not a fix), and W3 pins that the OLD
 * unconditional inline check is gone from both sites.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { listingPriceGate } from "../services/listing-price-gate";

const REPO_ROOT = process.cwd();

/** Strip block and line comments so a pin never matches prose about the thing it pins. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ── P · the predicate's own branches ──────────────────────────────────────────────────────────

test("P1 · custom_quote is exempt from PRICE_REQUIRED with a null price (the defect's exact shape)", () => {
  const result = listingPriceGate({ priceType: "custom_quote", price: null });
  assert.deepEqual(result, { ok: true });
});

test("P2 · custom_quote stays exempt even carrying a positive price — the resolver imposes no value constraint on it, and this gate manufactures none either", () => {
  const result = listingPriceGate({ priceType: "custom_quote", price: "199.00" });
  assert.deepEqual(result, { ok: true });
});

test("P3 · every OTHER price type is unchanged: a null/zero/negative/non-numeric price is refused PRICE_REQUIRED", () => {
  for (const priceType of ["fixed", "hourly", "range", "per_person", "per_event", "package_tiers", null, undefined]) {
    for (const price of [null, undefined, "0", "-5", "not-a-number", ""]) {
      const result = listingPriceGate({ priceType, price });
      assert.deepEqual(
        result,
        { ok: false, code: "PRICE_REQUIRED" },
        `priceType=${String(priceType)} price=${JSON.stringify(price)} should be refused`,
      );
    }
  }
});

test("P4 · a positive price on an ordinary priceType still passes — byte-identical to the gate this replaces", () => {
  for (const priceType of ["fixed", "hourly", "range", "per_person", "per_event", "package_tiers"]) {
    assert.deepEqual(listingPriceGate({ priceType, price: "50.00" }), { ok: true });
  }
});

// ── W · the two call sites, statically ────────────────────────────────────────────────────────

test("W1 · both POST and PATCH /api/provider/services call listingPriceGate, each behind a status===\"active\" guard", () => {
  const src = stripComments(readFileSync(path.join(REPO_ROOT, "server", "routes.ts"), "utf8"));
  const needle = "listingPriceGate(";
  const sites: number[] = [];
  for (let i = src.indexOf(needle); i !== -1; i = src.indexOf(needle, i + 1)) sites.push(i);
  assert.equal(sites.length, 2, `expected exactly 2 call sites (create + update), found ${sites.length}`);
  for (const at of sites) {
    const preceding = src.slice(Math.max(0, at - 300), at);
    assert.ok(/status === "active"/.test(preceding), "a listingPriceGate call is not guarded by a transition to active");
  }
});

test("W2 · the update call site resolves priceType/price from the patch OR the stored row (never the patch alone)", () => {
  const src = stripComments(readFileSync(path.join(REPO_ROOT, "server", "routes.ts"), "utf8"));
  const at = src.indexOf("listingPriceGate(", src.indexOf("listingPriceGate(") + 1); // second occurrence
  assert.notEqual(at, -1, "expected a second listingPriceGate call site");
  const call = src.slice(at, at + 300);
  assert.ok(/ownedService\.priceType/.test(call), "update call must fall back to the stored priceType");
  assert.ok(/ownedService\.price\b/.test(call), "update call must fall back to the stored price");
});

test("W3 · the OLD unconditional inline check is gone — the \"PRICE_REQUIRED\" literal lives ONLY in the predicate module, never restated in routes.ts", () => {
  const routesSrc = stripComments(readFileSync(path.join(REPO_ROOT, "server", "routes.ts"), "utf8"));
  assert.ok(
    !routesSrc.includes('"PRICE_REQUIRED"'),
    "routes.ts must not carry its own copy of the PRICE_REQUIRED literal — it belongs to listingPriceGate's result (§18 rule 1)",
  );
  const gateSrc = stripComments(
    readFileSync(path.join(REPO_ROOT, "server", "services", "listing-price-gate.ts"), "utf8"),
  );
  assert.ok(gateSrc.includes('"PRICE_REQUIRED"'), "the predicate module is the one place the literal lives");

  // Both response bodies hand back the gate's OWN code, never a re-derived literal — the exact
  // shape that made the old gate price-type-blind (a fresh `Number(price)` check re-invented at
  // each call site, with no memory of what priceType the row carries).
  const codeSites: number[] = [];
  for (let i = routesSrc.indexOf("code: priceGate.code"); i !== -1; i = routesSrc.indexOf("code: priceGate.code", i + 1)) {
    codeSites.push(i);
  }
  assert.equal(codeSites.length, 2, `expected exactly 2 "code: priceGate.code" sites, found ${codeSites.length}`);
});
