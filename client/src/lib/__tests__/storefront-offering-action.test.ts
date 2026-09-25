/**
 * The storefront offering card's primary-action label (client/src/lib/storefront-offering-action.ts).
 * Ledger `2026-09-25-storefront-booking-actions`. Every row proves the label a real
 * `resolveBuyAction` output would produce — this file constructs `BuyAction` values by hand
 * rather than importing the resolver, so a change to the resolver's shape fails THIS test's
 * types rather than silently drifting.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BuyAction } from "../../../../shared/buy-action";
import {
  storefrontOfferingActionLabel,
  formatNextAvailable,
  type StorefrontOfferingActionRow,
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

test("no server buyAction (e.g. a caller the resolver never ran for) keeps the default label", () => {
  assert.equal(storefrontOfferingActionLabel({}, undefined), "View & book");
});

test("ask_me_anything delivered as async_messaging is a Q&A Session, whatever the buy action says", () => {
  const row: StorefrontOfferingActionRow = {
    deliveryMethod: "async_messaging",
    expertOfferingTypeKey: "ask_me_anything",
  };
  assert.equal(
    storefrontOfferingActionLabel(row, buyAction({ primary: { kind: "book", label: "Book" } })),
    "Start a Q&A Session",
  );
});

test("a video Q&A (ask_me_anything delivered as video) keeps the scheduled-consult branch, not the chat label", () => {
  const row: StorefrontOfferingActionRow = { deliveryMethod: "video", expertOfferingTypeKey: "ask_me_anything" };
  assert.equal(
    storefrontOfferingActionLabel(row, buyAction({ primary: { kind: "book", label: "Book" } })),
    "Book a session",
  );
});

test("instant + scheduled + published availability (video) reads 'Book a session'", () => {
  const row: StorefrontOfferingActionRow = { deliveryMethod: "video" };
  assert.equal(
    storefrontOfferingActionLabel(row, buyAction({ primary: { kind: "book", label: "Book" } })),
    "Book a session",
  );
});

test("call consult with no published availability (request_to_book) reads 'Request a session'", () => {
  const row: StorefrontOfferingActionRow = { deliveryMethod: "call" };
  assert.equal(
    storefrontOfferingActionLabel(
      row,
      buyAction({
        primary: { kind: "request_to_book", label: "Request to book" },
        refusal: { reason: "availability_unknown" },
      }),
    ),
    "Request a session",
  );
});

test("no published price (§14 — never invented) reads 'Request a quote', even for a call consult", () => {
  const row: StorefrontOfferingActionRow = { deliveryMethod: "call" };
  assert.equal(
    storefrontOfferingActionLabel(
      row,
      buyAction({
        primary: { kind: "request_to_book", label: "Request to book" },
        refusal: { reason: "no_published_price" },
      }),
    ),
    "Request a quote",
  );
});

test("priceType === 'custom_quote' reads 'Request a quote' even without a refusal reason", () => {
  const row: StorefrontOfferingActionRow = { deliveryMethod: "call", priceType: "custom_quote" };
  assert.equal(
    storefrontOfferingActionLabel(row, buyAction({ primary: { kind: "request_to_book", label: "Request to book" } })),
    "Request a quote",
  );
});

test("info-only / written-planning row (add_to_plan) reads 'Add to my plan'", () => {
  const row: StorefrontOfferingActionRow = { deliveryMethod: "pdf" };
  assert.equal(
    storefrontOfferingActionLabel(row, buyAction({ primary: { kind: "add_to_plan", label: "Add to plan" } })),
    "Add to my plan",
  );
});

test("an unclassified/fallback resolved row keeps the card's existing default", () => {
  const row: StorefrontOfferingActionRow = {};
  assert.equal(
    storefrontOfferingActionLabel(
      row,
      buyAction({ primary: { kind: "add_to_plan", label: "Add to plan" }, refusal: { reason: "booking_affordance_unknown" } }),
    ),
    "Add to my plan",
  );
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

test("a ready-made or advisor row (buy_ready_made / plan_with) keeps 'View & book' — not authored by this lane", () => {
  const row: StorefrontOfferingActionRow = {};
  assert.equal(
    storefrontOfferingActionLabel(row, buyAction({ primary: { kind: "buy_ready_made", label: "Get this trip" } })),
    "View & book",
  );
  assert.equal(
    storefrontOfferingActionLabel(row, buyAction({ primary: { kind: "plan_with", label: "Plan with X" } })),
    "View & book",
  );
});
