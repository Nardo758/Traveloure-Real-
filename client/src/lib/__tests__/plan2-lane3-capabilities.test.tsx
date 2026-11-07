/**
 * PLAN-2 lane 3 (DeepSeek report finding #2; canvas D1/D4): CAP-1's four unread actions are read, the
 * expert door follows approved supply, and the waitlist chooser/quote are hidden, never greyed.
 *
 *   C1 optimize / ask / concierge / handoffBook are fail-closed (no answer, "no", "waitlist" ⇒ hidden)
 *   C2 each of the four is read at its surface (slip Optimize, Ask AI, the card's task log, the chooser's book)
 *   C3 the waitlist handoff chooser is not drawn, and the quote endpoint refuses in waitlist mode
 *   C4 the expert door on the slip needs approved supply as well as an attached-advisor answer
 *   C5 waitlist hides the empty-start "Hand it to a local…" button, never greys it
 *
 * Source-level where the surface is a React component; the pure readers are asserted as values.
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan2-lane3-capabilities.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { optimizeShown, askShown, conciergeShown, handoffBookShown } from "../trip-capabilities";

const read = (p: string) => fs.readFileSync(p, "utf8");
const caps = (actions: Record<string, string>) => ({ actions } as any);

describe("PLAN-2 lane 3 — capability wiring", () => {
  it("C1 the four readers are fail-closed", () => {
    assert.equal(optimizeShown(undefined), false);
    assert.equal(optimizeShown(caps({ optimize: "no" })), false);
    assert.equal(optimizeShown(caps({ optimize: "waitlist" })), false);
    assert.equal(optimizeShown(caps({ optimize: "free" })), true);
    assert.equal(optimizeShown(caps({ optimize: "verify" })), true);

    assert.equal(askShown(undefined), false);
    assert.equal(askShown(caps({ ask: "no" })), false);
    assert.equal(askShown(caps({ ask: "pay" })), true);

    assert.equal(conciergeShown(undefined), false);
    assert.equal(conciergeShown(caps({ concierge: "no" })), false);
    assert.equal(conciergeShown(caps({ concierge: "in_progress" })), true);

    assert.equal(handoffBookShown(undefined), false);
    assert.equal(handoffBookShown(caps({ handoffBook: "no" })), false);
    assert.equal(handoffBookShown(caps({ handoffBook: "offer" })), true);
  });

  it("C2 each action is read at its surface", () => {
    assert.match(read("client/src/components/plancard/SlipRail.tsx"), /!optimizeShown\(caps\.data\)/);
    assert.match(read("client/src/components/plancard/AskAiDrawer.tsx"), /!askShown\(caps\.data\)/);
    assert.match(read("client/src/components/plancard/TripCardConciergeTasks.tsx"), /!conciergeShown\(caps\.data\)/);
    assert.match(read("client/src/components/plan/HandoffChooser.tsx"), /handoffBookShown\(caps\.data\)/);
  });

  it("C3 waitlist hides the chooser and gates the quote", () => {
    const chooser = read("client/src/components/plan/HandoffChooser.tsx");
    assert.match(chooser, /if \(waitlist\) return null;/);
    const route = read("server/routes/handoff.routes.ts");
    const quote = route.slice(route.indexOf('router.post("/api/trips/:tripId/handoff/quote"'));
    const body = quote.slice(0, quote.indexOf("router.post(\"/api/trips/:tripId/handoff\","));
    assert.match(body, /waitlistPurchaseDecisionFor\(userId\)/);
    assert.match(body, /TRAVELER_WAITLIST/);
  });

  it("C4 the slip's expert door needs approved supply", () => {
    const view = read("client/src/components/plancard/SlipView.tsx");
    assert.match(view, /const expertDoorLive = isOwner && slipAdvisorData !== undefined && !slipAdvisorData\?\.advisor && slipExpertsAvailable;/);
  });

  it("C5 waitlist hides the empty-start handoff door, never greys it", () => {
    const empty = read("client/src/components/plan/SlipEmptyStart.tsx");
    assert.match(empty, /const waitlist = !useBookingActionsShown\(\);/);
    assert.match(empty, /expertsAvailable && !waitlist \? \(/);
    assert.match(empty, /data-testid="slip-empty-handoff"/);
    assert.doesNotMatch(empty, /disabled=\{[^}]*waitlist/);
  });
});
