/**
 * The switched traveler door on the client (ledger `2026-10-18-traveler-doors-hidden`). The event_concierge door and
 * every surface behind it are retired (CN-1g-UI, ledger `2026-11-03-cn1g-ui-retire-legacy-concierge`): R1, R3, P3 and
 * the concierge parts of S1 were removed by that row's sanctioned test edits.
 *
 * RENDERED with the switch seeded off, then on (renderToString over a seeded query cache):
 *   R2 the mobile bottom bar never links /concierge (BottomActionBar, no advisor)
 *   R4 the leg sheet's "Book this for me" (LegSheetBody)                 — handoff_booking
 * PURE:
 *   P1 the door is open only on an explicit `true`; loading/absent/garbage is closed; the read carries no other key
 *   P2 the handoff chooser offers `book` ("Book these for me") only while handoff_booking is on
 * STRUCTURAL (the surfaces below sit inside Radix dialogs/portals or whole pages that renderToString cannot draw, so
 * the test pins that each door's JSX is conditioned on its switch):
 *   S1 the slip item sheet's "Book this for me" and the handoff chooser's `book` kind
 *   S2 /my-events stays a plain route, its "Pay coordination fee" is not gated, and EventConciergeRoute does not exist
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
import { BottomActionBar } from "../plancard/BottomActionBar";
import { LegSheetBody } from "../plan/LegSheet";
import { TRAVELER_DOORS_ROUTE, travelerDoors, offeredHandoffKinds } from "@shared/traveler-doors";
import { HANDOFF_KINDS } from "@shared/handoff";

(globalThis as any).React = React;

const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function render(node: React.ReactNode, doors: { handoffBooking: boolean }) {
  const qc = new QueryClient();
  qc.setQueryData([TRAVELER_DOORS_ROUTE], doors);
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/plans/t1">{node}</Router>
    </QueryClientProvider>,
  );
}
const OFF = { handoffBooking: false };
const ON = { handoffBooking: true };

describe("rendered doors", () => {
  it("R2 the bottom bar no longer reads the concierge door and never links /concierge", () => {
    // Row P-7 (sanctioned): the bar's help door reads /api/expert-availability, not event_concierge.
    const bar = <BottomActionBar tripId="t1" destination="Kyoto" shareToken={null as any} advisor={null} />;
    assert.ok(render(bar, OFF).indexOf('href="/concierge"') === -1);
    assert.ok(render(bar, ON).indexOf('href="/concierge"') === -1);
    const src = fs.readFileSync("client/src/components/plancard/BottomActionBar.tsx", "utf8");
    assert.doesNotMatch(src, /useTravelerDoors/);
    assert.doesNotMatch(src, /"\/concierge"/);
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
    assert.deepEqual(travelerDoors({ handoffBooking: true }), ON);
    assert.deepEqual(travelerDoors({ eventConcierge: true, handoffBooking: true }), ON, "a stale eventConcierge key is ignored");
    for (const v of [undefined, null, {}, { handoffBooking: 1 }, "true"]) assert.deepEqual(travelerDoors(v), OFF);
  });
  it("P2 the chooser offers book only while handoff_booking is on", () => {
    assert.deepEqual(offeredHandoffKinds(HANDOFF_KINDS, { handoffBooking: false }), ["polish", "plan_all"]);
    assert.deepEqual(offeredHandoffKinds(HANDOFF_KINDS, { handoffBooking: true }), ["polish", "book", "plan_all"]);
  });
});

const read = (f: string) => fs.readFileSync(f, "utf8");

describe("structural doors", () => {
  it("S1 every other door is conditioned on its switch", () => {
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /\{handoffBooking \? \(\s*<Button[\s\S]{0,400}item-sheet-book-for-me-/);
    const chooser = read("client/src/components/plan/HandoffChooser.tsx");
    assert.match(chooser, /const kinds = offeredHandoffKinds\(HANDOFF_KINDS, doors\)/);
    assert.match(chooser, /\{kinds\.map\(\(k\) =>/);
  });
  it("S2 /my-events stays reachable, its pay step is untouched, and EventConciergeRoute does not exist", () => {
    const app = read("client/src/App.tsx");
    assert.match(app, /<Route path="\/my-events">/);
    assert.equal(fs.existsSync("client/src/components/concierge/EventConciergeRoute.tsx"), false);
    assert.ok(!app.includes("EventConciergeRoute"));
    const events = read("client/src/pages/my-events.tsx");
    assert.ok(!events.includes("conciergeShown"), "the pay calls are not behind any concierge switch");
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
