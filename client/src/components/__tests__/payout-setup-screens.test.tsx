/**
 * Earner payout setup screens (ledger `2026-10-23-payout-setup-screens`; row 115), rendered with seeded data.
 *   PS1  incomplete: says payouts are held and earning continues; Stripe is the primary action; PayPal/other offered
 *   PS2  Connect started, not ready: "Continue Stripe setup"
 *   PS3  complete via Stripe; complete via PayPal names the method and the accepted handle
 *   PS4  the alternative form: method choice, a capped handle, Save disabled until a handle; no bank wording anywhere
 *   PS5  prompts: onboarding before any earning, first earning after, nothing once setup is complete
 *   PS6  the pure rules: card state, PUT body (Stripe sends no handle), the server's own refusal message as-is
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { PayoutDetailsCard } from "../payout/PayoutDetailsCard";
import { PayoutSetupPrompt } from "../payout/PayoutSetupPrompt";
import {
  PAYOUT_HANDLE_MAX,
  PAYOUT_SETUP_COPY as T,
  PAYOUT_SETUP_URL,
  payoutCardState,
  payoutPromptMoment,
  payoutSetupBlock,
  payoutSetupBody,
  serverError,
  type PayoutSetup,
} from "@/lib/payout-setup";

(globalThis as any).React = React;

const base: PayoutSetup = {
  earnerType: "expert",
  connectStatus: null,
  connectSource: "local_expert_forms",
  stripeAccountPresent: false,
  canReceivePayments: false,
  stripeTransferReady: false,
  payoutMethodType: null,
  payoutHandlePresent: false,
  payoutHandleAccepted: false,
  setupComplete: false,
  payoutHandle: null,
};
function render(node: React.ReactElement, setup: PayoutSetup) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([PAYOUT_SETUP_URL], setup);
  return renderToString(<Router ssrPath="/expert/settings"><QueryClientProvider client={client}>{node}</QueryClientProvider></Router>);
}
// renderToString escapes an apostrophe.
const esc = (t: string) => t.replace(/'/g, "&#x27;");
const noBankWords = (html: string) => assert.doesNotMatch(html, /bank|routing|IBAN|account number/i);

test("PS1 — incomplete", () => {
  const html = render(<PayoutDetailsCard />, base);
  assert.ok(html.includes('data-testid="payout-state-incomplete"'));
  assert.ok(html.includes(T.incomplete) && html.includes(esc(T.noSavedCardNeeded)));
  assert.ok(html.includes(T.stripePrimary) && html.includes(T.useAlternative));
  noBankWords(html);
});

test("PS2 — Connect started", () => {
  const html = render(<PayoutDetailsCard />, { ...base, stripeAccountPresent: true, connectStatus: "pending" });
  assert.ok(html.includes('data-testid="payout-state-connect_in_progress"') && html.includes(T.stripeContinue));
});

test("PS3 — complete", () => {
  const stripe = render(<PayoutDetailsCard />, { ...base, setupComplete: true, payoutMethodType: "stripe_connect", stripeTransferReady: true });
  assert.ok(stripe.includes(T.completeStripe) && stripe.includes(T.change));
  assert.equal(stripe.includes(T.stripePrimary), false);
  const paypal = render(<PayoutDetailsCard />, { ...base, setupComplete: true, payoutMethodType: "paypal", payoutHandlePresent: true, payoutHandleAccepted: true, payoutHandle: "synthetic@traveloure.test" });
  assert.ok(paypal.includes(T.completeHandle("PayPal", "synthetic@traveloure.test")));
});

test("PS4 — the alternative form", () => {
  const html = render(<PayoutDetailsCard initialEditing />, base);
  assert.ok(html.includes('data-testid="payout-handle-form"'));
  assert.ok(html.includes(`maxLength="${PAYOUT_HANDLE_MAX}"`));
  assert.match(html, /data-testid="button-payout-save"[^>]*disabled/);
  assert.ok(html.includes(T.fieldHandlePaypal) && html.includes(T.useStripeInstead));
  noBankWords(html);
});

test("PS5 — prompts", () => {
  assert.ok(render(<PayoutSetupPrompt hasEarnings={false} settingsHref="/expert/settings" />, base).includes('data-testid="prompt-payout-setup-onboarding"'));
  const earning = render(<PayoutSetupPrompt hasEarnings settingsHref="/expert/settings" />, base);
  assert.ok(earning.includes('data-testid="prompt-payout-setup-first_earning"') && earning.includes(T.promptEarningBody));
  assert.equal(render(<PayoutSetupPrompt hasEarnings settingsHref="/x" />, { ...base, setupComplete: true }).includes("prompt-payout-setup"), false);
  assert.equal(payoutPromptMoment(undefined, true), null);
});

test("PS6 — the pure rules", () => {
  assert.equal(payoutCardState({ ...base, setupComplete: true, payoutMethodType: "other", payoutHandle: "x" }), "complete_handle");
  assert.equal(payoutCardState({ ...base, payoutMethodType: "paypal", stripeAccountPresent: true }), "incomplete");
  assert.deepEqual(payoutSetupBody("stripe_connect", "ignored"), { payoutMethodType: "stripe_connect" });
  assert.deepEqual(payoutSetupBody("paypal", "  synthetic  "), { payoutMethodType: "paypal", payoutHandle: "synthetic" });
  const refused = new Error('400: {"error":"payout_handle_rejected","message":"Server message here."}');
  assert.equal(serverError(refused).message, "Server message here.");
  assert.equal(payoutSetupBlock(new Error('400: {"error":"payout_setup_incomplete","message":"Held as-is."}')), "Held as-is.");
  assert.equal(payoutSetupBlock(new Error('400: {"error":"stripe_not_connected","message":"Connect first."}')), "Connect first.");
  assert.equal(payoutSetupBlock(new Error('400: {"error":"below_minimum","message":"x"}')), null);
});
