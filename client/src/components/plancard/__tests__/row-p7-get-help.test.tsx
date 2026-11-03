/**
 * Row P-7 (ledger `2026-11-02-p7-get-help-with-this-plan`): one expert-door string, gated by
 * /api/expert-availability.
 *
 *   T1  EXPERT_DOOR_COPY: no "AI", nothing on the site-wide never-say list
 *   T2  the empty slip with no live expert: no handoff card, no "Get help with this plan"
 *   T3  the empty slip with a live expert: the card and a real button with the label
 *   T4  the bottom bar: live + no advisor → the help door (to the slip's chooser); advisor → "Message {name}";
 *       not live → neither; no "/concierge" and no useTravelerDoors in the source
 *   T5  the drafted-slip note: only for the owner, ≥1 stop, a live expert and no advisor
 *   T6  Finalize: the "Travel expert" lane is absent when no expert is live, labelled as before when one is
 *
 * Harness: react-dom/server with a seeded QueryClient (no DOM library in the repo), pure helpers, and the
 * source read with fs. Finalize renders through a Radix portal, which server rendering does not draw, so
 * T6 reads the source.
 */
import "../../__tests__/node-navigator";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { GuestTripProvider } from "@/contexts/GuestTripContext";
import { SlipEmptyStart } from "@/components/plan/SlipEmptyStart";
import { BottomActionBar } from "../BottomActionBar";
import { EXPERT_DOOR_COPY, bottomBarExpertSlot, getHelpHref, getHelpNoteShown } from "@/lib/expert-door-copy";
import { siteNeverSayHits } from "@shared/banned-copy";

(globalThis as any).React = React;

const read = (p: string) => fs.readFileSync(p, "utf8");
const BAR = read("client/src/components/plancard/BottomActionBar.tsx");
const SLIP = read("client/src/components/plancard/SlipView.tsx");
const FINALIZE = read("client/src/components/plancard/FinalizeBookingModal.tsx");
const EMPTY = read("client/src/components/plan/SlipEmptyStart.tsx");

function client(available: boolean | null): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["/api/public/signup-mode"], { mode: "open" }); // Row P-1c: the mode is explicit ("open").
  if (available !== null) qc.setQueryData(["/api/expert-availability?city=Kyoto%2C%20Japan"], { available });
  return qc;
}
function render(node: React.ReactElement, available: boolean | null): string {
  return renderToString(
    <QueryClientProvider client={client(available)}>
      <Router ssrPath="/plans/t1">
        <GuestTripProvider>{node}</GuestTripProvider>
      </Router>
    </QueryClientProvider>,
  );
}
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const TRIP = { id: "t1", destination: "Kyoto, Japan", startDate: "2027-11-08", endDate: "2027-11-10" } as any;

describe("P-7 Get help with this plan", () => {
  it("T1 the strings: no AI, nothing banned", () => {
    for (const v of Object.values(EXPERT_DOOR_COPY)) {
      assert.doesNotMatch(v, /\bAI\b/);
      assert.deepEqual(siteNeverSayHits(v), [], v);
    }
    assert.equal(EXPERT_DOOR_COPY.getHelp, "Get help with this plan");
    assert.equal(EXPERT_DOOR_COPY.draftedNote, "Want a local to check this?");
  });

  it("T2 the empty slip with no live expert draws no handoff door", () => {
    for (const available of [false, null]) {
      const html = render(<SlipEmptyStart tripId="t1" trip={TRIP} onBrowse={() => {}} />, available);
      assert.doesNotMatch(html, /data-testid="slip-empty-handoff"/);
      assert.ok(!text(html).includes(EXPERT_DOOR_COPY.getHelp));
    }
  });

  it("T3 the empty slip with a live expert: the card and a button with the label", () => {
    const html = render(<SlipEmptyStart tripId="t1" trip={TRIP} onBrowse={() => {}} />, true);
    assert.match(html, /data-testid="slip-empty-handoff"/);
    // The card is the one button (a button may not hold another); the label is drawn as a button inside it.
    const card = html.match(/<button[^>]*data-testid="slip-empty-handoff"[\s\S]*?<\/button>/)?.[0] ?? "";
    assert.match(card, /data-testid="slip-empty-get-help"[^>]*>Get help with this plan</);
    assert.match(EMPTY, /onClick=\{\(\) => openHandoffChooser\(\{\}\)\}\s+data-testid="slip-empty-handoff"/);
  });

  it("T4 the bottom bar: help door, message, or nothing", () => {
    const bar = (advisor: any) => <BottomActionBar tripId="t1" destination="Kyoto, Japan" shareToken={null as any} advisor={advisor} />;
    const live = render(bar(null), true);
    assert.match(live, /data-testid="button-bottombar-help-t1"/);
    assert.ok(text(live).includes(EXPERT_DOOR_COPY.getHelp));
    assert.match(live, /href="\/plans\/t1\?handoff=open"/);
    const withAdvisor = render(bar({ status: "accepted", first_name: "Aiko" }), true);
    assert.ok(text(withAdvisor).includes("Message Aiko"));
    assert.ok(!text(withAdvisor).includes(EXPERT_DOOR_COPY.getHelp));
    for (const available of [false, null]) {
      const off = render(bar(null), available);
      assert.doesNotMatch(off, /button-bottombar-help-t1|button-bottombar-message-t1/);
    }
    assert.deepEqual(
      [
        bottomBarExpertSlot({ hasAcceptedAdvisor: true, expertsAvailable: false }),
        bottomBarExpertSlot({ hasAcceptedAdvisor: false, expertsAvailable: true }),
        bottomBarExpertSlot({ hasAcceptedAdvisor: false, expertsAvailable: false }),
      ],
      ["message", "help", null],
    );
    assert.equal(getHelpHref("a b"), "/plans/a%20b?handoff=open");
    assert.ok(!BAR.includes("/concierge"));
    assert.doesNotMatch(BAR, /useTravelerDoors/);
  });

  it("T5 the drafted-slip note: owner, ≥1 stop, a live expert and no advisor", () => {
    const yes = { isOwner: true, itemCount: 3, expertsAvailable: true, hasAdvisor: false };
    assert.equal(getHelpNoteShown(yes), true);
    assert.equal(getHelpNoteShown({ ...yes, itemCount: 0 }), false, "an empty plan");
    assert.equal(getHelpNoteShown({ ...yes, expertsAvailable: false }), false, "no live expert");
    assert.equal(getHelpNoteShown({ ...yes, hasAdvisor: true }), false, "an advisor is on the plan");
    assert.equal(getHelpNoteShown({ ...yes, isOwner: false }), false, "not the owner");
    assert.match(
      SLIP,
      /getHelpNoteShown\(\{ isOwner, itemCount: allActivities\.length, expertsAvailable: slipExpertsAvailable, hasAdvisor \}\) \? \(\s*<div[^>]*data-testid="slip-get-help-note"/,
    );
    assert.match(SLIP, /\{EXPERT_DOOR_COPY\.draftedNote\}/);
    assert.match(SLIP, /onClick=\{\(\) => openHandoffChooser\(\{\}\)\}\s+data-testid="slip-get-help-note-button"/);
    assert.match(SLIP, /const slipExpertsAvailable = useExpertAvailability\(\{ city: data\?\.trip\?\.destination \?\? null \}\);/);
  });

  it("T6 Finalize: the expert lane only while an expert is live; the label unchanged", () => {
    assert.match(FINALIZE, /const expertsAvailable = useExpertAvailability\(\{ city: trip\.destination \}\);/);
    assert.match(
      FINALIZE,
      /const expertLane: LaneOption = \{ id: "expert", label: "Travel expert", blurb: "Reviews and refines — you book at checkout", icon: UserCheck \};[\s\S]*\.\.\.\(expertsAvailable \? \[expertLane\] : \[\]\)/,
    );
    assert.equal((FINALIZE.match(/label: "Travel expert"/g) ?? []).length, 1);
  });
});
