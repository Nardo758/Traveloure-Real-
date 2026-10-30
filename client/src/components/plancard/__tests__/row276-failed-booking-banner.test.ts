/**
 * Row 276, client half (ledger `2026-10-30-failed-booking-banner-client`): a failed booking shows the
 * headline plus ONE payment line chosen by the server's `banner.payment`. The client reads the banner
 * only; it never reads a refund id, a Stripe object, an amount or the request's status to decide.
 *
 *   FB1 the six strings equal the table.
 *   FB2 each payment value maps to its ruled line; only "refunded" yields the refund line.
 *   FB3 the line comes from the banner alone (handoff null, no refund id, no capturedAt, no Stripe object).
 *   FB4 plain released / release_pending banners keep their lines and say nothing about a refund or payment.
 *   FB5 none of the six strings is on the site's never-say list.
 *   FB6 handoffHoldsPen is false for booking_failed.
 *   FB7 the client does not import the server's notification copy, and the banner object is not it.
 *   FB8 the "reviewing" line never says refund or money back, and equals no other line.
 *   FB9 "You haven't been charged." appears for no_charge only; an unknown value reads the checking line.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row276-failed-booking-banner.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  HANDOFF_FAILED_BOOKING_BANNER_COPY as COPY,
  failedBookingPaymentLine,
  handoffBannerLine,
  handoffHoldsPen,
} from "../../../lib/handoff-client";
import { HANDOFF_FAILED_BOOKING_TRAVELER_COPY, handoffBannerState } from "@shared/handoff";
import { siteNeverSayHits } from "@shared/banned-copy";

const PAYMENTS = ["refunded", "checking", "hold_released", "reviewing", "no_charge"] as const;

function lineFor(payment: unknown): string | null {
  return handoffBannerLine({
    banner: { kind: "booking_failed", payment } as never,
    city: null,
    typicalAcceptHours: null,
    handoff: null,
  });
}

describe("row 276 — the failed-booking banner on the slip", () => {
  it("FB1: the six strings equal the table", () => {
    assert.deepEqual(COPY, {
      headline: "This booking didn't go ahead.",
      holdReleased: "We've released your card hold.",
      refunded: "You've been refunded in full.",
      checking: "We're checking on your payment. You'll hear from us by email.",
      reviewing: "We're reviewing your payment and will email you about it.",
      noCharge: "You haven't been charged.",
    });
  });

  it("FB2: each payment value maps to its ruled line", () => {
    assert.equal(lineFor("refunded"), `${COPY.headline} ${COPY.refunded}`);
    assert.equal(lineFor("checking"), `${COPY.headline} ${COPY.checking}`);
    assert.equal(lineFor("hold_released"), `${COPY.headline} ${COPY.holdReleased}`);
    assert.equal(lineFor("reviewing"), `${COPY.headline} ${COPY.reviewing}`);
    assert.equal(lineFor("no_charge"), `${COPY.headline} ${COPY.noCharge}`);
    for (const p of PAYMENTS) {
      assert.equal(lineFor(p)!.includes(COPY.refunded), p === "refunded", p);
    }
  });

  it("FB3: the line comes from the banner alone", () => {
    // The read carries no handoff row, no refund id, no capturedAt and no Stripe object, and the line is still right.
    const read = { banner: { kind: "booking_failed" as const, payment: "refunded" as const }, city: null, typicalAcceptHours: null, handoff: null };
    assert.deepEqual(Object.keys(read).sort(), ["banner", "city", "handoff", "typicalAcceptHours"]);
    assert.equal(handoffBannerLine(read), `${COPY.headline} ${COPY.refunded}`);
    const src = fs.readFileSync("client/src/lib/handoff-client.ts", "utf8");
    for (const word of ["refundId", "refund_id", "capturedAt", "bookingFailure", "optimizationContext", "paymentIntent"]) {
      assert.equal(src.includes(word), false, word);
    }
  });

  it("FB4: plain released and release_pending keep their lines", () => {
    const released = handoffBannerLine({ banner: handoffBannerState({ status: "released" }), city: null, typicalAcceptHours: null, handoff: null });
    const pending = handoffBannerLine({ banner: handoffBannerState({ status: "release_pending" }), city: null, typicalAcceptHours: null, handoff: null });
    assert.equal(released, "No local was free in time — we released the hold on your card. Nothing was charged.");
    assert.ok(pending && pending.length > 0);
    for (const line of [released!, pending!]) {
      assert.doesNotMatch(line, /refunded/i);
      assert.doesNotMatch(line, /payment/i);
      assert.equal(line.includes(COPY.headline), false);
    }
    for (const p of PAYMENTS) assert.doesNotMatch(lineFor(p)!, /No local was free in time/);
  });

  it("FB5: none of the six strings is on the never-say list", () => {
    for (const text of Object.values(COPY)) assert.deepEqual(siteNeverSayHits(text), [], text);
  });

  it("FB6: handoffHoldsPen is false for booking_failed", () => {
    assert.equal(handoffHoldsPen({ status: "booking_failed" }), false);
  });

  it("FB7: the client does not import the notification copy, and the banner object is not it", () => {
    const src = fs.readFileSync("client/src/lib/handoff-client.ts", "utf8");
    const importLines = src.split("\n").filter((l) => l.startsWith("import "));
    assert.equal(importLines.some((l) => l.includes("HANDOFF_FAILED_BOOKING_TRAVELER_COPY")), false);
    assert.notEqual(COPY as unknown, HANDOFF_FAILED_BOOKING_TRAVELER_COPY as unknown);
    // The two approved lines that differ in meaning are never shared: the banner's refund line is not the
    // notification's refund sentence, and the banner never carries the title or "choose another expert".
    for (const text of Object.values(COPY)) {
      assert.notEqual(text, HANDOFF_FAILED_BOOKING_TRAVELER_COPY.refunded);
      assert.notEqual(text, HANDOFF_FAILED_BOOKING_TRAVELER_COPY.chooseAnother);
      assert.notEqual(text, HANDOFF_FAILED_BOOKING_TRAVELER_COPY.title);
    }
  });

  it("FB8: the reviewing line never says refund or money back", () => {
    const line = lineFor("reviewing")!;
    assert.doesNotMatch(line, /refund/i);
    assert.doesNotMatch(line, /money back/i);
    for (const other of ["refunded", "hold_released", "no_charge"] as const) assert.notEqual(line, lineFor(other));
  });

  it("FB9: no_charge only says not charged; an unknown value reads the checking line", () => {
    for (const p of [...PAYMENTS, "something_else", undefined, null]) {
      assert.equal(lineFor(p)!.includes(COPY.noCharge), p === "no_charge", String(p));
    }
    assert.equal(lineFor("something_else"), `${COPY.headline} ${COPY.checking}`);
    assert.equal(lineFor(undefined), `${COPY.headline} ${COPY.checking}`);
    assert.equal(failedBookingPaymentLine("something_else"), COPY.checking);
  });
});
