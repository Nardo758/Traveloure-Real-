/**
 * Row P-1c — waitlist mode on the planning surfaces (ledger `2026-11-02-p1c-waitlist-save-to-plan`; Leon, Nov 2 §1:
 * "the waitlist hides paid actions (not greyed)"; Surface Map §D: "Save to plan" everywhere).
 *
 *   T1 WAITLIST_COPY passes the AI check and the site never-say list.
 *   T2 useSignupMode is fail-closed: no answer ⇒ "waitlist"; { mode: "open" } ⇒ "open".
 *   T3 waitlist: the Discover recommendation's book reads "Save to plan" and runs the add-to-plan path.
 *   T4 waitlist: the slip draws no Optimize, no "Go to checkout", no fee preview, no hold, no paid apply;
 *      "Stay here" still renders.
 *   T5 waitlist: Finalize is hidden; open: today's lanes.
 *   T6 waitlist: Trip Card items read "Saved to plan"; no Leave-by; no advisor card; partner links stay.
 *   T7 open mode: every label above is unchanged.
 *
 * Harness: react-dom/server with a seeded QueryClient where a render is cheap, source reads where the surface needs
 * the whole slip or a portal (no DOM library in the repo).
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-p1-waitlist.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { siteNeverSayHits } from "@shared/banned-copy";
import { WAITLIST_COPY } from "../../../lib/waitlist-copy";
import { signupModeFrom } from "../../../lib/signup-mode";
import { STAY_HERE_LABEL } from "../../../lib/stay-card";
import { SignInModalProvider } from "../../../contexts/SignInModalContext";
import { CityFeedCardRecommendation } from "../../city-feed-card-recommendation";

// tsx compiles JSX with the classic transform; the rendered component files rely on React in scope (the shim the
// city-feed-card-recommendation test uses).
(globalThis as any).React = React;

const ROOT = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function renderRec(mode: "open" | null): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  if (mode) qc.setQueryData(["/api/public/signup-mode"], { mode });
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/discover">
        <SignInModalProvider>
          <CityFeedCardRecommendation
            candidate={{ offeringId: "tea", categoryKey: "cultural_experiences", displayName: "Tea Ceremony Host", tagline: "A private tea ceremony", reason: "nearby", sourceType: "platform_provider" } as any}
            city="kyoto"
            position={0}
            onAdd={() => {}}
            onBook={() => {}}
          />
        </SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

describe("P-1c — waitlist mode", () => {
  it("T1 the two strings pass the AI check and the never-say list", () => {
    for (const v of Object.values(WAITLIST_COPY)) {
      assert.doesNotMatch(v, /\bAI\b/);
      assert.deepEqual(siteNeverSayHits(v), [], v);
    }
    assert.deepEqual(WAITLIST_COPY, { saveToPlan: "Save to plan", savedToPlan: "Saved to plan" });
  });

  it("T2 the mode is fail-closed", () => {
    assert.equal(signupModeFrom(undefined), "waitlist");
    assert.equal(signupModeFrom(null), "waitlist");
    assert.equal(signupModeFrom({ mode: "waitlist" }), "waitlist");
    assert.equal(signupModeFrom({ mode: "bogus" }), "waitlist");
    assert.equal(signupModeFrom({ mode: "open" }), "open");
  });

  // CAP-2 Phase 3 (sanctioned edit; ruling Nov 6): in waitlist mode the recommendation's one action is PlanActions'
  // "Browse {category}" — the same category browse — never a save and never a book.
  it("T3 waitlist: the recommendation reads 'Browse {category}', no save, no book", () => {
    const html = renderRec(null); // no answer ⇒ waitlist
    assert.doesNotMatch(html, /data-testid="btn-book-rec-0"/, "no book in waitlist mode");
    assert.doesNotMatch(html, /data-testid="btn-add-rec-0"/, "no add");
    assert.match(html, /data-testid="btn-browse-rec-0"[^>]*>Browse Tea Ceremony Host</);
    const card = read("client/src/components/city-feed-card-recommendation.tsx");
    assert.match(card, /const book = \(\) => onBook\?\.\(candidate\);/);
  });

  it("T4 waitlist: the slip hides the paid actions; Stay here stays", () => {
    const rail = read("client/src/components/plancard/SlipRail.tsx");
    assert.match(rail, /\{isOwner && !optimizerWaitlist \? \(optimizerSlot \? createPortal\(optimizerBlock, optimizerSlot\) : optimizerBlock\) : null\}/);
    // Lane 1: the finish rail returns null in waitlist, so Go to checkout is behind that hide
    // rather than a nested checkoutReady && waitlist ternary.
    const waitlistHide = rail.indexOf("if (waitlist) return null;");
    const checkoutDoor = rail.indexOf('data-testid="slip-action-go-to-checkout"');
    assert.ok(waitlistHide >= 0 && checkoutDoor > waitlistHide, "Go to checkout sits behind the waitlist hide, never shown in waitlist");
    assert.ok(!rail.includes("slip-traveler-fee-preview"), "no fee preview (removed outright by P-6)");
    assert.doesNotMatch(rail, /data-testid="slip-action-save-to-plan"/, "the write-nothing waitlist save is gone");
    assert.match(rail, /if \(waitlist\) return null;/);
    assert.match(read("client/src/components/plan/HandoffChooser.tsx"), /if \(waitlist\) return null;\n\s+return \(\n\s+<div className="space-y-3" data-testid="handoff-hold-form">/);
    assert.match(read("client/src/components/plancard/AskAiDrawer.tsx"), /const visibility = waitlist \? \{ \.\.\.railVisibility, canApply: false \} : railVisibility;/);
    assert.ok(read("client/src/components/plancard/SlipView.tsx").includes("<SaveToPlanButton testId={`item-sheet-save-to-plan-${a.id}`} />"));
    assert.match(read("client/src/components/UpsellSlot.tsx"), /\{!waitlist && \(\n\s+<button/);
    assert.match(read("client/src/components/plan/UpsellLine.tsx"), /if \(waitlist \|\| !upsellLineVisible\(line\)\) return null;/);
    assert.equal(STAY_HERE_LABEL, "Stay here");
    assert.ok(!read("client/src/components/plan/AnchorPanel.tsx").includes("useSignupMode"), "Stay here is a plan choice, untouched");
  });

  it("T5 waitlist: Finalize is hidden, never a write-nothing Save to plan lane", () => {
    const modal = read("client/src/components/plancard/FinalizeBookingModal.tsx");
    assert.match(modal, /if \(waitlist\) return null;/);
    assert.doesNotMatch(modal, /data-testid="finalize-option-save-to-plan"/);
    assert.match(modal, /data-testid="finalize-option-myself"/, "open mode keeps today's lanes");
  });

  it("T6 waitlist: the Trip Card reads 'Saved to plan', with no Leave-by and no advisor card", () => {
    const days = read("client/src/components/plancard/TripCardDays.tsx");
    assert.ok(days.includes("bookingState={waitlist ? WAITLIST_COPY.savedToPlan : slipItemBookingLine(a)}"));
    assert.ok(days.includes("isToday && upNext && !waitlist ? <LeaveByLine"));
    assert.ok(days.includes("isToday && upNext && !waitlist\n              ? (d.anchorStops ?? [])"));
    assert.ok(read("client/src/components/plancard/TripCardRail.tsx").includes("{waitlist ? null : <YourExpertCard trip={trip} advisor={advisor} />}"));
    assert.ok(read("client/src/components/plancard/BottomActionBar.tsx").includes("expertsAvailable: expertsAvailable && !paidHidden"), "CAP-1: the help door follows the capabilities answer");
    // Partner links are not purchases: the affiliate button is not gated.
    assert.ok(!read("client/src/components/plancard/AffiliateBookButton.tsx").includes("useSignupMode"));
  });

  it("T7 open mode: the recommendation books; the slip's labels are unchanged", () => {
    // CAP-2 Phase 3 (sanctioned edit): the recommendation's book is PlanActions' — a platform candidate lands on the
    // category browse, so it reads "Check availability".
    const html = renderRec("open");
    assert.match(html, /data-testid="btn-book-rec-0"[^>]*>Check availability</);
    assert.doesNotMatch(html, /data-testid="btn-browse-rec-0"/, "no browse in open mode");
    // CAP-2 Phase 2 (sanctioned edit): no Add on a recommendation in either mode.
    assert.doesNotMatch(html, /data-testid="btn-add-rec-0"/);
    const rail = read("client/src/components/plancard/SlipRail.tsx");
    assert.ok(rail.includes("Go to checkout ({checkoutReady})"));
    assert.ok(read("client/src/components/plancard/SlipView.tsx").includes(">Book</Link>"));
  });
});
