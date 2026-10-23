/**
 * Gap 9 screens (ledger `2026-10-22-gap9-payout-admin-screens`), rendered with seeded data and no network.
 *   G1  not-routable: names and each check's status, no email; Remind disabled with the server's cooldown end
 *   G2  provider Remind: the same shared button, disabled during cooldown; 409/429/other worded plainly
 *   G3  owed: owed, held, payouts waiting and can-receive-transfer per earner
 *   G4  mark paid: Review needs a reference; the confirm step shows amount, earner, method and reference and can be
 *       cancelled or stepped back; the body sends no amount; a success replaces the row in place
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotRoutableExpertsCard, NOT_ROUTABLE_URL } from "../admin/payout-ops/NotRoutableExpertsCard";
import { OwedEarnersCard, OWED_URL } from "../admin/payout-ops/OwedEarnersCard";
import { RemindStripeButton } from "../admin/payout-ops/RemindStripeButton";
import { MarkPaidPanel } from "../admin/payout-ops/MarkPaidDialog";
import {
  MARK_PAID_REFERENCE_MAX,
  PAYOUT_OPS_COPY as T,
  apiErrorMessage,
  cooldownActive,
  markPaidBody,
  markPaidOffered,
  payoutMethodLabel,
  referenceReady,
  remindErrorLine,
  withMarkedPaid,
} from "@/lib/payout-ops";

(globalThis as any).React = React;

function render(node: React.ReactElement, seed: Array<[unknown[], unknown]> = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [k, v] of seed) client.setQueryData(k, v);
  return renderToString(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
const FUTURE = new Date(Date.now() + 3_600_000).toISOString();
const PAST = new Date(Date.now() - 3_600_000).toISOString();

test("G1 — not-routable list", () => {
  const html = render(<NotRoutableExpertsCard />, [[[NOT_ROUTABLE_URL], { count: 2, experts: [
    { userId: "u1", role: "travel_expert", firstName: "Synthetic", lastName: "One", applicationStatus: "approved", identityVerificationStatus: "pending", stripeConnectStatus: null, reminderCooldownEndsAt: FUTURE },
    { userId: "u2", role: "travel_expert", firstName: null, lastName: null, applicationStatus: "pending", identityVerificationStatus: "verified", stripeConnectStatus: "complete", reminderCooldownEndsAt: null },
  ] }]]);
  assert.ok(html.includes("Synthetic One") && html.includes(T.unnamed));
  assert.ok(html.includes(T.notRecorded));
  assert.equal(html.includes("@"), false, "no email on the screen");
  assert.match(html, /data-testid="button-remind-expert-u1"[^>]*disabled/);
  assert.doesNotMatch(html, /data-testid="button-remind-expert-u2"[^>]*disabled/);
  assert.ok(html.includes('data-testid="remind-cooldown-u1"'));
});

test("G2 — the shared Remind button and its refusals", () => {
  const cooling = render(<RemindStripeButton kind="provider" userId="p1" cooldownEndsAt={FUTURE} listQueryKey={["x"]} testId="r" />);
  assert.match(cooling, /data-testid="r"[^>]*disabled/);
  const open = render(<RemindStripeButton kind="provider" userId="p1" cooldownEndsAt={PAST} listQueryKey={["x"]} testId="r" />);
  assert.doesNotMatch(open, /data-testid="r"[^>]*disabled/);
  assert.equal(cooldownActive(null), false);
  assert.equal(remindErrorLine(new Error('409: {"message":"x"}')), T.remind409);
  assert.equal(remindErrorLine(new Error('429: {"message":"x"}')), T.remind429);
  assert.equal(remindErrorLine(new Error("500: oops")), T.remindFailed);
});

test("G3 — owed view", () => {
  const html = render(<OwedEarnersCard />, [[[OWED_URL], { earners: [
    { earnerId: "e1", earnerType: "expert", owed: 120.5, pending: 10, available: 120.5, paidOut: 0, displayName: "Synthetic Earner", canReceiveTransfer: true, pendingPayoutCount: 2, pendingPayoutTotal: 35.5 },
    { earnerId: "e2", earnerType: "provider", owed: 5, pending: 0, available: 5, paidOut: 0, displayName: null, canReceiveTransfer: false, pendingPayoutCount: 0, pendingPayoutTotal: 0 },
  ] }]]);
  assert.ok(html.includes("Synthetic Earner") && html.includes("$120.50") && html.includes("2 · $35.50") && html.includes("None"));
  assert.ok(html.includes(T.typeExpert) && html.includes(T.typeProvider));
  assert.match(html, /data-testid="owed-transfer-e1"[^]*?Yes/);
  assert.match(html, /data-testid="owed-transfer-e2"[^]*?No/);
});

test("G4 — mark paid", () => {
  const target = { id: "po1", requesterType: "expert" as const, amount: "20.00", requesterName: "Synthetic Earner" };
  const enter = render(<MarkPaidPanel target={target} onClose={() => {}} />);
  assert.match(enter, /data-testid="mark-paid-review"[^>]*disabled/, "no reference ⇒ no review");
  assert.ok(enter.includes(T.referenceHelp) && enter.includes(`maxLength="${MARK_PAID_REFERENCE_MAX}"`));
  const confirm = render(<MarkPaidPanel target={target} onClose={() => {}} initialStep="confirm" initialMethod="wise" initialReference="Sent 10/22" />);
  for (const s of ["$20.00", "Synthetic Earner", "Wise", "Sent 10/22"]) assert.ok(confirm.includes(s), s);
  assert.ok(confirm.includes('data-testid="mark-paid-cancel"') && confirm.includes('data-testid="mark-paid-back"'));
  assert.deepEqual(Object.keys(markPaidBody("expert", "wise", " Sent 10/22 ")).sort(), ["method", "notes", "requesterType"]);
  assert.equal(markPaidBody("expert", "wise", " Sent ").notes, "Sent");
  assert.equal(referenceReady(" "), false);
  assert.equal(referenceReady("x".repeat(MARK_PAID_REFERENCE_MAX + 1)), false);
  assert.deepEqual(["pending", "approved", "processing", "completed"].map(markPaidOffered), [true, true, false, false]);
  const rows = [
    { id: "po1", requesterType: "expert", status: "approved", payoutMethod: null },
    { id: "po1", requesterType: "provider", status: "pending", payoutMethod: null },
  ];
  const next = withMarkedPaid(rows, "expert", { id: "po1", status: "completed", payoutMethod: "wise" })!;
  assert.deepEqual([next[0].status, next[0].payoutMethod, next[1].status], ["completed", "wise", "pending"]);
  assert.equal(payoutMethodLabel("external"), "Other");
  assert.equal(payoutMethodLabel("stripe"), "Stripe");
  assert.equal(apiErrorMessage(new Error('409: {"message":"Payout amount exceeds the amount owed."}')), "Payout amount exceeds the amount owed.");
});
