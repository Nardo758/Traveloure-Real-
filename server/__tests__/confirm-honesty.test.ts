/**
 * confirm-honesty.test.ts — the transport rail's §13/§14/§15/§19 pins: a booking is not
 * "confirmed" until it is, a confirmation code is the server's, and nobody else's row is
 * stampable.
 *
 * Ledger `2026-09-08-transport-confirm-timing` (A-series),
 * `2026-09-08-confirmation-code-is-the-server-s` (B-series) and
 * `2026-09-12-transport-status-self-report-gate` (C-series — punchlist V-7 and V-8).
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
 *    treat that value as a real reservation. Nothing threw, no log line, and the happy path is
 *    identical whether the caller owns the row or not; only a pin on the SHAPE goes red.
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
 *  - THE C-SERIES IS STRUCTURAL, NOT BEHAVIOURAL, and that is its main limit. It proves that the
 *    self-report handler resolves the option, derives its scope, runs the shared authorization and
 *    parses an allowlist whose value set omits `confirmed`; it does NOT execute zod, Postgres or
 *    `authorizeTransportScope`, so it cannot prove a specific non-owner is actually refused, that
 *    `.strict()` rejects the key it is there to reject, or that the SQL `WHERE` matches the rows
 *    intended. Proving those needs a database harness this job does not have. What it CAN do — and
 *    what each defect actually was — is catch the shape coming back.
 *  - C8/C9 read the FROM-STATE lists by name. A promotion that stopped using those constants, or a
 *    THIRD writer of `booking_status` in a file this suite does not read, is outside the predicate.
 *    C10 covers exactly one instance of that third-writer risk (the orphaned storage helper) and
 *    nothing wider.
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
  // REPAIRED by the C-series lane, not weakened. This pin used to count call sites of
  // `storage.updateTransportBookingOptionStatus` and assert the survivor was the PATCH. That helper
  // is no longer called from this file — the self-report rail now issues its own atomic conditional
  // UPDATE (§15), which the unconditional helper could not carry — so a call-site count would now
  // assert a fact about a function nobody uses. The INVARIANT it existed for is unchanged and is
  // asserted directly, and more tightly: the INITIATION handler writes nothing to booking_status,
  // by any route to the column.
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

const SELF_REPORT_ROUTE = "/api/transport-booking-options/:optionId/status";

test("C1: the self-report handler reads nothing raw off req.body", () => {
  const body = handlerBody(read(TRANSPORT_ROUTES), SELF_REPORT_ROUTE);

  // V-7 as it stood: `const { bookingStatus, confirmationRef } = req.body;`.
  assert.ok(
    !/=\s*req\.body\s*;/.test(body),
    "the self-report body must not be destructured raw off req.body (§19: the body is an allowlist)",
  );
  assert.ok(
    !/req\.body\.(bookingStatus|confirmationRef)/.test(body),
    "neither field may be read off req.body directly",
  );
  assert.match(
    body,
    /transportStatusSelfReportSchema\.safeParse\(req\.body\)/,
    "the one admission point is the pick-based allowlist schema",
  );
  assert.match(
    body,
    /if \(!parsed\.success\)[\s\S]{0,200}?res\.status\(400\)/,
    "a body the allowlist refuses must be answered 400, never parsed around",
  );
});

test("C2: the allowlist is pick-based and .strict(), and CANNOT say confirmed", () => {
  const code = stripComments(read(TRANSPORT_ROUTES));

  // §19's required shape: an ALLOWLIST derived from the table's own columns, so a column added to
  // transport_booking_options later is unreachable here until someone names it.
  assert.match(
    code,
    /createInsertSchema\(transportBookingOptions\)\s*\.pick\(\{[\s\S]{0,200}?\}\)/,
    "the self-report schema must be pick-based (a .omit() denylist is the class §19 names)",
  );
  assert.ok(
    !/createInsertSchema\(transportBookingOptions\)\s*\.omit\(/.test(code),
    "a denylist schema over this table would make every future column client-settable by default",
  );
  assert.match(
    code,
    /\.strict\(\)/,
    "the schema must .strict() so an unexpected key is REFUSED, not silently stripped (LD 34)",
  );

  // The whole point of the value set: `confirmed` is the payment's word, never a traveller's.
  const declared = code.match(/TRAVELER_SELF_REPORT_STATUSES\s*=\s*\[([^\]]*)\]/);
  assert.ok(declared, "the self-report value set must be declared once, by name");
  const values = declared![1];
  assert.ok(
    !/confirmed/.test(values),
    "a traveller may not self-report `confirmed` — LD 44 (e): a named actor's purchase attempt and " +
      "a confirmation in hand are different facts, and a human may not type themselves into a " +
      "machine state",
  );
  assert.match(
    code,
    /bookingStatus:\s*z\.enum\(TRAVELER_SELF_REPORT_STATUSES\)/,
    "the enum must be built FROM that one list, never restated at the field (§18 rule 1)",
  );
});

test("C3: the row is resolved and authorized server-side, and every refusal is ONE 404", () => {
  const body = handlerBody(read(TRANSPORT_ROUTES), SELF_REPORT_ROUTE);

  assert.match(body, /storage\.getTransportBookingOptionById\(optionId\)/, "the option must be read");
  assert.match(body, /resolveOptionScope\(option\)/, "its owning scope must be derived server-side");
  assert.match(body, /authorizeTransportScope\(/, "and authorized by the SHARED predicate (§18 rule 1)");
  assert.match(
    body,
    /requireWriteAccess:\s*true/,
    "a self-report is a MUTATION, so the advisor branch takes the WRITE statuses (Locked Decision 12)",
  );
  assert.match(
    body,
    /const userId = getUserId\(req\)/,
    "the actor is the SESSION (§14)",
  );
  assert.ok(
    !/req\.(body|query|params)\.(userId|user_id|ownerId|travelerId)/.test(body),
    "an identity may never arrive from the request (§14) — not on the body, the query or the params",
  );

  // Locked Decision 40's `POST /api/conversations/start` posture: "no such thing" and "not yours"
  // are the SAME sentence, so the rail cannot be used to probe which options exist or whose they
  // are. A 403 anywhere in this handler is that probe.
  assert.ok(
    !/status\(403\)/.test(body),
    "an authorization refusal on this rail must be a 404, never a 403",
  );
  const refusals = (body.match(/return notFound\(\);/g) ?? []).length;
  assert.ok(
    refusals >= 3,
    `expected the absent row, the unownable row and the denied caller each to answer the same ` +
      `404 (found ${refusals} notFound() returns)`,
  );
});

test("C4: a PLATFORM option is refused, before any write", () => {
  const body = handlerBody(read(TRANSPORT_ROUTES), SELF_REPORT_ROUTE);

  const platform = body.indexOf('option.bookingType === "platform"');
  const write = body.search(/\.update\(\s*transportBookingOptions/);
  assert.ok(platform >= 0, "a platform option's status follows its payment and must be refused here");
  assert.ok(write >= 0, "the self-report rail must still write the row it was allowed to write");
  assert.ok(
    platform < write,
    "the platform refusal must precede the UPDATE — otherwise the abandoned-checkout stamp that " +
      "ledger 2026-09-08-transport-confirm-timing removed comes back through this door",
  );
});

test("C5: the self-report UPDATE carries its own from-state guard, and reports what was PERSISTED", () => {
  const body = handlerBody(read(TRANSPORT_ROUTES), SELF_REPORT_ROUTE);

  // §15's shape on a non-money write: the statement IS the guard.
  assert.match(
    body,
    /ne\(transportBookingOptions\.bookingStatus,\s*"confirmed"\)/,
    "a self-report must never overwrite a payment-written confirmation",
  );
  assert.match(
    body,
    /isNull\(transportBookingOptions\.bookingStatus\)/,
    "the un-stamped (NULL) row must be admitted explicitly — `NULL <> 'confirmed'` is NULL, not TRUE",
  );
  assert.ok(
    !/if \([^)]*bookingStatus[^)]*===\s*"confirmed"[^)]*\)[\s\S]{0,200}?\.update\(/.test(body),
    "a check-then-write is the TOCTOU bug, not a guard (§15)",
  );

  // §13: the reply states what the row now holds, never an echo of what the caller sent.
  assert.match(body, /bookingStatus:\s*updated\.bookingStatus/);
  assert.match(body, /confirmationRef:\s*updated\.confirmationRef/);
});

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

test("C9: the unguarded status writer has no caller left in server/", () => {
  // §18c posture, recorded rather than acted on: `storage.updateTransportBookingOptionStatus` is an
  // UNCONDITIONAL writer of booking_status with no ownership check and no from-state guard. Its one
  // caller was the ungated PATCH, which now issues its own gated statement — so the helper is
  // orphaned. It is deliberately NOT deleted by this lane (server/storage.ts is another lane's
  // file), and this pin is what keeps the orphan from being quietly re-adopted as a second writer
  // that bypasses everything C1–C5 assert.
  //
  // NEGATIVE SPACE: it scans `server/**/*.ts` by NAME only, skipping this test file and the storage
  // module that declares it. A caller in client/, e2e/ or scripts/, or one reaching the column by a
  // different helper, is outside this predicate.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".ts")) {
        const rel = relative(ROOT, full);
        if (rel === "server/storage.ts") continue;
        if (stripComments(readFileSync(full, "utf8")).includes("updateTransportBookingOptionStatus(")) {
          offenders.push(rel);
        }
      }
    }
  };
  walk(join(ROOT, "server"));

  assert.deepEqual(
    offenders,
    [],
    "the unconditional status writer has been re-adopted — route it through the gated rail instead",
  );
});
