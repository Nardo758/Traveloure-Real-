/**
 * Row 292b — provider payout block wording.
 *
 *   W1  the sentence constant is the approved wording
 *   W2  a render with one admin block (EUR, 15%)
 *   W3  a different admin block (USD, 8%) changes the percent and the amounts
 *   W4  fee and earnings are the given figures, not gross × rate
 *   W5  provisional and closed rows omit the sentence
 *   W6  an unusable rate, currency or amount omits the sentence
 *   W7  the rendered sentence has no PayPal and no payout-timing text
 *   W8  the copy module has no digit percent, no PayPal and no timing text
 *   W9  the provider inbox mounts the block from booking.payoutBlock on the banked
 *       branch only; the expert inbox does not
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/row292b-provider-payout-block-wording.test.tsx
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProviderPayoutBlock } from "../../components/provider/ProviderPayoutBlock";
import {
  PROVIDER_PAYOUT_BLOCK_SENTENCE,
  providerPayoutBlockForState,
  providerPayoutBlockLine,
  type ProviderPayoutBlockValues,
} from "../provider-payout-block-copy";

(globalThis as { React?: typeof React }).React = React;

const APPROVED =
  "Traveler pays {gross} · Traveloure fee {fee} ({rate}%) · You receive {earnings} · Paid to your connected Stripe account.";

const EUR_15: ProviderPayoutBlockValues = {
  gross: 125,
  fee: 18.75,
  keep: 106.25,
  rate: 0.15,
  currency: "eur",
};

const USD_8: ProviderPayoutBlockValues = {
  gross: 80,
  fee: 6.4,
  keep: 73.6,
  rate: 0.08,
  currency: "usd",
};

function fill(gross: string, fee: string, rate: string, earnings: string): string {
  return APPROVED
    .replace("{gross}", gross)
    .replace("{fee}", fee)
    .replace("{rate}", rate)
    .replace("{earnings}", earnings);
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#xB7;|&middot;/g, "·");
}

const TIMING = /paypal|business day|\bdays?\b|within|weekly|instant|held|schedule|hour/i;

test("W1: the sentence is the approved wording", () => {
  assert.equal(PROVIDER_PAYOUT_BLOCK_SENTENCE, APPROVED);
});

test("W2: rendering an admin EUR block", () => {
  const expected = fill("€125.00", "€18.75", "15", "€106.25");
  assert.equal(providerPayoutBlockLine(EUR_15), expected);
  const html = renderToString(<ProviderPayoutBlock block={EUR_15} bookingId="bk-eur" />);
  assert.match(html, /data-testid="provider-payout-block-bk-eur"/);
  assert.equal(textOf(html), expected);
});

test("W3: a different admin rate and currency change the sentence", () => {
  const expected = fill("$80.00", "$6.40", "8", "$73.60");
  assert.equal(providerPayoutBlockLine(USD_8), expected);
  assert.notEqual(providerPayoutBlockLine(USD_8), providerPayoutBlockLine(EUR_15));
  const html = renderToString(<ProviderPayoutBlock block={USD_8} bookingId="bk-usd" />);
  assert.equal(textOf(html), expected);
});

test("W4: fee and earnings are the given figures", () => {
  const block: ProviderPayoutBlockValues = {
    gross: 100,
    fee: 7,
    keep: 93,
    rate: 0.22,
    currency: "usd",
  };
  assert.equal(providerPayoutBlockLine(block), fill("$100.00", "$7.00", "22", "$93.00"));
});

test("W5: provisional and closed rows omit the sentence", () => {
  assert.equal(providerPayoutBlockForState("banked", EUR_15), providerPayoutBlockLine(EUR_15));
  assert.equal(providerPayoutBlockForState("provisional", EUR_15), null);
  assert.equal(providerPayoutBlockForState("closed", EUR_15), null);
  assert.equal(providerPayoutBlockForState("banked", null), null);
});

test("W6: an unusable rate, currency or amount omits the sentence", () => {
  assert.equal(providerPayoutBlockLine({ ...EUR_15, rate: 1.5 }), null);
  assert.equal(providerPayoutBlockLine({ ...EUR_15, rate: -0.01 }), null);
  assert.equal(providerPayoutBlockLine({ ...EUR_15, currency: "not-a-currency" }), null);
  assert.equal(providerPayoutBlockLine({ ...EUR_15, currency: "" }), null);
  assert.equal(providerPayoutBlockLine({ ...EUR_15, gross: Number.NaN }), null);
  assert.equal(providerPayoutBlockLine({ ...EUR_15, fee: -1 }), null);
  assert.equal(providerPayoutBlockLine(null), null);
  assert.equal(providerPayoutBlockLine({ ...EUR_15, rate: 0 }), fill("€125.00", "€18.75", "0", "€106.25"));
  assert.equal(
    providerPayoutBlockLine({ ...USD_8, rate: 1, fee: 80, keep: 0 }),
    fill("$80.00", "$80.00", "100", "$0.00"),
  );
});

test("W7: the rendered sentence has no PayPal and no payout-timing text", () => {
  for (const block of [EUR_15, USD_8]) {
    const html = renderToString(<ProviderPayoutBlock block={block} bookingId="bk" />);
    assert.doesNotMatch(textOf(html), TIMING);
    assert.doesNotMatch(html, /paypal/i);
  }
});

test("W8: the copy module has no digit percent, no PayPal and no timing text", () => {
  const src = readFileSync("client/src/lib/provider-payout-block-copy.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\d+(?:\.\d+)?%/);
  assert.doesNotMatch(src, TIMING);
  assert.equal(src.includes("0.10") || src.includes("0.1"), false);
});

test("W9: the provider inbox mounts the block from the booking; the expert inbox does not", () => {
  const provider = readFileSync("client/src/pages/provider/inbox.tsx", "utf8");
  const expert = readFileSync("client/src/pages/expert/inbox.tsx", "utf8");
  assert.match(provider, /ProviderPayoutBlock/);
  assert.match(provider, /booking\.payoutBlock/);
  assert.match(provider, /providerPayoutBlockForState\(payoutState, booking\.payoutBlock\)/);
  const bankedAt = provider.indexOf('payoutState === "banked"');
  const mountAt = provider.indexOf("<ProviderPayoutBlock");
  const provisionalAt = provider.lastIndexOf('payoutState === "provisional"', mountAt);
  assert.ok(bankedAt > 0 && mountAt > bankedAt, "the block mounts on the banked branch");
  assert.ok(provisionalAt > 0 && provisionalAt < bankedAt);
  assert.equal(provider.includes("Paid to your connected Stripe account"), false);
  assert.doesNotMatch(expert, /ProviderPayoutBlock|provider-payout-block-copy/);
});
