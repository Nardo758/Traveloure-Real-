/**
 * The two switched traveler doors on the client (ledger `2026-10-18-traveler-doors-hidden`).
 *
 * RENDERED with each switch seeded off, then on (renderToString over a seeded query cache):
 *   R1 the Trip Card's "Ask the Concierge" (ConciergeModule)            — event_concierge
 *   R2 the mobile bottom bar's "Get help" (BottomActionBar, no advisor)  — event_concierge
 *   R3 /concierge and /optimize render through EventConciergeRoute       — event_concierge
 *   R4 the leg sheet's "Book this for me" (LegSheetBody)                 — handoff_booking
 * PURE:
 *   P1 each door is open only on an explicit `true`; loading/absent/garbage is closed
 *   P2 the handoff chooser offers `book` ("Book these for me") only while handoff_booking is on
 *   P3 the dormant auth-nav "Concierge" link is drawn only while event_concierge is on
 * STRUCTURAL (the surfaces below sit inside Radix dialogs/portals or whole pages that renderToString cannot draw, so
 * the test pins that each door's JSX is conditioned on its switch):
 *   S1 the slip item sheet's "Book this for me", the handoff banner's "Hand it to our concierge" (both switches), the
 *      Finalize modal's Concierge lane, /my-events "Plan an event", /ai-assistant "Get help from our team", and the
 *      App routes for /concierge and /optimize
 *   S2 /my-events stays a plain route and its "Pay coordination fee" is not gated
 * COPY:
 *   C1 /pricing reads "They review and re-route your plan with you."; "A Traveloure booking agent handles this for
 *      you" and "Our trip planners handle all bookings" are gone; "book this on your behalf" stays
 *
 * Run: npx tsx --test client/src/components/__tests__/traveler-doors.test.tsx
 */
import "./node-navigator";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { ConciergeModule } from "../plancard/ConciergeModule";
import { BottomActionBar } from "../plancard/BottomActionBar";
import { EventConciergeRoute } from "../concierge/EventConciergeRoute";
import { LegSheetBody } from "../plan/LegSheet";
import { visibleAuthNav } from "@/lib/nav-config";
import { TRAVELER_DOORS_ROUTE, travelerDoors, offeredHandoffKinds } from "@shared/traveler-doors";
import { HANDOFF_KINDS } from "@shared/handoff";

(globalThis as any).React = React;

const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode, doors: { eventConcierge: boolean; handoffBooking: boolean }) {
  const qc = new QueryClient();
  qc.setQueryData([TRAVELER_DOORS_ROUTE], doors);
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/plans/t1">{node}</Router>
    </QueryClientProvider>,
  );
}
const OFF = { eventConcierge: false, handoffBooking: false };
const ON = { eventConcierge: true, handoffBooking: true };

describe("rendered doors", () => {
  it("R1 Ask the Concierge: absent off, present on", () => {
    assert.ok(!text(render(<ConciergeModule destination="Kyoto" />, OFF)).includes("Ask the Concierge"));
    assert.ok(text(render(<ConciergeModule destination="Kyoto" />, ON)).includes("Ask the Concierge"));
    assert.ok(!text(render(<ConciergeModule destination="Kyoto" />, { ...ON, eventConcierge: false })).includes("Ask the Concierge"));
  });

  it("R2 the bottom bar's Get help: absent off, present on", () => {
    const bar = <BottomActionBar tripId="t1" destination="Kyoto" shareToken={null as any} advisor={null} />;
    assert.ok(!text(render(bar, OFF)).includes("Get help"));
    assert.ok(render(bar, OFF).indexOf('href="/concierge"') === -1);
    assert.ok(text(render(bar, ON)).includes("Get help"));
  });

  it("R3 /concierge renders its page only while event_concierge is on", () => {
    const route = (
      <EventConciergeRoute>
        <h1>Concierge page</h1>
      </EventConciergeRoute>
    );
    assert.ok(!text(render(route, OFF)).includes("Concierge page"));
    assert.ok(text(render(route, ON)).includes("Concierge page"));
  });

  it("R4 the leg sheet's Book this for me: absent without the door, present with it", () => {
    const body = (onBookForMe: (() => void) | null) => (
      <LegSheetBody
        legId="l1"
        options={[]}
        timeZone="Asia/Tokyo"
        actions={{ canPick: false, showBook: true, showHostPickup: false }}
        picking={false}
        onPick={() => {}}
        asking={false}
        paused={false}
        unavailable={false}
        findDriverHref="/services"
        onBookForMe={onBookForMe}
      />
    );
    assert.ok(!text(render(body(null), OFF)).includes("Book this for me"));
    const on = text(render(body(() => {}), ON));
    assert.ok(on.includes("Find a driver"), "the leg's book tools are drawn");
    assert.ok(on.includes("Book this for me"));
  });
});

describe("pure rules", () => {
  it("P1 open only on an explicit true", () => {
    assert.deepEqual(travelerDoors({ eventConcierge: true, handoffBooking: true }), ON);
    for (const v of [undefined, null, {}, { eventConcierge: "true", handoffBooking: 1 }, "true"]) assert.deepEqual(travelerDoors(v), OFF);
  });
  it("P2 the chooser offers book only while handoff_booking is on", () => {
    assert.deepEqual(offeredHandoffKinds(HANDOFF_KINDS, { handoffBooking: false }), ["polish", "plan_all"]);
    assert.deepEqual(offeredHandoffKinds(HANDOFF_KINDS, { handoffBooking: true }), ["polish", "book", "plan_all"]);
  });
  it("P3 the dormant Concierge nav link follows event_concierge", () => {
    assert.ok(!visibleAuthNav(OFF).some((i) => i.href === "/concierge"));
    assert.ok(visibleAuthNav(ON).some((i) => i.href === "/concierge"));
    assert.ok(visibleAuthNav(OFF).some((i) => i.href === "/chat"), "unswitched entries stay");
  });
});

const read = (f: string) => fs.readFileSync(f, "utf8");

describe("structural doors", () => {
  it("S1 every other door is conditioned on its switch", () => {
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /\{handoffBooking \? \(\s*<Button[\s\S]{0,400}item-sheet-book-for-me-/);
    const banner = read("client/src/components/plan/HandoffBanner.tsx");
    assert.match(banner, /conciergeFallbackShown = doors\.handoffBooking && doors\.eventConcierge/);
    assert.match(banner, /isOwner && conciergeFallbackShown && data\.banner\?\.kind === "fallback_offered"/);
    const chooser = read("client/src/components/plan/HandoffChooser.tsx");
    assert.match(chooser, /const kinds = offeredHandoffKinds\(HANDOFF_KINDS, doors\)/);
    assert.match(chooser, /\{kinds\.map\(\(k\) =>/);
    const finalize = read("client/src/components/plancard/FinalizeBookingModal.tsx");
    assert.match(finalize, /\.\.\.\(conciergeShown \? \[\{ id: "concierge"/);
    const events = read("client/src/pages/my-events.tsx");
    assert.match(events, /\{conciergeShown \? \([\s\S]{0,600}button-start-event/);
    const ai = read("client/src/pages/ai-assistant.tsx");
    assert.match(ai, /\{conciergeShown \? \(\s*<Button[\s\S]{0,400}button-escalate-to-team/);
    const app = read("client/src/App.tsx");
    assert.match(app, /<Route path="\/concierge">\s*<EventConciergeRoute>\s*<ConciergePage \/>/);
    assert.match(app, /<Route path="\/optimize">\s*<EventConciergeRoute>\s*<Redirect to="\/concierge\?tier=ai" \/>/);
  });
  it("S2 /my-events stays reachable and its pay step is untouched", () => {
    const app = read("client/src/App.tsx");
    assert.match(app, /<Route path="\/my-events">(?![\s\S]{0,200}EventConciergeRoute)/);
    const events = read("client/src/pages/my-events.tsx");
    assert.ok(!/conciergeShown[\s\S]{0,300}\/pay/.test(events), "the pay calls are not behind the switch");
  });
});

describe("copy", () => {
  it("C1 the three strings", () => {
    assert.ok(read("client/src/pages/pricing.tsx").includes('"They review and re-route your plan with you."'));
    assert.ok(!read("client/src/pages/pricing.tsx").includes("book for you"));
    assert.ok(!read("client/src/components/TwelveGoTransport.tsx").includes("A Traveloure booking agent handles this for you"));
    assert.ok(read("client/src/components/unified-result-card.tsx").includes("book this on your behalf"));
  });
});
