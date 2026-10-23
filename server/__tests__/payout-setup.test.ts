/**
 * Payout setup rules with no database (ledger 2026-10-23-payout-setup-server).
 *
 * Bank-like handles are rejected. A complete paypal/other method can request a payout
 * on the existing pending rail. Stripe stays blocked until the users row can be paid.
 * The mark-paid schema is untouched. Logs and generic user payloads drop the handle.
 *
 * Run: npx tsx --test server/__tests__/payout-setup.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sanitizeUserForRole } from "../utils/data-sanitizer";
import { redactLogArg } from "../infrastructure/logger";
import {
  ADMIN_PAYOUT_NOT_CREATED_MESSAGE,
  PAYOUT_NOT_STRIPE_TRANSFER_MESSAGE,
  PAYOUT_SETUP_INCOMPLETE_MESSAGE,
  STRIPE_NOT_CONNECTED_MESSAGE,
  buildPayoutSetup,
  decidePayoutRequest,
  decideStripeTransfer,
  payoutHandleLooksLikeBankOrRouting,
  usablePayoutHandle,
  validatePayoutSetupWrite,
  type PayoutFacts,
} from "../services/payout-setup";

const ROUTING = "021000021";
const ACCOUNT = "123456789012";

function facts(over: Partial<PayoutFacts> = {}): PayoutFacts {
  return {
    role: "service_provider",
    stripeAccountId: null,
    stripeAccountStatus: null,
    canReceivePayments: false,
    payoutMethodType: null,
    payoutHandle: null,
    formStripeConnectStatus: null,
    ...over,
  };
}

test("bank and routing shapes are rejected; a PayPal email or username is not", () => {
  const rejected = [
    ROUTING,
    "123456789",
    ACCOUNT,
    "12-34-56",
    "1234 5678 9012",
    "GB82WEST12345698765432",
    "GB82 WEST 1234 5698 7654 32",
    "sort code 12-34-56",
    "routing 021000021",
    "account 123456789",
    "acct 12345678",
    "IBAN GB82WEST12345698765432",
    "123456789@paypal.com",
  ];
  for (const value of rejected) {
    assert.equal(payoutHandleLooksLikeBankOrRouting(value), true, value);
    assert.equal(usablePayoutHandle(value), null, value);
    const write = validatePayoutSetupWrite({ payoutMethodType: "paypal", payoutHandle: value });
    assert.equal(write.ok, false);
    if (!write.ok) {
      assert.equal(write.error, "payout_handle_rejected");
      assert.equal(write.message.includes(value), false);
      assert.equal(write.message.includes(ROUTING), false);
    }
  }
  for (const value of ["user42@paypal.com", "traveler2026", "paypal.me/ada", "user_42"]) {
    assert.equal(payoutHandleLooksLikeBankOrRouting(value), false, value);
    assert.equal(usablePayoutHandle(value), value, value);
  }
  assert.equal(payoutHandleLooksLikeBankOrRouting("12345"), false);
  assert.equal(validatePayoutSetupWrite({ payoutMethodType: "other", payoutHandle: "  user42@paypal.com " }).ok, true);
});

test("stripe_connect stores no handle, and a body cannot name another user", () => {
  const stripe = validatePayoutSetupWrite({ payoutMethodType: "stripe_connect", payoutHandle: null });
  assert.deepEqual(stripe, { ok: true, payoutMethodType: "stripe_connect", payoutHandle: null });
  const withHandle = validatePayoutSetupWrite({ payoutMethodType: "stripe_connect", payoutHandle: "user42@paypal.com" });
  assert.equal(withHandle.ok, false);
  if (!withHandle.ok) assert.equal(withHandle.error, "payout_handle_not_allowed");
  const empty = validatePayoutSetupWrite({ payoutMethodType: "paypal", payoutHandle: "  " });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error, "payout_handle_required");
  const otherUser = validatePayoutSetupWrite({
    payoutMethodType: "paypal",
    payoutHandle: "user42@paypal.com",
    userId: "someone-else",
    amountCents: 100,
  });
  assert.equal(otherUser.ok, false);
  if (!otherUser.ok) {
    assert.equal(otherUser.error, "invalid_payout_setup");
    assert.equal(otherUser.message.includes("someone-else"), false);
  }
  const numeric = validatePayoutSetupWrite({ payoutMethodType: "paypal", payoutHandle: 123456789 });
  assert.equal(numeric.ok, false);
  if (!numeric.ok) assert.equal(numeric.error, "invalid_payout_setup");
});

test("setup complete is Connect for an unset method, and a usable handle for paypal or other", () => {
  const providerBare = buildPayoutSetup(facts(), "provider");
  assert.equal(providerBare.setupComplete, false);
  assert.equal(providerBare.connectSource, "users");
  const providerStripe = buildPayoutSetup(facts({
    stripeAccountId: "acct_test_ps",
    stripeAccountStatus: "active",
    canReceivePayments: true,
  }), "provider");
  assert.equal(providerStripe.setupComplete, true);
  assert.equal(providerStripe.stripeTransferReady, true);
  const paypal = buildPayoutSetup(facts({
    payoutMethodType: "paypal",
    payoutHandle: "user42@paypal.com",
  }), "provider");
  assert.equal(paypal.setupComplete, true);
  assert.equal(paypal.payoutHandle, "user42@paypal.com");
  assert.equal(paypal.stripeTransferReady, false);
  const bankStored = buildPayoutSetup(facts({
    payoutMethodType: "other",
    payoutHandle: ROUTING,
  }), "provider");
  assert.equal(bankStored.setupComplete, false);
  assert.equal(bankStored.payoutHandle, null);
  assert.equal(bankStored.payoutHandlePresent, true);
  assert.equal(bankStored.payoutHandleAccepted, false);
  assert.equal(JSON.stringify(bankStored).includes(ROUTING), false);
  const expertForm = buildPayoutSetup(facts({
    role: "travel_expert",
    formStripeConnectStatus: "complete",
  }), "expert");
  assert.equal(expertForm.setupComplete, true);
  assert.equal(expertForm.connectSource, "local_expert_forms");
  assert.equal(expertForm.connectStatus, "complete");
  assert.equal(expertForm.stripeTransferReady, false);
  const expertUsersOnly = buildPayoutSetup(facts({
    role: "travel_expert",
    formStripeConnectStatus: "not_started",
    stripeAccountId: "acct_test_ps",
    canReceivePayments: true,
  }), "expert");
  assert.equal(expertUsersOnly.setupComplete, false);
  const unknown = buildPayoutSetup(facts({ payoutMethodType: "wire", payoutHandle: "user42@paypal.com" }), "provider");
  assert.equal(unknown.setupComplete, false);
  assert.equal(unknown.payoutMethodType, null);
});

test("request and transfer decisions hold payouts until setup is complete", () => {
  const bare = decidePayoutRequest(facts());
  assert.deepEqual(bare, { action: "block", error: "stripe_not_connected", message: STRIPE_NOT_CONNECTED_MESSAGE });
  const paypal = decidePayoutRequest(facts({ payoutMethodType: "paypal", payoutHandle: "user42@paypal.com" }));
  assert.deepEqual(paypal, { action: "proceed", rail: "external" });
  const expertOpen = decidePayoutRequest(facts({
    role: "travel_expert",
    formStripeConnectStatus: "not_started",
    stripeAccountId: "acct_test_ps",
    canReceivePayments: true,
  }));
  assert.equal(expertOpen.action, "block");
  if (expertOpen.action === "block") {
    assert.equal(expertOpen.error, "payout_setup_incomplete");
    assert.equal(expertOpen.message, PAYOUT_SETUP_INCOMPLETE_MESSAGE);
  }
  const expertFormOnly = decidePayoutRequest(facts({
    role: "travel_expert",
    formStripeConnectStatus: "complete",
  }));
  assert.equal(expertFormOnly.action, "block");
  if (expertFormOnly.action === "block") assert.equal(expertFormOnly.error, "stripe_not_connected");
  const ready = decidePayoutRequest(facts({
    stripeAccountId: "acct_test_ps",
    canReceivePayments: true,
  }));
  assert.deepEqual(ready, { action: "proceed", rail: "stripe_connect" });

  assert.equal(decideStripeTransfer(facts(), "provider").action, "block");
  const external = decideStripeTransfer(facts({
    payoutMethodType: "other",
    payoutHandle: "desk-user",
  }), "provider");
  assert.deepEqual(external, {
    action: "block",
    error: "payout_not_stripe_transfer",
    message: PAYOUT_NOT_STRIPE_TRANSFER_MESSAGE,
  });
  assert.deepEqual(decideStripeTransfer(facts({
    stripeAccountId: "acct_test_ps",
    canReceivePayments: true,
  }), "provider"), { action: "transfer" });
  assert.equal(ADMIN_PAYOUT_NOT_CREATED_MESSAGE.includes("021"), false);
});

test("generic user payloads and logs do not carry a payout handle", () => {
  const row = { id: "u1", email: "a@example.test", role: "admin", payoutHandle: ROUTING, payout_handle: ACCOUNT };
  for (const own of [true, false]) {
    const safe = sanitizeUserForRole(row, "admin", own);
    const encoded = JSON.stringify(safe);
    assert.equal("payoutHandle" in safe, false);
    assert.equal("payout_handle" in safe, false);
    assert.equal(encoded.includes(ROUTING), false);
    assert.equal(encoded.includes(ACCOUNT), false);
  }
  const nested = redactLogArg({ req: { body: { payoutHandle: ROUTING, payout_handle: ACCOUNT, ok: true } } }) as any;
  assert.equal(nested.req.body.payoutHandle, "[REDACTED]");
  assert.equal(nested.req.body.payout_handle, "[REDACTED]");
  assert.equal(nested.req.body.ok, true);
  assert.equal(JSON.stringify(nested).includes(ROUTING), false);
  const line = String(redactLogArg(`save {"payoutHandle":"${ROUTING}"} payout_handle=${ACCOUNT}`));
  assert.equal(line.includes(ROUTING), false);
  assert.equal(line.includes(ACCOUNT), false);
  const err = redactLogArg(new Error(`payoutHandle=${ROUTING}`)) as Error;
  assert.equal(err.message.includes(ROUTING), false);
});

test("mark-paid schema is unchanged and the expert Connect duplicate is recorded as a follow-up", () => {
  const admin = fs.readFileSync(path.resolve("server/services/payout-admin.service.ts"), "utf8");
  const start = admin.indexOf("export const markPaidBodySchema");
  const slice = admin.slice(start, admin.indexOf("export type EarnerType", start));
  assert.match(slice, /requesterType: z\.enum\(\["expert", "provider"\]\)/);
  assert.match(slice, /method: z\.string\(\)\.max\(50\)\.optional\(\)/);
  assert.match(slice, /notes: z\.string\(\)\.max\(2000\)\.optional\(\)/);
  assert.match(slice, /\.strict\(\)/);
  assert.equal(slice.includes("amountCents"), false);
  assert.equal(slice.includes("reference"), false);
  assert.equal(slice.includes("payoutHandle"), false);
  const meta = admin.slice(admin.indexOf("metadata: {"), admin.indexOf("emailSent: false"));
  assert.equal(meta.includes("payoutHandle"), false);
  assert.equal(meta.includes("payout_handle"), false);

  const decision = fs.readFileSync(path.resolve("docs/decisions/pending/2026-10-23-payout-setup-server.md"), "utf8");
  assert.match(decision, /\*\*R\? —/);
  assert.match(decision, /numeric citation R\?/);
  assert.match(decision, /Migration 408 SQL approved — Leon/);
  assert.match(decision, /FOLLOW-UP/);
  assert.match(decision, /local_expert_forms/);
  assert.equal(decision.includes("| amountCents"), false);
});
