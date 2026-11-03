/**
 * Row PS-5 — Finalize: a way back into the chooser, the bulk route sends platform items only, and the expert lane
 * plans rather than books (ledger `2026-11-02-ps5-finalize-chooser-link-only-expert-plans`; CN-1, R-LINK).
 *
 *   T1 the self-serve lane reads "I book them myself".
 *   T2 the finished state offers "Change how you book", which reopens the chooser without posting /finalize.
 *   T3 the bulk route posts platform items only and lists the rest as self-book; with none, no cart navigation.
 *   T4 the expert lane opens the chooser on "Polish my plan" — never `book`.
 *   T6 the new strings pass the AI check and the never-say list.
 *   (T5 not built: POST /items/:id/route is left unchanged by ruling — client filter only.)
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-ps5-finalize.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { siteNeverSayHits } from "@shared/banned-copy";
import { runBulkRouteToCheckout, splitBulkCheckoutByPath } from "../../../lib/slip-plan-actions";

const ROOT = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const MODAL = read("client/src/components/plancard/FinalizeBookingModal.tsx");
const RAIL = read("client/src/components/plancard/SlipRail.tsx");

describe("PS-5 — Finalize", () => {
  it("T1 the self-serve lane reads 'I book them myself'", () => {
    assert.ok(MODAL.includes("/> I book them myself"));
    assert.ok(!MODAL.includes("Book it myself"));
  });

  it("T2 'Change how you book' reopens the chooser without posting /finalize", async () => {
    const { FINALIZE_COPY } = await import("../FinalizeBookingModal");
    assert.equal(FINALIZE_COPY.changeBooking, "Change how you book");
    // Both finished-state layouts carry it, and both open the modal directly (no finalizeMutation, no refinalize).
    assert.ok(RAIL.includes('<button type="button" className={quietBtn} onClick={() => setFinalizeModalOpen(true)} data-testid="slip-action-change-booking">'));
    assert.match(RAIL, /label=\{FINALIZE_COPY\.changeBooking\}\n\s+icon=\{<CheckCircle2 className="w-3\.5 h-3\.5" \/>\}\n\s+onClick=\{\(\) => setFinalizeModalOpen\(true\)\}\n\s+testId="slip-action-change-booking"/);
    assert.equal(RAIL.split("slip-action-change-booking").length - 1, 2, "bar and card");
  });

  it("T3 the bulk route posts platform items only; the rest are listed; none ⇒ no cart", async () => {
    const items = [
      { id: "p", name: "Tea house", routingStatus: "in_planning", booking: null, bookingPath: "platform" },
      { id: "a", name: "Hotel", routingStatus: "in_planning", booking: null, bookingPath: "affiliate" },
      { id: "n", name: "Old town", routingStatus: "in_planning", booking: null, bookingPath: "none" },
    ];
    const split = splitBulkCheckoutByPath(items);
    assert.deepEqual(split.platform.map((i) => i.id), ["p"]);
    assert.deepEqual(split.selfBook.map((i) => i.id), ["a", "n"]);
    const posted: string[] = [];
    const result = await runBulkRouteToCheckout({ items: split.platform, postRoute: async (id) => void posted.push(id), invalidate: () => {} });
    assert.deepEqual(posted, ["p"]);
    assert.equal(result.succeeded, 1);
    // An item with no stated path is not a platform item (§13).
    assert.deepEqual(splitBulkCheckoutByPath([{ id: "x", routingStatus: "in_planning", booking: null }]).platform, []);
    // The modal routes `platformItems`, lists `selfBookItems`, and navigates only when something was staged.
    assert.ok(MODAL.includes("items: platformItems,"));
    assert.ok(MODAL.includes('data-testid="finalize-self-book-note"'));
    assert.ok(MODAL.includes("if (result.succeeded > 0) setLocation(BUY_NOW_CART_PATH);"));
    assert.ok(!MODAL.includes("result.attempted === 0) setLocation"));
  });

  it("T4 the expert lane opens the chooser on 'Polish my plan', never 'book'", () => {
    assert.ok(MODAL.includes('openHandoffChooser({ kind: "polish",'));
    assert.ok(!MODAL.includes('openHandoffChooser({ kind: "book"'));
    assert.ok(MODAL.includes('blurb: "Reviews and refines — you book at checkout"'));
  });

  it("T6 the new strings pass the AI check and the never-say list", async () => {
    const { FINALIZE_COPY } = await import("../FinalizeBookingModal");
    for (const v of [...Object.values(FINALIZE_COPY), "I book them myself"]) {
      assert.doesNotMatch(v, /\bAI\b/);
      assert.deepEqual(siteNeverSayHits(v), [], v);
    }
  });
});
