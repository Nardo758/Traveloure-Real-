/**
 * The offering card's primary-action label (client/src/lib/storefront-offering-action.ts).
 * Ledgers `2026-09-25-storefront-booking-actions` and `2026-09-25-provider-action-buttons`.
 *
 * Two halves. The HAND-BUILT half constructs `BuyAction` values directly, so a change to the
 * resolver's output shape fails THIS test's types rather than silently drifting. The RESOLVER half
 * (P1–P14) runs real listing rows through the ONE resolver (`resolveBuyAction`) and then the
 * mapper, proving the label a traveler actually sees for every provider shape — the mapper reads
 * the resolved action only and never a listing column (§18 rule 1).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveBuyAction,
  platformListingBookability,
  type BuyAction,
  type BuyActionRow,
  type BuyActionBuyer,
} from "../../../../shared/buy-action";
import {
  storefrontOfferingActionLabel,
  offeringActionLabel,
  offeringActionIsMessageOnly,
  formatNextAvailable,
  offeringShowsNextAvailable,
  storefrontActionCharges,
  storefrontOfferingIntentHash,
  buildStorefrontActionHref,
} from "../storefront-offering-action";

const NO_LANDING = { store: "none" as const, timed: false, placeAnchored: false, forksFinal: false };

function buyAction(over: Partial<BuyAction>): BuyAction {
  return {
    primary: { kind: "add_to_plan", label: "Add to plan" },
    ask: [],
    landing: NO_LANDING,
    ...over,
  };
}

// ─── Hand-built descriptors ───────────────────────────────────────────────────────────────────

test("no server buyAction (e.g. a caller the resolver never ran for) keeps the default label", () => {
  assert.equal(storefrontOfferingActionLabel(undefined), "View & book");
  assert.equal(offeringActionIsMessageOnly(undefined), false);
});

test("a qa_session subject reads 'Start a Q&A Session' on book and on request", () => {
  assert.equal(
    offeringActionLabel(buyAction({ primary: { kind: "book", label: "Book" }, subject: "qa_session" })),
    "Start a Q&A Session",
  );
  assert.equal(
    offeringActionLabel(
      buyAction({ primary: { kind: "request_to_book", label: "Request to book" }, subject: "qa_session" }),
    ),
    "Start a Q&A Session",
  );
});

test("session subject: book -> 'Book a session', request -> 'Request a session'", () => {
  assert.equal(
    offeringActionLabel(buyAction({ primary: { kind: "book", label: "Book" }, subject: "session" })),
    "Book a session",
  );
  assert.equal(
    offeringActionLabel(
      buyAction({
        primary: { kind: "request_to_book", label: "Request to book" },
        refusal: { reason: "availability_unknown" },
        subject: "session",
      }),
    ),
    "Request a session",
  );
});

test("no published price (§14 — never invented) reads 'Request a quote', even for a session", () => {
  assert.equal(
    offeringActionLabel(
      buyAction({
        primary: { kind: "request_to_book", label: "Request to book" },
        refusal: { reason: "no_published_price" },
        subject: "session",
      }),
    ),
    "Request a quote",
  );
});

test("request_quote reads 'Request a quote'", () => {
  assert.equal(
    offeringActionLabel(buyAction({ primary: { kind: "request_quote", label: "Request a quote" } })),
    "Request a quote",
  );
});

test("not_available (Contact or none) is Message only — no buy label at all", () => {
  const hidden = buyAction({ primary: { kind: "message", label: "Contact" }, refusal: { reason: "not_available" } });
  assert.equal(offeringActionLabel(hidden), null);
  assert.equal(offeringActionIsMessageOnly(hidden), true);
  const none = buyAction({ primary: { kind: "none", label: "" }, refusal: { reason: "not_available" } });
  assert.equal(offeringActionLabel(none), null);
  assert.equal(offeringActionIsMessageOnly(none), true);
});

test("stay subject reads 'Check dates' whether it is booked or requested", () => {
  for (const kind of ["book", "request_to_book"] as const) {
    assert.equal(offeringActionLabel(buyAction({ primary: { kind, label: "x" }, subject: "stay" })), "Check dates");
  }
});

test("deposit on a checkout reads 'Reserve with deposit'; a request never does", () => {
  assert.equal(
    offeringActionLabel(buyAction({ primary: { kind: "book", label: "Book" }, subject: "in_person", deposit: true })),
    "Reserve with deposit",
  );
  assert.equal(
    offeringActionLabel(buyAction({ primary: { kind: "request_to_book", label: "Request to book" }, subject: "in_person" })),
    "Request to book",
  );
});

test("ride / bundle / in_person / artifact / async / unclassified verbs", () => {
  const cases: Array<[BuyAction["subject"], "book" | "request_to_book", string]> = [
    ["ride", "book", "Book ride"],
    ["ride", "request_to_book", "Request a ride"],
    ["bundle", "book", "Book bundle"],
    ["bundle", "request_to_book", "Request to book"],
    ["in_person", "book", "Book now"],
    ["in_person", "request_to_book", "Request to book"],
    ["artifact", "book", "Book"],
    ["async", "book", "Book"],
    [undefined, "book", "Book"],
    [undefined, "request_to_book", "Request to book"],
  ];
  for (const [subject, kind, label] of cases) {
    assert.equal(offeringActionLabel(buyAction({ primary: { kind, label: "x" }, subject })), label, `${subject}/${kind}`);
  }
});

test("info-only / written-planning row (add_to_plan) reads 'Add to my plan'", () => {
  assert.equal(offeringActionLabel(buyAction({ primary: { kind: "add_to_plan", label: "Add to plan" } })), "Add to my plan");
});

test("a ready-made or advisor row (buy_ready_made / plan_with) keeps 'View & book' — not authored by this lane", () => {
  assert.equal(offeringActionLabel(buyAction({ primary: { kind: "buy_ready_made", label: "Get this trip" } })), "View & book");
  assert.equal(offeringActionLabel(buyAction({ primary: { kind: "plan_with", label: "Plan with X" } })), "View & book");
});

// ─── Through the ONE resolver: every provider shape, row → action → label ──────────────────────

const MEMBER: BuyActionBuyer = { principal: "member", plans: "one" };

function listing(over: Partial<BuyActionRow>): BuyActionRow {
  return {
    kind: "listing",
    bookability: platformListingBookability("svc-1"),
    deliveryMethod: "in_person",
    productShape: null,
    bookingMode: "instant",
    hasPrice: true,
    hasPublishedAvailability: true,
    isLive: true,
    ...over,
  };
}

function labelFor(over: Partial<BuyActionRow>): string | null {
  return offeringActionLabel(resolveBuyAction(listing(over), MEMBER));
}

const RESOLVED: Array<[string, Partial<BuyActionRow>, string | null]> = [
  ["P1 request-mode in-person", { bookingMode: "request" }, "Request to book"],
  ["P2 hidden listing", { bookingMode: "hidden" }, null],
  ["P3 not live", { isLive: false }, null],
  ["P4 property (stay)", { productShape: "property", deliveryMethod: null }, "Check dates"],
  ["P5 property_room (stay)", { productShape: "property_room", deliveryMethod: null }, "Check dates"],
  ["P6 per_night unit (stay)", { pricingUnit: "per_night" }, "Check dates"],
  ["P7 deposit listing", { takesDeposit: true }, "Reserve with deposit"],
  ["P8 bundle", { productShape: "bundle" }, "Book bundle"],
  ["P9 private transport, instant", { categoryKey: "private_transportation" }, "Book ride"],
  ["P10 private transport, request", { categoryKey: "private_transportation", bookingMode: "request" }, "Request a ride"],
  ["P11 custom_quote WITH a price", { priceType: "custom_quote" }, "Request a quote"],
  ["P12 in-person scheduled instant", {}, "Book now"],
  ["P13 video, published calendar", { deliveryMethod: "video" }, "Book a session"],
  ["P14 call, no calendar", { deliveryMethod: "call", hasPublishedAvailability: false }, "Request a session"],
  ["P15 pdf artifact", { deliveryMethod: "pdf", hasPublishedAvailability: false }, "Book"],
  ["P16 Q&A Session", { deliveryMethod: "async_messaging", offeringTypeKey: "ask_me_anything" }, "Start a Q&A Session"],
  ["P17 priceless instant", { hasPrice: false }, "Request a quote"],
];

for (const [name, over, expected] of RESOLVED) {
  test(`${name} → ${expected === null ? "Message only" : `'${expected}'`}`, () => {
    assert.equal(labelFor(over), expected);
  });
}

test("P18 a deposit on a REQUEST listing is not stated (no checkout, so no deposit claim)", () => {
  const action = resolveBuyAction(listing({ takesDeposit: true, bookingMode: "request" }), MEMBER);
  assert.equal(action.deposit, undefined);
  assert.equal(offeringActionLabel(action), "Request to book");
});

test("formatNextAvailable: null slot renders nothing (§13 — never a guessed date)", () => {
  assert.equal(formatNextAvailable(null), null);
  assert.equal(formatNextAvailable(undefined), null);
});

test("formatNextAvailable: date + time, no known zone — never claims one", () => {
  assert.equal(formatNextAvailable({ date: "2026-11-08", startTime: "14:00" }), "Next available: Nov 8, 2:00 PM");
});

test("formatNextAvailable: date + time + a declared IANA zone", () => {
  assert.equal(
    formatNextAvailable({ date: "2026-11-08", startTime: "09:05" }, "Asia/Tokyo"),
    "Next available: Nov 8, 9:05 AM (Asia/Tokyo)",
  );
});

test("formatNextAvailable: date with no time still renders (an untimed published slot)", () => {
  assert.equal(formatNextAvailable({ date: "2026-01-01", startTime: null }), "Next available: Jan 1");
});

test("storefrontActionCharges: only a checkout landing charges now", () => {
  assert.equal(storefrontActionCharges(buyAction({ landing: { ...NO_LANDING, store: "checkout" } })), true);
  assert.equal(storefrontActionCharges(buyAction({ landing: { ...NO_LANDING, store: "booking_request" } })), false);
  assert.equal(storefrontActionCharges(undefined), false);
});

test("storefrontOfferingIntentHash: book/request-session -> #book, quote -> #quote, else none", () => {
  assert.equal(storefrontOfferingIntentHash("Book a session"), "#book");
  assert.equal(storefrontOfferingIntentHash("Request a session"), "#book");
  assert.equal(storefrontOfferingIntentHash("Request a quote"), "#quote");
  assert.equal(storefrontOfferingIntentHash("Start a Q&A Session"), "");
  assert.equal(storefrontOfferingIntentHash("Add to my plan"), "");
  assert.equal(storefrontOfferingIntentHash("View & book"), "");
});

test("buildStorefrontActionHref: a #book link with a known next-available slot carries its month", () => {
  assert.equal(
    buildStorefrontActionHref("/services/abc", "Book a session", { date: "2026-10-02", startTime: "14:00" }),
    "/services/abc?month=2026-10#book",
  );
});

test("buildStorefrontActionHref: an existing query string gets '&', never a second '?'", () => {
  assert.equal(
    buildStorefrontActionHref("/services/abc?tripId=t1", "Book a session", { date: "2026-10-02", startTime: null }),
    "/services/abc?tripId=t1&month=2026-10#book",
  );
});

test("buildStorefrontActionHref: 'Request a session' never invents a month — it has none by definition", () => {
  assert.equal(buildStorefrontActionHref("/services/abc", "Request a session", null), "/services/abc#book");
});

test("buildStorefrontActionHref: no next-available slot yet — no month param, hash only", () => {
  assert.equal(buildStorefrontActionHref("/services/abc", "Book a session", null), "/services/abc#book");
});

test("buildStorefrontActionHref: a non-#book label never carries a month param, even with a slot", () => {
  assert.equal(
    buildStorefrontActionHref("/services/abc", "Request a quote", { date: "2026-10-02", startTime: null }),
    "/services/abc#quote",
  );
  assert.equal(
    buildStorefrontActionHref("/services/abc", "Add to my plan", { date: "2026-10-02", startTime: null }),
    "/services/abc",
  );
});


test("storefrontOfferingIntentHash: provider verbs land on #book, a stay on #dates", () => {
  for (const label of ["Book now", "Request to book", "Book ride", "Request a ride", "Book bundle", "Reserve with deposit", "Book"]) {
    assert.equal(storefrontOfferingIntentHash(label), "#book", label);
  }
  assert.equal(storefrontOfferingIntentHash("Check dates"), "#dates");
});

test("buildStorefrontActionHref: 'Check dates' lands on #dates and never carries a month", () => {
  assert.equal(
    buildStorefrontActionHref("/services/room", "Check dates", { date: "2026-10-02", startTime: null }),
    "/services/room#dates",
  );
});

test("offeringShowsNextAvailable: a stay never shows a slot time; other subjects do", () => {
  assert.equal(offeringShowsNextAvailable({ subject: "stay" } as BuyAction), false);
  assert.equal(offeringShowsNextAvailable({ subject: "bundle" } as BuyAction), true);
  assert.equal(offeringShowsNextAvailable(undefined), true);
});
