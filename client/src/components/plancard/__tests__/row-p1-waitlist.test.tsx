/**
 * Row P-1c — waitlist mode on the planning surfaces (ledger `2026-11-02-p1c-waitlist-save-to-plan`; Leon, Nov 2 §1:
 * "the waitlist hides paid actions (not greyed)"; Surface Map §D: "Save to plan" everywhere).
 *
 *   T1 WAITLIST_COPY passes the AI check and the site never-say list.
 *   T2 useSignupMode is fail-closed: no answer ⇒ "waitlist"; { mode: "open" } ⇒ "open".
 *   T3 waitlist: the Discover recommendation's book reads "Save to plan" and runs the add-to-plan path.
 *   T4 waitlist: the slip draws no Optimize, no "Go to checkout", no fee preview, no hold, no paid apply;
 *      "Stay here" still renders.
 *   T5 waitlist: Finalize renders one "Save to plan" lane; open: today's lanes.
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
import { tileActionLabel } from "../../../lib/bento-action-state";
import { catalogueActionLabel } from "../../../lib/catalogue-search-copy";
import { TILE_ACTION_COPY } from "../../../lib/tile-action-copy";
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

  it("T3 waitlist: the recommendation's book reads 'Save to plan' and runs the add path", () => {
    assert.equal(tileActionLabel("recommendation", { bookable: true, waitlist: true }), "Save to plan");
    assert.equal(tileActionLabel("recommendation", { bookable: true, affiliate: true, waitlist: true }), TILE_ACTION_COPY.bookOnPartner);
    const html = renderRec(null); // no answer ⇒ waitlist
    assert.match(html, /data-testid="btn-book-rec-0"[^>]*>Save to plan</);
    assert.doesNotMatch(html, /data-testid="btn-add-rec-0"/, "one action, not two");
    const card = read("client/src/components/city-feed-card-recommendation.tsx");
    assert.match(card, /const book = \(\) => \(saveMode \? addItem\(\) : onBook\?\.\(candidate\)\);/);
    assert.ok(read("client/src/lib/catalogue-search-copy.ts").includes("opts.waitlist ? WAITLIST_COPY.saveToPlan : CATALOGUE_RESULT_COPY.book"));
  });

  it("T4 waitlist: the slip hides the paid actions; Stay here stays", () => {
    const rail = read("client/src/components/plancard/SlipRail.tsx");
    assert.match(rail, /\{isOwner && !optimizerWaitlist \? \(optimizerSlot \? createPortal\(optimizerBlock, optimizerSlot\) : optimizerBlock\) : null\}/);
    assert.match(rail, /checkoutReady > 0 && waitlist \?/);
    assert.ok(!rail.includes("slip-traveler-fee-preview"), "no fee preview (removed outright by P-6)");
    assert.match(rail, /data-testid="slip-action-save-to-plan"/);
    assert.match(read("client/src/components/plan/HandoffChooser.tsx"), /if \(waitlist\) return null;\n\s+return \(\n\s+<div className="space-y-3" data-testid="handoff-hold-form">/);
    assert.match(read("client/src/components/plancard/AskAiDrawer.tsx"), /const visibility = waitlist \? \{ \.\.\.railVisibility, canApply: false \} : railVisibility;/);
    assert.ok(read("client/src/components/plancard/SlipView.tsx").includes("<SaveToPlanButton testId={`item-sheet-save-to-plan-${a.id}`} />"));
    assert.match(read("client/src/components/UpsellSlot.tsx"), /\{!waitlist && \(\n\s+<button/);
    assert.match(read("client/src/components/plan/UpsellLine.tsx"), /if \(waitlist \|\| !upsellLineVisible\(line\)\) return null;/);
    assert.equal(STAY_HERE_LABEL, "Stay here");
    assert.ok(!read("client/src/components/plan/AnchorPanel.tsx").includes("useSignupMode"), "Stay here is a plan choice, untouched");
  });

  it("T5 waitlist: Finalize is one 'Save to plan' lane that returns to the slip", () => {
    const modal = read("client/src/components/plancard/FinalizeBookingModal.tsx");
    const waitlistBranch = modal.slice(modal.indexOf("  if (waitlist) {"), modal.indexOf("  return (\n    <Dialog open={open} onOpenChange={onOpenChange}>\n      <DialogContent className=\"sm:max-w-lg\" data-testid=\"finalize-modal\">\n        <DialogHeader>\n          <DialogTitle>You're set"));
    assert.match(waitlistBranch, /data-testid="finalize-option-save-to-plan"/);
    assert.match(waitlistBranch, /onClick=\{\(\) => onOpenChange\(false\)\}/);
    assert.doesNotMatch(waitlistBranch, /\$|finalize-option-myself|finalize-option-expert|Travel expert/);
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

  it("T7 open mode: every label is unchanged", () => {
    assert.equal(tileActionLabel("recommendation", { bookable: true }), "Book now");
    assert.equal(tileActionLabel("recommendation", { bookable: true, waitlist: false }), "Book now");
    assert.equal(catalogueActionLabel({ kind: "platform", action: { type: "book", href: "/x" } } as any), "Book");
    assert.equal(catalogueActionLabel({ kind: "platform", action: { type: "book", href: "/x" } } as any, { waitlist: false }), "Book");
    const html = renderRec("open");
    assert.match(html, /data-testid="btn-book-rec-0"[^>]*>Book now</);
    assert.match(html, /data-testid="btn-add-rec-0"/);
    const rail = read("client/src/components/plancard/SlipRail.tsx");
    assert.ok(rail.includes("Go to checkout ({checkoutReady})"));
    assert.ok(read("client/src/components/plancard/SlipView.tsx").includes(">Book</Link>"));
  });
});
