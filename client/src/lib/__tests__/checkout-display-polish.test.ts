import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const cart = readFileSync(new URL("../../pages/cart.tsx", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../../components/booking/StripeCheckout.tsx", import.meta.url), "utf8");
const comingUp = readFileSync(new URL("../../components/dashboard/ComingUp.tsx", import.meta.url), "utf8");
const savedHook = readFileSync(new URL("../../hooks/use-saved-payment.ts", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../../pages/ea/calendar.tsx", import.meta.url), "utf8");

test("the optimize nudge reads estimatedCostDelta as dollars", () => {
  assert.equal(cart.includes("estimatedCostDelta / 100"), false);
  assert.match(cart, /estimatedCostDelta/);
  assert.match(cart, /feeCents \/ 100/);
});

test("checkout says Stripe stores the card and names the card being charged", () => {
  assert.equal(/do not store your card details/i.test(cart), false);
  assert.match(cart, /stored by Stripe/);
  assert.match(cart, /savedPaymentMethodId/);
});

test("a card decline is not repeated beside the Payment Element", () => {
  assert.match(checkout, /elementShowsIt/);
  assert.match(checkout, /error\.type === 'card_error'/);
});

test("Coming up does not print the column that produced the row", () => {
  assert.match(comingUp, /upcomingKindLabel/);
  assert.equal(comingUp.includes("{row.source}"), false);
});

test("one-click does not treat the newest saved card as the default", () => {
  assert.equal(savedHook.includes("methods[0]"), false);
});

test("the EA week grid can scroll all seven days", () => {
  assert.match(calendar, /w-max min-w-full/);
});
