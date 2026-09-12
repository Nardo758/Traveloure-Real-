/**
 * confirm-honesty.test.ts — the transport rail's §13/§14/§15/§19 pins: a booking is not
 * "confirmed" until it is, a confirmation code is the server's, and nobody else's row is
 * stampable.
 *
 * Ledger `2026-09-08-transport-confirm-timing` (A-series),
 * `2026-09-08-confirmation-code-is-the-server-s` (B-series),
 * `2026-09-12-transport-status-self-report-gate` (C-series — punchlist V-7 and V-8) and
 * `2026-09-12-delete-dead-transport-status` (C9/C10 — V-7 superseded by deletion).
 * CLAUDE.md §13, §14, §15, §18b/c, §19; Locked Decisions 12, 40, 44 (e).
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
 *  · C-series (V-7). `PATCH /api/transport-booking-options/:optionId/status` read `bookingStatus`
 *    and `confirmationRef` straight off `req.body` behind `isAuthenticated` and NOTHING else — no
 *    ownership check, no allowlist, no value set. Any signed-in account could stamp ANY transport
 *    option `confirmed` with any reference, on any traveller's plan, and the two readers above
 *    treat that value as a real reservation. It was GATED on 2026-09-12 and DELETED the same day by
 *    decision-maker ruling: the gating lane's own report established it had ZERO callers anywhere
 *    in `client/` or `e2e/`, which makes it §18c's case exactly — no consumer plus a state-bearing
 *    effect ⇒ delete, don't gate, because a gated dead rail is still an unaudited way to mutate the
 *    column. C1–C5 pinned the SHAPE of the gate and are gone with their subject; C9 replaces them
 *    with the only pin a deletion can have — that neither half comes back.
 *  · C-series (V-8). `handleStripePaymentSuccess` promoted both rows unconditionally on their
 *    CURRENT state — §15's atomic conditional was present for the PAYMENT check and absent for the
 *    status it overwrote — so a late `checkout.session.completed` (a delayed delivery, a replay, a
 *    reconciliation re-drive) flipped a CANCELLED booking and a CANCELLED option back to
 *    `confirmed`, and the green badge returned on a reservation nobody holds.
 *
 * NEGATIVE SPACE, stated so a green run is read correctly (§18d habit):
 *  - NO DATABASE, NO HTTP, NO BROWSER. Every assertion is a fact about the SHIPPED SOURCE TEXT,
 *    not about executed behaviour. It cannot prove the webhook fires, that Stripe delivers
 *    `checkout.session.completed`, or that the modal's fetch reaches the route.
 *  - it says nothing about amounts, fees, rates, idempotency keys or claims — neither lane changed
 *    any of them, and the money suites (§14/§15/§17/§19) remain the layer for those.
 *  - A3 pins the ORDER of two markers inside `stripe.service.ts`; it does not prove the early
 *    return is reached for every unpaid session shape, which is Stripe's own `payment_status`
 *    contract.
 *  - THE C-SERIES IS STRUCTURAL, NOT BEHAVIOURAL, and that is its main limit. It does NOT execute
 *    zod, Postgres, Stripe or `authorizeTripLogistics`, so it cannot prove a specific non-owner is
 *    refused or that a SQL `WHERE` matches the rows intended. Proving those needs a database
 *    harness this job does not have. What it CAN do — and what each defect actually was — is catch
 *    the shape coming back.
 *  - C6/C7 read the FROM-STATE lists by name. A promotion that stopped using those constants, or a
 *    writer of `booking_status` under a name this suite does not scan for, is outside the predicate.
 *  - C9 is a NAME/PATH scan, not a semantic one: it proves the deleted route path and the deleted
 *    storage helper are absent from `server/`, `client/` and `e2e/`, and nothing about a third rail
 *    that reaches the same column by a different spelling.
 *
 * Run: npx tsx --test server/__tests__/confirm-honesty.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const TRANSPORT_ROUTES = "server/routes/transport-hub.routes.ts";
const STRIPE_SERVICE = "server/services/stripe.service.ts";
const FLOW_MODAL = "client/src/components/booking/BookingFlowModal.tsx";
const CONFIRMATION = "client/src/components/booking/BookingConfirmation.tsx";

/**
 * Every pin below that reads a REGION of a file derives it from the file set with COMMENTS
 * STRIPPED (the standing lane rule) — otherwise a doc comment naming the defect would satisfy the
 * pin that exists to prove the defect is gone. The strip is line-based on this repo's comment
 * convention (`//`, `*`, `/*` at the start of a trimmed line) rather than a general lexer, because
 * these files contain URLs whose `//` a naive strip would mangle.
 */
const stripComments = (src: string) =>
  src
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");

/** The body of one Express handler: from its route-path literal to the NEXT route registration. */
const handlerBody = (src: string, routePath: string) => {
  const code = stripComments(src);
  const marker = `"${routePath}"`;
  const start = code.indexOf(marker);
  assert.ok(start >= 0, `route not found in the shipped source: ${routePath}`);
  const rest = code.slice(start + marker.length);
  const end = rest.search(/\nrouter\.(get|post|patch|put|delete)\(/);
  return end >= 0 ? rest.slice(0, end) : rest;
};

// ── A-series — the transport option is not confirmed before payment ─────────────────────────────

test("A1: the book handler writes NO booking status at all", () => {
  // REPAIRED twice, never weakened. This pin originally counted call sites of
  // `storage.updateTransportBookingOptionStatus` and asserted the survivor was the self-report
  // PATCH; the gating lane replaced the count with the INVARIANT it existed for, and the deletion
  // lane removed both the PATCH and that helper outright. The assertion below therefore stands on
  // its own: the INITIATION handler writes nothing to booking_status, by ANY route to the column —
  // including a re-introduced helper of the old name, which C9 additionally forbids repo-wide.
  const body = handlerBody(read(TRANSPORT_ROUTES), "/api/transport-booking-options/:optionId/book");

  assert.ok(
    !/bookingStatus/.test(body),
    "the book handler must not name booking_status at all — creating a Checkout Session is an " +
      "intent to pay, not a reservation",
  );
  assert.ok(
    !/updateTransportBookingOptionStatus\(/.test(body),
    "the book handler must not reach the status writer",
  );
  assert.ok(
    !/\.update\(\s*transportBookingOptions/.test(body),
    "the book handler must not write the transport option row directly either",
  );
});

test("A2: no status literal is written on the initiation path (and none is invented)", () => {
  const code = stripComments(read(TRANSPORT_ROUTES));

  // The exact shape of the defect: a status literal written anywhere on the initiation path. A1
  // already proves the handler names no status at all; this restates the original assertion as a
  // fact about the whole file so a helper called BY the initiation path cannot carry the stamp.
  assert.ok(
    !/\.update\(\s*transportBookingOptions\s*\)[\s\S]{0,400}?bookingStatus:\s*"confirmed"/.test(code),
    "no write in this file may stamp booking_status = confirmed — that value belongs to the " +
      "payment signal in stripe.service.ts",
  );

  // "Do not invent a new status value": no `pending` / `awaiting_payment` snuck in beside it. The
  // column's app-enforced set is available | booked | confirmed | cancelled, and the option simply
  // keeps the status it already has while the checkout is in flight.
  for (const invented of ["awaiting_payment", "payment_pending", "initiated"]) {
    assert.ok(
      !code.includes(`"${invented}"`),
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

// ── C-series — nobody else's transport row is stampable, and a cancelled one is never resurrected
// Ledger `2026-09-12-transport-status-self-report-gate` (punchlist V-7, V-8).

test("C6 (V-8): a CANCELLED row is in neither promotable set", () => {
  const code = stripComments(read(STRIPE_SERVICE));

  const lists: Array<[string, string]> = [
    ["booking", "TRANSPORT_BOOKING_PROMOTABLE_FROM"],
    ["option", "TRANSPORT_OPTION_PROMOTABLE_FROM"],
  ];
  for (const [what, name] of lists) {
    const declared = code.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
    assert.ok(declared, `${name} must be declared once, by name, beside the statement that reads it`);
    const values = declared![1];
    assert.ok(
      !/cancelled|canceled|refunded/.test(values),
      `${what}: a cancelled or refunded row must never be promotable — a late paid signal does not ` +
        `resurrect it (V-8)`,
    );
  }

  const bookingValues = code.match(/TRANSPORT_BOOKING_PROMOTABLE_FROM\s*=\s*\[([^\]]*)\]/)![1];
  assert.ok(
    !/payment_pending/.test(bookingValues),
    "§18b: `payment_pending` with a NULL PaymentIntent is the cart checkout's unauthorized claim " +
      "and belongs to checkout-claim.service.ts, which stays its sole author",
  );
});

test("C7 (V-8): both promotions are atomic conditionals, not unconditional writes", () => {
  const code = stripComments(read(STRIPE_SERVICE));
  const fn = code.slice(code.indexOf("export async function handleStripePaymentSuccess"));
  assert.ok(fn.length > 0, "handleStripePaymentSuccess must still exist");

  // Every UPDATE inside the handler must reach its .where() through an and(), i.e. an id match PLUS
  // a from-state predicate. A bare `.where(eq(id, …))` is the V-8 defect.
  const writes = fn.split(/\.update\(/).slice(1);
  assert.equal(writes.length, 2, "expected exactly two promotions here: the booking and the option");
  for (const segment of writes) {
    const stmt = segment.slice(0, segment.indexOf(".returning("));
    assert.ok(
      /\.where\(\s*\n?\s*and\(/.test(stmt),
      `a promotion's WHERE must carry a from-state guard beside the id: ${stmt.slice(0, 120)}…`,
    );
  }
  assert.match(
    fn,
    /inArray\(serviceBookings\.status as any, \[\.\.\.TRANSPORT_BOOKING_PROMOTABLE_FROM\]\)/,
    "the booking promotion must read the declared list, never a restated literal (§18 rule 1)",
  );
  assert.match(
    fn,
    /inArray\(transportBookingOptions\.bookingStatus, \[\.\.\.TRANSPORT_OPTION_PROMOTABLE_FROM\]\)/,
    "the option promotion must read the declared list",
  );
});

test("C8 (V-8): a refused promotion is logged and the fee ledger is NOT written", () => {
  const code = stripComments(read(STRIPE_SERVICE));
  const fn = code.slice(code.indexOf("export async function handleStripePaymentSuccess"));

  // §17's posture: detect, never silently swallow and never repair.
  assert.match(fn, /REFUSED to promote booking=/, "a refused booking promotion must be logged");
  assert.match(fn, /REFUSED to promote option=/, "a refused option promotion must be logged");

  // §13: a fee event against a booking this handler refused to confirm is the money-side of the
  // same claim, so the ledger write sits INSIDE the confirmed gate.
  const gate = fn.indexOf("if (bookingIsConfirmed)");
  const ledger = fn.indexOf("recordTravelerServiceFeeLedger(");
  assert.ok(gate >= 0, "the handler must know whether the booking actually ended up confirmed");
  assert.ok(ledger > gate, "the traveler-fee ledger write must sit inside that gate");
});

test("C9: the deleted self-report rail stays deleted — route AND storage writer", () => {
  // §18c, executed rather than recorded (ledger `2026-09-12-delete-dead-transport-status`).
  //
  // Yesterday's lane GATED `PATCH /api/transport-booking-options/:optionId/status` and reported
  // that it had ZERO callers in client/ or e2e/; the decision-maker ruled the same day that a gated
  // dead rail is still a rail, and both halves were deleted: the route with its pick-based schema,
  // its `TRAVELER_SELF_REPORT_STATUSES` value set and its `resolveOptionScope` helper, and the
  // orphaned `storage.updateTransportBookingOptionStatus` — an UNCONDITIONAL, ungated writer of
  // `transport_booking_options.booking_status` with no ownership check and no from-state guard,
  // which C9 previously only fenced.
  //
  // This pin is what keeps either half from being re-added: a second writer of that column would
  // bypass the payment signal's atomic conditional (C6/C7) exactly as the original V-7 hole did.
  //
  // NEGATIVE SPACE: it is a NAME/PATH scan over the file SET with comments stripped, so a rail that
  // reaches the column under a DIFFERENT name or a differently-spelled path is outside the
  // predicate — C6/C7 remain the pins on the promotion's own shape. It says nothing about whether
  // the rail SHOULD return: re-adding it is a decision-maker's call, and this pin failing is the
  // prompt to make one, not a verdict.
  const forbidden: Array<[string, string]> = [
    ["updateTransportBookingOptionStatus", "the unconditional status writer"],
    ["/api/transport-booking-options/:optionId/status", "the deleted self-report route"],
  ];

  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        const code = stripComments(readFileSync(full, "utf8"));
        for (const [needle, what] of forbidden) {
          if (code.includes(needle)) offenders.push(`${relative(ROOT, full)} — ${what}`);
        }
      }
    }
  };
  // server/ is where either half would come back; client/ and e2e/ are scanned for the PATH because
  // a dead endpoint here answers 200-HTML from the Vite catch-all, never a 404 (CLAUDE.md §9), so a
  // re-added caller would fail silently rather than loudly.
  for (const root of ["server", "client", "e2e"]) walk(join(ROOT, root));

  assert.deepEqual(
    offenders,
    [],
    "the deleted transport self-report rail has come back — §18c deleted it because a state-bearing " +
      "writer with no consumer is an unaudited way to mutate booking_status",
  );
});

test("C10: authorizeTransportScope keeps its requireWriteAccess passthrough", () => {
  // KEPT DELIBERATELY by the deletion lane. The self-report PATCH was the only caller that passed
  // `requireWriteAccess: true`, but the passthrough is a general capability, not that route's
  // machinery: it is how any MUTATION on a transport scope gets Locked Decision 12's WRITE statuses
  // (`accepted`/`assigned`, never `pending`) out of the SHARED `authorizeTripLogistics` instead of
  // re-deriving that decision locally (§18 rule 1). Deleting it with its one caller would have
  // undone an improvement for an unrelated reason, and the next transport mutation would land
  // without it.
  const code = stripComments(read(TRANSPORT_ROUTES));

  assert.match(
    code,
    /async function authorizeTransportScope\([\s\S]{0,400}?options\?:\s*\{\s*requireWriteAccess\?:\s*boolean\s*\}/,
    "the shared transport authorizer must still ACCEPT a requireWriteAccess option",
  );
  assert.match(
    code,
    /return authorizeTripLogistics\([^)]*,\s*options\)/,
    "and must still FORWARD it to authorizeTripLogistics — an accepted-but-dropped option is worse " +
      "than none, since a caller would believe LD 12 was applied",
  );
});
