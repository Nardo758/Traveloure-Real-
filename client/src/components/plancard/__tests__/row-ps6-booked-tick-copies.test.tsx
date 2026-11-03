/**
 * Row PS-6 — the slip shows a booked tick only; the Trip Card shows one booking copy per stop, links only; My Bookings
 * dates a booking only once it is confirmed (ledger `2026-11-02-ps6-booked-tick-copies-on-card`; Leon, Nov 2 §3).
 *
 *   T1 confirmed item on the slip: tick present, no "#", no partner name; pending item: no tick.
 *   T2 Trip Card booked stop: copy block with reference + status + link; pending stop: status word, no reference.
 *   T3 the copy block contains no button or link whose label starts with "Book".
 *   T4 My Bookings: a pending row shows no "Booked on".
 *   T5 the new strings pass /\bAI\b/ and siteNeverSayHits().
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-ps6-booked-tick-copies.test.tsx
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
import { bookingConfirmedOrLater, itemBookedTick, slipItemBookingNote } from "../../../lib/item-booking-state";
import { BOOKING_COPY_PARTNER, BOOKING_COPY_PENDING_LABEL, buildBookingCopy } from "../../../lib/booking-copy";
import { ItemRow } from "../../plan/ItemRow";
import { BookingCopyBlock } from "../BookingCopyBlock";

(globalThis as any).React = React;

const ROOT = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function wrap(node: React.ReactNode): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/plans/t1">{node}</Router>
    </QueryClientProvider>,
  );
}

const confirmed = { id: "i1", name: "Tea house", routingStatus: "purchased", booking: { id: "b1", status: "confirmed" }, confirmationNumber: "ZX81" };
const pending = { id: "i2", name: "Cooking class", routingStatus: "purchased", booking: { id: "b2", status: "pending" }, confirmationNumber: null };

describe("PS-6 — booked tick and booking copies", () => {
  it("T1 the slip: a tick for confirmed, none for pending; no reference or partner name", () => {
    assert.equal(itemBookedTick(confirmed), true);
    assert.equal(itemBookedTick(pending), false, "never for pending");
    assert.equal(itemBookedTick({ routingStatus: "purchased", confirmationNumber: "H1" }), true, "a partner stay with its code");
    assert.equal(itemBookedTick({ routingStatus: "purchased" }), false, "no confirmation in hand");
    assert.equal(itemBookedTick({ booking: { status: "disputed" } }), false);
    assert.equal(slipItemBookingNote(confirmed), null, "a booked row has no note on the slip");
    assert.match(slipItemBookingNote({ booking: { status: "disputed" } }) ?? "", /^Under review/);

    const html = wrap(<ItemRow item={confirmed as any} mode="read" role="traveler" booked={itemBookedTick(confirmed)} bookingState={slipItemBookingNote(confirmed)} />);
    assert.match(html, /data-testid="slip-item-booked-i1"/);
    assert.match(html, /aria-label="Booked"/);
    assert.doesNotMatch(html, /#ZX81|booked · #/);
    assert.doesNotMatch(html, /button-visited-i1/, "the booked tick is not the visited toggle");
    const pendingHtml = wrap(<ItemRow item={pending as any} mode="read" role="traveler" booked={itemBookedTick(pending)} bookingState={slipItemBookingNote(pending)} />);
    assert.doesNotMatch(pendingHtml, /slip-item-booked-i2/);

    const view = read("client/src/components/plancard/SlipView.tsx");
    assert.ok(view.includes("booked={itemBookedTick(a)}"));
    assert.ok(view.includes("bookingState={slipItemBookingNote(a)}"));
    assert.ok(!view.includes("bookingState={slipItemBookingLine(a)}"));
    assert.ok(!read("client/src/components/plan/ItemRow.tsx").includes("slip-teal-wash)] px-2.5 py-1"), "the booked pill is gone");
  });

  it("T2 the Trip Card: a booked stop carries reference, status and link; a pending one the status word only", () => {
    const reads = {
      myBookings: [
        { id: "b1", status: "confirmed", confirmationCode: "TRV-1234", confirmedAt: "2026-10-01T10:00:00Z", provider: { displayName: "Aiko" } },
        { id: "b2", status: "pending", confirmationCode: "TRV-9999", confirmedAt: null, provider: { displayName: "Kenji" } },
      ],
      partnerRequests: [
        { id: "r1", itineraryItemId: "i3", status: "confirmed", confirmationRef: "GYG-77", partnerName: "GetYourGuide" },
        { id: "r2", itineraryItemId: "i4", status: "pending", confirmationRef: "X", partnerName: "Viator" },
      ],
    };
    const p = buildBookingCopy(confirmed, reads)!;
    assert.deepEqual([p.kind, p.who, p.reference, p.status, p.confirmed], ["platform", "Aiko", "TRV-1234", "Booked", true]);
    assert.equal(p.link?.href, "/my-bookings");
    const pp = buildBookingCopy(pending, reads)!;
    assert.deepEqual([pp.reference, pp.confirmedAt, pp.status, pp.confirmed], [null, null, BOOKING_COPY_PENDING_LABEL, false]);

    const partner = buildBookingCopy({ id: "i3", routingStatus: "purchased" }, reads)!;
    assert.deepEqual([partner.kind, partner.who, partner.reference, partner.status], ["partner", "GetYourGuide", "GYG-77", "Confirmed by GetYourGuide"]);
    assert.equal(partner.link?.href, "/api/affiliate-booking-requests/r1/open", "the tracked open route — the URL stays server-side");
    assert.equal(partner.terms, "Your booking is with GetYourGuide, under their terms.");
    const partnerPending = buildBookingCopy({ id: "i4", routingStatus: "with_expert" }, reads)!;
    assert.equal(partnerPending.reference, null);
    assert.equal(partnerPending.status, "Received");
    assert.equal(partnerPending.terms, null);

    assert.equal(buildBookingCopy({ id: "i9", routingStatus: "in_planning" }, reads), null, "no booking ⇒ no copy");
    assert.equal(buildBookingCopy({ id: "i8", booking: { id: "b8", status: "disputed" } }, reads), null, "a dispute keeps its own note");

    const html = wrap(<BookingCopyBlock id="i1" copy={p} />);
    assert.match(html, /Booked/);
    assert.match(html, /#TRV-1234/);
    assert.match(html, /href="\/my-bookings"/);
    const pendingHtml = wrap(<BookingCopyBlock id="i2" copy={pp} />);
    assert.match(pendingHtml, />Pending</);
    assert.doesNotMatch(pendingHtml, /#TRV-9999|#/);

    const days = read("client/src/components/plancard/TripCardDays.tsx");
    assert.ok(days.includes("bookingCopy={bookingCopyFor(a)}"));
    // The two reads run only when at least one stop is confirmed or later (decision-maker, Nov 3, 2026).
    assert.ok(days.includes("const anyConfirmedStop = days.some((d) => (d.activities ?? []).some((a) => itemBookedTick(a)));"));
    assert.ok(days.includes("const bookingReads = useBookingCopyReads(tripId, !waitlist && anyConfirmedStop);"));
    const block = read("client/src/components/plancard/BookingCopyBlock.tsx");
    assert.ok(block.includes('queryKey: ["/api/my-bookings"]'), "My Bookings' read");
    assert.ok(block.includes('queryKey: ["/api/affiliate-booking-requests/user", { tripId }]'), "the booking-agent card's read");
    assert.ok(days.includes("if (waitlist) return null;"), "waitlist rows keep 'Saved to plan'");
  });

  it("T3 the copy block offers no Book action and writes nothing", () => {
    const block = read("client/src/components/plancard/BookingCopyBlock.tsx");
    const model = read("client/src/lib/booking-copy.ts");
    assert.doesNotMatch(block, /<button|onClick|apiRequest|useMutation|method:/);
    assert.doesNotMatch(model, /apiRequest|fetch\(|useMutation/);
    for (const copy of [
      buildBookingCopy(confirmed, {})!,
      buildBookingCopy({ id: "i3", routingStatus: "purchased" }, { partnerRequests: [{ id: "r1", itineraryItemId: "i3", status: "confirmed", partnerName: "Viator" }] })!,
    ]) {
      const html = wrap(<BookingCopyBlock id="x" copy={copy} />);
      for (const m of Array.from(html.matchAll(/<(?:a|button)[^>]*>([^<]*)</g))) assert.doesNotMatch(m[1], /^Book/, m[1]);
    }
  });

  it("T4 My Bookings: a pending row shows no 'Booked on'", () => {
    assert.equal(bookingConfirmedOrLater("pending"), false);
    assert.equal(bookingConfirmedOrLater("payment_pending"), false);
    assert.equal(bookingConfirmedOrLater("confirmed"), true);
    assert.equal(bookingConfirmedOrLater("completed"), true);
    const page = read("client/src/pages/my-bookings.tsx");
    const at = page.indexOf("data-testid={`text-booked-on-${booking.id}`}");
    assert.ok(at > 0);
    const span = page.slice(at, page.indexOf("</span>", at));
    assert.match(span, /bookingConfirmedOrLater\(actionStatus\)\s*\?/);
    assert.match(span, /: status\.label\}/);
  });

  it("T5 the new strings pass the AI check and the never-say list", () => {
    for (const v of [BOOKING_COPY_PARTNER.viewOn("Viator"), BOOKING_COPY_PARTNER.terms("Viator"), BOOKING_COPY_PENDING_LABEL, "Booked"]) {
      assert.doesNotMatch(v, /\bAI\b/);
      assert.deepEqual(siteNeverSayHits(v), [], v);
    }
  });
});
