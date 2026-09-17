/**
 * THE ACCEPTANCE AND COMPLETION PANELS, RENDERED — one proof per state row, one per audience.
 *
 * Ledger `2026-09-17-surfaces-acceptance-completion`; CLAUDE.md Locked Decision 46 and Locked
 * Decision 47. The unit suite beside this one (`client/src/lib/__tests__/booking-lifecycle.test.ts`)
 * proves the DERIVATIONS; these prove that what the derivation says is actually what reaches the
 * DOM — which is the half that has historically gone wrong on this codebase (a rail that landed with
 * no surface reads exactly like a surface that renders the wrong state).
 *
 * What these hold:
 *   P1  DELIVERED — the date is named, and it is the server's.
 *   P2  ASKED — accept and request-revision are both drawn, the window's remaining time comes from
 *       the server's own deadline, and the revision button states the LIVE allowance.
 *   P3  REVISION REQUESTED — the traveler's own words come back, with the ask date; no accept button.
 *   P4  ACCEPTED — the acceptance date is named and no control is offered twice.
 *   P5  ESCALATED — the row says it is with our team and the word "refunded" appears only inside the
 *       sentence that says none was issued. No accept button.
 *   P6  NO ACCEPTANCE AFFORDANCE — the whole panel is absent from the DOM (§13: not an empty card).
 *   P7  NO DELIVERY INSTANT — the honest "on no clock" sentence, and no date anywhere.
 *   P8  DECLARED — "declared this complete on <date>" plus the server's window close, and the
 *       dispute affordance. The word "completed" is never used as this booking's own state.
 *   P9  AUDIENCE — a seller and a stranger looking at the traveler panel render NOTHING, and an
 *       owner looking at the seller panel renders NOTHING.
 *   P10 THE SELLER'S CONTROL — drawn on `confirmed`, replaced by the window read-out once declared,
 *       and replaced by "Completed" once the window has closed.
 *
 * Harness: react-dom/server renderToString, the DB-free / no-jsdom posture of
 * `moments-callout.test.tsx` — real components, a real QueryClientProvider, no network.
 *
 * Run: npx tsx --test client/src/components/__tests__/booking-lifecycle-panels.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BookingAcceptancePanel } from "../bookings/BookingAcceptancePanel";
import { SellerCompletionPanel } from "../bookings/SellerCompletionPanel";
import { ACCEPTANCE_WINDOW_ELAPSED_REASON, type LifecycleBooking } from "@/lib/booking-lifecycle";

// tsconfig sets `jsx: "preserve"`, so under `tsx --test` JSX compiles to the CLASSIC
// `React.createElement` transform and every rendered component file needs React in scope.
(globalThis as any).React = React;

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const ARTIFACT = (over: Partial<LifecycleBooking> = {}): LifecycleBooking => ({
  id: "bk_1",
  status: "awaiting_acceptance",
  acceptance: {
    mode: "gates_completion",
    deliveredAt: "2026-09-10T09:00:00.000Z",
    hasBookingDeliverable: true,
    // Far future so the "N days left" arm is exercised deterministically wherever this runs.
    acceptanceDeadline: "2099-01-08T09:00:00.000Z",
    revisionsIncluded: 2,
    revisionsUsed: 0,
    revisionsRemaining: 2,
  },
  ...over,
});

const traveler = (b: LifecycleBooking, audience: "owner" | "seller" | "other" = "owner") =>
  render(<BookingAcceptancePanel booking={b} audience={audience} />);

const seller = (b: LifecycleBooking, audience: "owner" | "seller" | "other" = "seller") =>
  render(<SellerCompletionPanel booking={b} audience={audience} role="provider" />);

describe("traveler panel — one proof per state row", () => {
  it("P1 DELIVERED names the delivery date the server sent", () => {
    const html = traveler(ARTIFACT({ status: "confirmed" }));
    assert.match(html, /acceptance-delivered-bk_1/);
    // React SSR splits adjacent text nodes with an `<!-- -->` marker; the assertion tolerates it
    // rather than pinning React's serialiser.
    assert.match(html, /Delivered on (<!-- -->)?Sep 10, 2026/);
    assert.match(html, /delivered/i);
  });

  it("P2 ASKED draws both controls, the server's window and the live allowance", () => {
    const html = traveler(ARTIFACT());
    assert.match(html, /button-accept-deliverable-bk_1/);
    assert.match(html, /button-request-revision-bk_1/);
    assert.match(html, /acceptance-window-bk_1/);
    assert.match(html, /window closes Jan 8, 2099/);
    assert.match(html, /\(2 left\)/, "the NUMBER is the listing's live allowance");
  });

  it("P3 REVISION REQUESTED replays the traveler's own words and offers no accept", () => {
    const html = traveler(
      ARTIFACT({
        status: "revision_requested",
        acceptance: {
          mode: "gates_completion",
          deliveredAt: "2026-09-10T09:00:00.000Z",
          hasBookingDeliverable: true,
          revisionsIncluded: 2,
          revisionsUsed: 1,
          revisionsRemaining: 1,
          revisions: [
            { position: 1, note: "Please add the Gion walk", requestedAt: "2026-09-11T10:00:00.000Z", resolvedAt: null },
          ],
        },
      }),
    );
    assert.match(html, /revisions-bk_1/);
    assert.match(html, /Please add the Gion walk/);
    assert.match(html, /Sep 11, 2026/);
    assert.doesNotMatch(html, /button-accept-deliverable-bk_1/);
  });

  it("P3 a revision with NO note renders its dates and nothing in its place (§13)", () => {
    const html = traveler(
      ARTIFACT({
        status: "revision_requested",
        acceptance: {
          mode: "gates_completion",
          hasBookingDeliverable: true,
          revisions: [{ position: 1, note: null, requestedAt: "2026-09-11T10:00:00.000Z", resolvedAt: "2026-09-12T10:00:00.000Z" }],
        },
      }),
    );
    assert.match(html, /revision-bk_1-1/);
    assert.match(html, /re-delivered Sep 12, 2026/);
    assert.doesNotMatch(html, /“”/, "no empty quotation the traveler never wrote");
  });

  it("P4 ACCEPTED names the date and offers no control", () => {
    const html = traveler(
      ARTIFACT({
        status: "completed",
        acceptance: { mode: "gates_completion", hasBookingDeliverable: true, acceptedAt: "2026-09-12T08:00:00.000Z" },
      }),
    );
    assert.match(html, /Accepted on (<!-- -->)?Sep 12, 2026/);
    assert.doesNotMatch(html, /button-accept-deliverable-bk_1/);
    assert.doesNotMatch(html, /button-request-revision-bk_1/);
  });

  it("P5 ESCALATED says it is with our team and issues no refund claim", () => {
    const html = traveler(
      ARTIFACT({ status: "disputed", bookingMetadata: { systemDisputeReason: ACCEPTANCE_WINDOW_ELAPSED_REASON } }),
    );
    assert.match(html, /data-stage="escalated"/);
    assert.match(html, /with our team/i);
    assert.match(html, /no refund has been issued/i);
    assert.doesNotMatch(html, /button-accept-deliverable-bk_1/);
  });

  it("P6 a listing that takes NO acceptance renders no panel at all", () => {
    const html = traveler({ id: "bk_1", status: "confirmed" });
    assert.equal(html, "", "§13 — nothing, not an empty card");
  });

  it("P7 NO DELIVERY INSTANT says so, and shows no date", () => {
    const html = traveler(
      ARTIFACT({
        status: "confirmed",
        acceptance: { mode: "gates_completion", hasBookingDeliverable: false, deliveryTimestampMissing: true },
      }),
    );
    assert.match(html, /acceptance-no-clock-bk_1/);
    // The copy is apostrophised, and SSR escapes it — match the unambiguous tail.
    assert.match(html, /on an acceptance clock/i);
    assert.doesNotMatch(html, /Delivered on/);
    assert.doesNotMatch(html, /window closes/);
  });

  it("P8 DECLARED names the declaration and the server's window close, never 'completed'", () => {
    const html = traveler({
      id: "bk_1",
      status: "completion_declared",
      completionDeclaration: {
        declaredAt: "2026-09-10T00:00:00.000Z",
        disputeBy: "2099-01-08T00:00:00.000Z",
        windowDays: 7,
      },
    });
    assert.match(html, /declaration-bk_1/);
    assert.match(html, /declared this complete on Sep 10, 2026/);
    assert.match(html, /review window closes Jan 8, 2099/);
    assert.match(html, /button-dispute-declared-bk_1/);
    assert.doesNotMatch(html, /\bcompleted\.\s*</i, "the word is not this booking's own state yet");
  });
});

describe("panels — audience", () => {
  it("P9 a seller and a stranger see no traveler panel", () => {
    assert.equal(traveler(ARTIFACT(), "seller"), "");
    assert.equal(traveler(ARTIFACT(), "other"), "");
  });

  it("P9 an owner and a stranger see no seller panel", () => {
    assert.equal(seller({ id: "bk_1", status: "confirmed" }, "owner"), "");
    assert.equal(seller({ id: "bk_1", status: "confirmed" }, "other"), "");
  });
});

describe("seller panel — the declared-completion control (LD 47)", () => {
  it("P10 CONFIRMED draws the control and says what it starts", () => {
    const html = seller({ id: "bk_1", status: "confirmed" });
    assert.match(html, /button-declare-complete-bk_1/);
    assert.match(html, /Mark as done/);
    assert.match(html, /Nothing is paid out until it closes/);
  });

  it("P10 DECLARED replaces the control with the window's own read-out", () => {
    const html = seller({
      id: "bk_1",
      status: "completion_declared",
      completionDeclaration: { declaredAt: "2026-09-10T00:00:00.000Z", disputeBy: "2099-01-08T00:00:00.000Z", windowDays: 7 },
    });
    assert.match(html, /seller-declared-bk_1/);
    assert.match(html, /You marked this done on Sep 10, 2026/);
    assert.match(html, /review window closes Jan 8, 2099/);
    assert.doesNotMatch(html, /button-declare-complete-bk_1/);
  });

  it("P10 COMPLETED is the window's word, and offers nothing", () => {
    const html = seller({ id: "bk_1", status: "completed" });
    assert.match(html, /seller-completed-bk_1/);
    assert.match(html, /Completed\./);
    assert.doesNotMatch(html, /button-declare-complete-bk_1/);
  });

  it("P10 a state the rail would refuse draws no control at all", () => {
    for (const status of ["payment_pending", "awaiting_acceptance", "disputed", "refunded", "cancelled"]) {
      assert.equal(seller({ id: "bk_1", status }), "", status);
    }
  });
});
