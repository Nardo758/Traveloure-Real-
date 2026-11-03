/**
 * CAP-1 — the first consumers of the capabilities read (ledger `2026-11-03-cap1-trip-capabilities`).
 *
 *   T8  HandoffBanner draws Approve iff `actions.handoff === "approve"`.
 *   T9  TripPassCard: offer / active / hidden by `actions.tripPass`.
 *   T10 BottomActionBar hides the paid help door unless `actions.checkout === "yes"`; Share and Maps stay.
 *
 * Harness: HandoffBanner and TripPassCard import StripeCheckout, which reads Vite's `import.meta.env` at module load
 * and cannot load under node — so their gate is the ONE pure helper each now calls (`lib/trip-capabilities.ts`), proven
 * here over every action value, and the source is pinned to call it at the gated sites. BottomActionBar renders with
 * react-dom/server and a QueryClient seeded with the capabilities answer (queries disabled — nothing is fetched).
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-cap1-consumers.test.tsx
 */
import { describe, it } from "node:test";
import "../../__tests__/node-navigator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import type { TripCapabilities } from "@shared/trip-capabilities";
import {
  handoffApproveShown,
  paidActionsShown,
  tripCapabilitiesQueryKey,
  tripPassCardView,
} from "../../../lib/trip-capabilities";
import { BottomActionBar } from "../BottomActionBar";

(globalThis as any).React = React;

const ROOT = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function caps(actions: Partial<TripCapabilities["actions"]>): TripCapabilities {
  const a = { optimize: "no", ask: "no", handoff: "no", handoffBook: "no", checkout: "no", tripPass: "no", concierge: "no", ...actions } as TripCapabilities["actions"];
  return {
    viewer: { role: "owner", canEdit: true, canPay: true, emailVerified: true },
    signup: { mode: "open", purchasesAllowed: true },
    pass: { active: false, runs: null },
    handoff: { present: false, kind: null, status: null, scopeItemIds: [], pendingSuggestions: 0, onTripSupport: "none" },
    concierge: { present: false, status: null, accessUntil: null },
    actions: a,
    reasons: Object.fromEntries(Object.keys(a).map((k) => [k, "test"])) as TripCapabilities["reasons"],
  };
}

describe("CAP-1 — consumers", () => {
  it("T8 HandoffBanner shows Approve iff actions.handoff is 'approve'", () => {
    assert.equal(handoffApproveShown(caps({ handoff: "approve" })), true);
    for (const h of ["in_progress", "offer", "verify", "no"] as const) assert.equal(handoffApproveShown(caps({ handoff: h })), false, h);
    assert.equal(handoffApproveShown(undefined), false, "no answer yet ⇒ no Approve");
    const src = read("client/src/components/plan/HandoffBanner.tsx");
    assert.ok(src.includes("const canApprove = handoffApproveShown(caps);"));
    assert.match(src, /\{canApprove \? \(\s*<div className="mt-2 space-y-2">\s*<div className="flex flex-wrap gap-2">\s*<Button size="sm" disabled=\{!!busy\} onClick=\{\(\) => act\("approve"/);
    // The footer's delivered controls (Approve, Request changes) read the same helper.
    assert.ok(src.includes("const delivered = handoffApproveShown(caps);"));
    assert.ok(!src.includes('isOwner && h.status === "delivered"'));
    assert.ok(!src.includes('const delivered = h.status === "delivered"'));
  });

  it("T9 TripPassCard: offer / active / hidden by actions.tripPass", () => {
    assert.equal(tripPassCardView(caps({ tripPass: "offer" })), "offer");
    assert.equal(tripPassCardView(caps({ tripPass: "active" })), "active");
    assert.equal(tripPassCardView(caps({ tripPass: "verify" })), "offer", "verify draws the offer; the purchase's verify prompt runs");
    for (const t of ["waitlist", "no"] as const) assert.equal(tripPassCardView(caps({ tripPass: t })), null, t);
    assert.equal(tripPassCardView(undefined), null);
    const src = read("client/src/components/plancard/TripPassCard.tsx");
    assert.ok(src.includes("const view = tripPassCardView(caps);"));
    assert.ok(src.includes("if (!view) return null;"));
    assert.ok(src.includes('if (view === "active") {'));
    assert.ok(!src.includes("status.active"), "the active face follows the capability, not the /trip-pass read");
    // The /trip-pass read stays for the price and the plan name.
    assert.match(src, /status\.priceCents/);
    assert.ok(!src.includes("useSignupMode"));
  });

  it("T10 BottomActionBar hides the paid help door unless actions.checkout is 'yes'", () => {
    assert.equal(paidActionsShown(caps({ checkout: "yes" })), true);
    assert.equal(paidActionsShown(caps({ checkout: "verify" })), true, "verify keeps the door; the verify prompt runs");
    for (const c of ["waitlist", "no"] as const) assert.equal(paidActionsShown(caps({ checkout: c })), false, c);
    const bar = (checkout: TripCapabilities["actions"]["checkout"] | null) => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
      if (checkout) qc.setQueryData(tripCapabilitiesQueryKey("t1"), caps({ checkout }));
      return renderToString(
        <QueryClientProvider client={qc}>
          <Router ssrPath="/trip/t1">
            <BottomActionBar tripId="t1" destination="Kyoto, Japan" shareToken={null} advisor={null} />
          </Router>
        </QueryClientProvider>,
      );
    };
    for (const c of ["waitlist", "no", null] as const) {
      const html = bar(c);
      assert.doesNotMatch(html, /data-testid="button-bottombar-help-t1"/, String(c));
      assert.match(html, /data-testid="button-bottombar-share-t1"/);
      assert.match(html, /data-testid="button-bottombar-maps-t1"/);
    }
    const src = read("client/src/components/plancard/BottomActionBar.tsx");
    assert.ok(src.includes("const paidHidden = !paidActionsShown(caps);"));
    assert.ok(src.includes("expertsAvailable: expertsAvailable && !paidHidden"));
    assert.ok(!src.includes("useSignupMode"));
  });
});
