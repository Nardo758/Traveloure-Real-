/**
 * The shared cancel dialog and the ONE from-state list behind it (row 254, ledger
 * `2026-10-29-transport-cancel-module-deleted`). These pins were C5, C8 and C9 of
 * `transport-cancel.test.ts`, split out when `client/src/lib/transport-cancel.ts` (whose only
 * importer was that test) was deleted. The pins themselves are unchanged.
 *
 *   C5  the cancel route reads the SAME shared from-state list (`@shared/booking-cancellation`)
 *   C8  the dialog states the server's numbers and computes none
 *   C9  there is ONE cancel dialog, and my-bookings mounts it
 *
 * Shape checks over source text with comments stripped; the server's own from-state guard is
 * proven against a real database by `server/__tests__/transport-payment-intent.db.test.ts` T7.
 *
 * Run: npx tsx --test client/src/lib/__tests__/cancel-booking-dialog.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BOOKING_CANCELLABLE_FROM_STATUSES,
  isBookingCancellable,
} from "../../../../shared/booking-cancellation";

const ROOT = process.cwd();
const DIALOG = path.join(ROOT, "client/src/components/booking/CancelBookingDialog.tsx");
const ROUTES = path.join(ROOT, "server/routes.ts");

/** Comments stripped, so a pin can never be satisfied by the prose that DESCRIBES the rule. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, "$1"))
    .join("\n");
}
const read = (p: string) => fs.readFileSync(p, "utf8");

describe("the from-state list has ONE author (§18 rule 1)", () => {
  it("C5 — the client predicate and the cancel route read the SAME shared list", () => {
    // (a) the shared predicate is closed at the declared list.
    const candidates = [
      "pending",
      "confirmed",
      "in_progress",
      "completed",
      "cancelled",
      "refunded",
      "disputed",
      "payment_pending",
    ];
    assert.deepEqual(
      candidates.filter((s) => isBookingCancellable(s)).sort(),
      [...BOOKING_CANCELLABLE_FROM_STATUSES].sort(),
    );

    // (b) the SERVER reads it too — both the 400 and, per §18b, the atomic conditional that
    //     performs the flip. A route that went back to spelling the statuses out fails here.
    const routes = stripComments(read(ROUTES));
    assert.match(
      routes,
      /import \{ BOOKING_CANCELLABLE_FROM_STATUSES, isBookingCancellable \} from "@shared\/booking-cancellation";/,
      "the cancel route must import the shared list, not restate it",
    );
    const cancelAt = routes.indexOf('app.post("/api/bookings/:id/cancel"');
    assert.ok(cancelAt > 0, "the cancel handler must still be locatable");
    const handler = routes.slice(cancelAt, routes.indexOf('app.post("/api/expert/reviews/:id/respond"'));
    assert.match(handler, /if \(!isBookingCancellable\(booking\.status\)\)/, "the 400 reads the shared predicate");
    assert.match(
      handler,
      /updateServiceBookingStatus\(\s*req\.params\.id,\s*"cancelled",\s*reason,\s*BOOKING_CANCELLABLE_FROM_STATUSES,\s*\)/,
      "§18b: the non-refund branch's UPDATE carries the from-state list, so the transition IS the guard",
    );
    assert.ok(
      !/booking\.status !== "pending" && booking\.status !== "confirmed"/.test(handler),
      "the re-typed copy must be gone, not merely shadowed",
    );
  });
});

describe("the cancel dialog decides no money (§14/§13)", () => {
  it("C8 — the dialog states the server's numbers and computes none", () => {
    const dialog = stripComments(read(DIALOG));
    assert.match(
      dialog,
      /useQuery<CancelPreview>\(\{\s*queryKey: \[`\/api\/bookings\/\$\{bookingId\}\/cancel-preview`\]/,
      "the dialog's figures come from the server's own quote endpoint",
    );
    assert.ok(
      !/refundPercent\s*\/\s*100|totalAmount\s*\*/.test(dialog),
      "the dialog renders the quote; it never recomputes one",
    );
    assert.match(
      dialog,
      /disabled=\{cancelMutation\.isPending \|\| previewLoading \|\| !cancelPreview\}/,
      "§13: no cancellation is confirmable before the server has stated its consequence",
    );
  });

  it("C9 — there is ONE cancel dialog, and my-bookings mounts it", () => {
    const myBookings = stripComments(read(path.join(ROOT, "client/src/pages/my-bookings.tsx")));
    for (const [name, src] of [["my-bookings", myBookings]] as const) {
      assert.match(
        src,
        /import \{ CancelBookingDialog(?:, type CancelBookingResult)? \} from "@\/components\/booking\/CancelBookingDialog";/,
        `${name} must reuse the shared dialog`,
      );
      assert.match(src, /<CancelBookingDialog/, `${name} must mount it`);
      assert.ok(
        !/cancel-preview`\]/.test(src.replace(/CancelBookingDialog/g, "")),
        `${name} must not run its own preview query beside the shared one`,
      );
    }
  });
});
