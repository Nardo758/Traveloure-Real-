/**
 * Ops gap 8 (ledger `2026-10-22-admin-ops-screens`): the three /admin/system ops tabs, rendered. Seeded query data,
 * no network (react-dom/server, the `booking-lifecycle-panels` posture). Synthetic rows only.
 *
 *   OT1  email outbox: the last error is shown; Retry is drawn only on failed/dead rows; the status filter lists
 *        the four statuses with their counts
 *   OT2  out-of-band refunds: each row links to its service booking detail; the "does not move money" line is shown
 *   OT3  auto-cancel: the threshold and last run are shown; the confirm step states the dry run's count
 *   OT4  the pure rules: retryable statuses, the note minimum, the threshold range, the count sentences
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { EmailOutboxTab } from "../admin/ops/EmailOutboxTab";
import { OutOfBandRefundsTab, OUT_OF_BAND_LIST_URL } from "../admin/ops/OutOfBandRefundsTab";
import { AutoCancelTab, AUTO_CANCEL_CONFIG_URL } from "../admin/ops/AutoCancelTab";
import {
  ADMIN_OPS_COPY as T,
  autoCancelConfirmLine,
  outOfBandBookingHref,
  outOfBandNoteReady,
  outOfBandRefundedLabel,
  outboxListUrl,
  outboxRetryable,
  parseThresholdHours,
} from "@/lib/admin-ops";

(globalThis as any).React = React;

function render(node: React.ReactElement, seed: Array<[string, unknown]>): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, data] of seed) client.setQueryData([key], data);
  return renderToString(<Router ssrPath="/admin/system"><QueryClientProvider client={client}>{node}</QueryClientProvider></Router>);
}
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("ops gap 8 tabs", () => {
  it("OT1 — email outbox", () => {
    const rows = [
      { id: 101, email_type: "t", status: "dead", attempt_count: 5, max_attempts: 5, last_error: "synthetic error A", created_at: "2026-10-01T00:00:00Z" },
      { id: 102, email_type: "t", status: "failed", attempt_count: 2, max_attempts: 5, last_error: "synthetic error B", created_at: "2026-10-01T00:00:00Z" },
      { id: 103, email_type: "t", status: "sent", attempt_count: 1, max_attempts: 5, last_error: null, created_at: "2026-10-01T00:00:00Z" },
    ];
    const html = render(<EmailOutboxTab />, [
      [outboxListUrl(""), { rows, total: 3 }],
      ["/api/admin/email-outbox/summary", { dead: 1, failed: 1, sent: 1 }],
    ]);
    assert.ok(html.includes("synthetic error A") && html.includes("synthetic error B"));
    assert.ok(html.includes('data-testid="ops-outbox-retry-101"'));
    assert.ok(html.includes('data-testid="ops-outbox-retry-102"'));
    assert.equal(html.includes('data-testid="ops-outbox-retry-103"'), false);
    for (const s of ["pending", "failed", "dead", "sent"]) assert.ok(html.includes(`value="${s}"`));
    assert.ok(html.includes("3 emails"));
    const empty = render(<EmailOutboxTab initialStatus="dead" />, [[outboxListUrl("dead"), { rows: [], total: 0 }]]);
    assert.ok(empty.includes(T.outboxEmptyFiltered));
  });

  it("OT2 — out-of-band refunds", () => {
    const html = render(<OutOfBandRefundsTab />, [
      [OUT_OF_BAND_LIST_URL, { count: 2, bookings: [
        { id: "bk-a", status: "confirmed", service_name: "Synthetic A", marker: { amountCents: 500, chargeAmountCents: 2000 } },
        { id: "bk-b", status: "disputed", service_name: null, marker: null },
      ] }],
    ]);
    assert.equal(count(html, 'href="/admin/bookings/service/'), 2);
    assert.ok(html.includes('href="/admin/bookings/service/bk-a"'));
    assert.ok(html.includes("$5.00 of $20.00"));
    assert.ok(html.includes(T.refundsClearExplainer));
    assert.equal(count(html, 'data-testid="ops-out-of-band-clear-'), 2);
    const empty = render(<OutOfBandRefundsTab />, [[OUT_OF_BAND_LIST_URL, { count: 0, bookings: [] }]]);
    assert.ok(empty.includes(T.refundsEmpty));
  });

  it("OT3 — auto-cancel", () => {
    const seed: Array<[string, unknown]> = [[AUTO_CANCEL_CONFIG_URL, {
      config: { staleThresholdHours: 48 },
      lastRun: { cancelledCount: 2, ranAt: "2026-10-01T00:00:00Z" },
      isRunning: false,
    }]];
    const html = render(<AutoCancelTab />, seed);
    assert.ok(html.includes('value="48"'));
    assert.ok(html.includes("2 bookings canceled"));
    assert.ok(html.includes(T.autoRunNow));
    assert.equal(html.includes('data-testid="ops-auto-cancel-confirm"'), false, "no run without the confirm step");
    const confirm = render(<AutoCancelTab initialConfirmCount={3} />, seed);
    assert.ok(confirm.includes(autoCancelConfirmLine(3, 48)));
    assert.ok(confirm.includes(T.autoConfirmRun));
    assert.ok(confirm.includes(T.autoConfirmNotices));
  });

  it("OT4 — the pure rules", () => {
    assert.deepEqual(["pending", "failed", "dead", "sent", null].map(outboxRetryable), [false, true, true, false, false]);
    assert.equal(outboxListUrl("bogus"), "/api/admin/email-outbox");
    assert.equal(outOfBandNoteReady("   short   "), false);
    assert.equal(outOfBandNoteReady("ten chars!"), true);
    assert.equal(outOfBandBookingHref("a/b"), "/admin/bookings/service/a%2Fb");
    assert.equal(outOfBandRefundedLabel({ amountCents: 500 }), "$5.00");
    assert.equal(outOfBandRefundedLabel(null), null);
    assert.deepEqual(["0", "1", "720", "721", "abc", ""].map(parseThresholdHours), [null, 1, 720, null, null, null]);
    assert.ok(autoCancelConfirmLine(0, 48).includes("Nothing will be canceled"));
    assert.ok(autoCancelConfirmLine(1, 48).startsWith("1 booking has"));
  });
});
