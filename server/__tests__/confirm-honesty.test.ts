/**
 * confirm-honesty.test.ts — two §13 pins: a booking is not "confirmed" until it is, and a
 * confirmation code is the server's.
 *
 * Ledger `2026-09-08-transport-confirm-timing` (A-series) and
 * `2026-09-08-confirmation-code-is-the-server-s` (B-series). CLAUDE.md §13, §15.
 *
 * WHY THIS EXISTS. Both defects are invisible on a happy path and both LOOK correct on screen:
 *
 *  · A-series. `POST /api/transport-booking-options/:optionId/book` creates a hosted Stripe
 *    Checkout Session and then stamped `bookingStatus: "confirmed"` on the option — the comment
 *    above it said the motive out loud ("so the UI shows the green Confirmed badge immediately").
 *    A traveler who abandoned the Stripe page, or whose card was declined, kept a Confirmed badge
 *    forever, and `traveler-profile.service.ts` counted the row as a purchased transport pick
 *    (`booking_status IN ('booked','confirmed')`). Nothing threw; the screen looked perfect. The
 *    ONLY thing that would go red if the stamp came back is a pin like this one.
 *  · B-series. `BookingFlowModal` minted `TRV${Math.random()...}` in the BROWSER. The server mints
 *    its own `TRV` + 10 characters, persists it on `bookings.confirmation_code` and emails it — so
 *    the fabricated one was indistinguishable from the real thing to the traveler and meaningless
 *    to support. A test asserting "a confirmation code is rendered" passes on the fabricated one.
 *
 * NEGATIVE SPACE, stated so a green run is read correctly (§18d habit):
 *  - NO DATABASE, NO HTTP, NO BROWSER. Every assertion is a fact about the SHIPPED SOURCE TEXT,
 *    not about executed behaviour. It cannot prove the webhook fires, that Stripe delivers
 *    `checkout.session.completed`, or that the modal's fetch reaches the route.
 *  - it says nothing about amounts, fees, rates, idempotency keys or claims — this lane changed
 *    none of them, and the money suites (§14/§15/§17/§19) remain the layer for those.
 *  - A3 pins the ORDER of two markers inside `stripe.service.ts`; it does not prove the early
 *    return is reached for every unpaid session shape, which is Stripe's own `payment_status`
 *    contract.
 *  - it does not cover `PATCH /api/transport-booking-options/:optionId/status`, the traveler's
 *    self-report rail for external bookings, which is deliberately left as-is by this lane.
 *
 * Run: npx tsx --test server/__tests__/confirm-honesty.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const TRANSPORT_ROUTES = "server/routes/transport-hub.routes.ts";
const STRIPE_SERVICE = "server/services/stripe.service.ts";
const FLOW_MODAL = "client/src/components/booking/BookingFlowModal.tsx";
const CONFIRMATION = "client/src/components/booking/BookingConfirmation.tsx";

// ── A-series — the transport option is not confirmed before payment ─────────────────────────────

test("A1: the book handler stamps NO booking status at all", () => {
  const src = read(TRANSPORT_ROUTES);

  // The whole of the fix: the initiation path writes nothing to booking_status. The one surviving
  // call site is the traveler's self-report PATCH, which passes an assembled `updateData` object.
  const callSites = src.match(/updateTransportBookingOptionStatus\(/g) ?? [];
  assert.equal(
    callSites.length,
    1,
    "expected exactly one updateTransportBookingOptionStatus call site (the self-report PATCH); " +
      "a second one is the initiation stamp coming back",
  );
  assert.match(
    src,
    /updateTransportBookingOptionStatus\(optionId,\s*updateData\)/,
    "the surviving call site must be the PATCH self-report rail",
  );
});

test("A2: no status literal is written on the initiation path (and none is invented)", () => {
  const src = read(TRANSPORT_ROUTES);

  // The exact shape of the defect.
  assert.ok(
    !/updateTransportBookingOptionStatus\(optionId,\s*\{\s*bookingStatus:/.test(src),
    "the initiation path must not stamp a bookingStatus literal",
  );

  // "Do not invent a new status value": no `pending` / `awaiting_payment` snuck in beside it. The
  // column's app-enforced set is available | booked | confirmed | cancelled, and the option simply
  // keeps the status it already has while the checkout is in flight.
  for (const invented of ["awaiting_payment", "payment_pending", "initiated"]) {
    assert.ok(
      !src.includes(`bookingStatus: "${invented}"`),
      `a new booking_status value (${invented}) was invented for this column`,
    );
  }
});

test("A3: the promotion is the PAYMENT's signal, gated on payment_status === paid", () => {
  const src = read(STRIPE_SERVICE);

  const gate = src.indexOf('session.payment_status !== "paid"');
  const promote = src.indexOf('bookingStatus: "confirmed"');

  assert.ok(gate >= 0, "handleStripePaymentSuccess must still return early on an unpaid session");
  assert.ok(promote >= 0, "the transport option must still be promoted on the payment signal");
  assert.ok(
    gate < promote,
    "the unpaid-session early return must precede the transport option promotion — a hosted " +
      "Checkout Session can complete UNPAID (delayed-notification methods), so the arrival of " +
      "checkout.session.completed is not by itself a payment",
  );
});

test("A4: the transport booking rail itself is intact", () => {
  const src = read(TRANSPORT_ROUTES);
  assert.match(src, /createTransportBookingCheckout\(/, "the checkout session must still be created");
  assert.match(src, /checkoutUrl: checkoutSession\.checkoutUrl/, "the traveler must still be sent to pay");
});

// ── B-series — the confirmation code is the server's, or there is none ──────────────────────────

test("B1: the modal fabricates no confirmation code", () => {
  const src = read(FLOW_MODAL);

  // Any `Math.random()` on the same line as a confirmation code is the defect, whatever the prefix.
  for (const line of src.split("\n")) {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
    assert.ok(
      !(/confirmationCode/.test(line) && /Math\.random/.test(line)),
      `a confirmation code is being generated in the browser: ${line.trim()}`,
    );
    assert.ok(
      !/`TRV\$\{/.test(line),
      `a TRV-prefixed code is being minted in the browser: ${line.trim()}`,
    );
  }
});

test("B2: the code rendered is the one the server returned", () => {
  const src = read(FLOW_MODAL);
  assert.match(
    src,
    /statuses\[b\.id\]\?\.confirmationCode/,
    "the confirmation row must take its code from the server's bulk-status response",
  );
  assert.match(
    src,
    /confirmationCode: serverCode \?\? undefined/,
    "a booking with no server code must carry NO code (§13), never a substitute",
  );
});

test("B3: the poll no longer discards the rows it fetched", () => {
  const src = read(FLOW_MODAL);
  assert.match(
    src,
    /pollForWebhookConfirmation[\s\S]{0,400}?Promise<\{\s*confirmed: boolean;\s*statuses:/,
    "pollForWebhookConfirmation must return the statuses it read, not only allConfirmed",
  );
  assert.match(
    src,
    /statuses = \{ \.\.\.statuses, \.\.\.\(await fetchBookingStatuses\(bookingIds\)\) \}/,
    "the fallback confirm-payment path must re-read, since that is what persists the code",
  );
});

test("B4: an absent code is stated, not filled", () => {
  const src = read(CONFIRMATION);
  assert.match(
    src,
    /booking\.confirmationCode \?/,
    "the confirmation screen must branch on the code's presence",
  );
  assert.match(
    src,
    /still being issued/,
    "an absent confirmation code must be said out loud (§13), never rendered as blank space",
  );
});
