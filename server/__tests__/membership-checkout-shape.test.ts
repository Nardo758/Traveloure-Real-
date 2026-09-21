/**
 * membership-checkout-shape.test.ts — ledger `2026-09-21-membership-checkout`, increment 2.
 *
 * The success path cannot be exercised in CI: it needs a live Stripe key and would create a real
 * subscription in a real account. So the invariants that only the success path exhibits are pinned
 * here by reading the source — the same posture `payment-method-posture.test.ts` takes, and for
 * the same reason.
 *
 * S2 IS THE ONE THAT EARNS THIS FILE. Increment 1's writer reads `metadata.userId` /
 * `metadata.planKey` off the SUBSCRIPTION, and Stripe does NOT copy Checkout Session metadata onto
 * the subscription it creates. A rail that stamped only session-level metadata would leave the
 * writer with an empty `metadataUserId`, fall through to the customer lookup, and — for any member
 * whose `users.stripe_customer_id` was not already stamped — write NOTHING AT ALL, with no error
 * anywhere. The member would be charged by Stripe and hold no entitlement. Nothing else in this
 * lane fails that quietly, and no DB test can catch it, because the DB test never reaches Stripe.
 *
 * NEGATIVE SPACE — read this before trusting a green result:
 *   • It is a SOURCE check, not a runtime one. It proves the parameter is WRITTEN; it cannot prove
 *     Stripe accepted it, nor that a real webhook then resolved the user.
 *   • It says nothing about whether the Price id is correct — that is the resolver's own pure
 *     suite (`plan-price-resolver.test.ts`), which does prove the mode rule exhaustively.
 *   • The card-pin and the LD 43 audit note are NOT re-asserted here: `payment-method-posture`'s
 *     A7 censuses every Checkout Session site including this one. A second copy of that assertion
 *     would be the drift §18 rule 1 names.
 *
 * Run: npx tsx --test server/__tests__/membership-checkout-shape.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAIL = readFileSync(
  join(ROOT, "server", "services", "membership-checkout.service.ts"),
  "utf-8",
);
const WRITER = readFileSync(
  join(ROOT, "server", "services", "plan-membership-writer.service.ts"),
  "utf-8",
);

/**
 * CODE ONLY — block and line comments removed.
 *
 * Load-bearing, and it is why S4/S5 are trustworthy: this file's prose legitimately CONTAINS the
 * very tokens those assertions forbid (`currency`, `priceCents`, `getUserId(req)`), because the
 * rail documents what it deliberately does NOT do. Scanning raw source made both assertions fail
 * against correct code. An assertion about code must read code.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const RAIL_CODE = codeOnly(RAIL);

test("S1: the rail creates a SUBSCRIPTION session, not a one-off payment", () => {
  assert.match(RAIL, /mode:\s*["']subscription["']/);
  assert.doesNotMatch(RAIL, /mode:\s*["']payment["']/);
});

test("S2: the member metadata is on subscription_data, which is what the writer reads", () => {
  // The block must exist at all...
  assert.match(
    RAIL,
    /subscription_data:\s*\{[\s\S]{0,200}?metadata:\s*\{[^}]*\}/,
    "no subscription_data.metadata block — the webhook would resolve no user",
  );
  // ...and carry BOTH keys the writer looks for.
  const subBlock = RAIL.match(/subscription_data:\s*\{[\s\S]*?\n      \},/)?.[0] ?? "";
  assert.ok(subBlock.includes("userId"), "subscription_data.metadata is missing userId");
  assert.ok(subBlock.includes("planKey"), "subscription_data.metadata is missing planKey");

  // THE CONTRACT, asserted across the two files rather than assumed: the writer really does read
  // these two names. If increment 1 ever renames them, this fails here instead of in production.
  assert.match(WRITER, /metadataUserId/, "writer no longer reads a userId from metadata");
  assert.match(WRITER, /metadataPlanKey/, "writer no longer reads a planKey from metadata");
  assert.match(
    WRITER,
    /facts\.metadataUserId/,
    "writer's user resolution no longer consults subscription metadata",
  );
});

test("S3: §15 — no Stripe idempotency key on this session create, matching the house convention", () => {
  // Deliberate and documented: a session moves no money, the subscription is idempotent one layer
  // down, and a reused key would return an EXPIRED session to a returning member. The absence is
  // pinned so it stays a decision rather than becoming an oversight someone "fixes" both ways.
  assert.doesNotMatch(RAIL_CODE, /idempotencyKey/);
  assert.match(RAIL, /WHY THERE IS NO STRIPE IDEMPOTENCY KEY HERE/);
});

test("S4: §14 — the rail states no amount, and reads none from the plan row", () => {
  // The Stripe Price is the authority. `plans.price_cents` is the DISPLAYED figure and must not
  // reach this rail; a `unit_amount` or `price_data` here would be us restating a price.
  assert.doesNotMatch(RAIL_CODE, /unit_amount/);
  assert.doesNotMatch(RAIL_CODE, /price_data/);
  assert.doesNotMatch(RAIL_CODE, /priceCents/);
  assert.doesNotMatch(RAIL_CODE, /currency/);
  // The line item names a Price id and a quantity, and nothing else.
  assert.match(RAIL_CODE, /line_items:\s*\[\{\s*price:\s*price\.priceId,\s*quantity:\s*1\s*\}\]/);
});

test("S5: §14 — no identity reaches the rail from a request body", () => {
  assert.doesNotMatch(RAIL_CODE, /req\.body/);
  assert.doesNotMatch(RAIL_CODE, /\breq\b/);
});
