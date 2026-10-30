/**
 * Row 283 (ledger `2026-10-29-apple-pay-domain-check`): the read-only Stripe payment-method-domain
 * boot check, and the .well-known README matching the files on disk. No Stripe call, no database,
 * no git: the lister is injected.
 *
 *   D1  off unless STRIPE_PAYMENT_DOMAIN_CHECK=1, and with no usable key it makes no call.
 *   D2  the comparison: missing, disabled, Apple Pay not active, and a ready domain.
 *   D3  a problem is one warning naming it; a ready domain warns nothing.
 *   D4  a throwing lister is one warning and the check returns, never throws (boot never fails).
 *   D5  the expected domain is the canonical origin's host (www).
 *   D6  mountWellKnown triggers the check without awaiting it; the check only lists, never registers.
 *   D7  the README says the association file is committed, and it is.
 *
 * Run: npx tsx --test server/utils/__tests__/stripe-payment-domain-check.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  STRIPE_PAYMENT_DOMAIN_CHECK_ENV,
  expectedPaymentDomains,
  paymentDomainProblems,
  warnIfPaymentDomainsUnregistered,
  type PaymentMethodDomainView,
} from "../stripe-payment-domain-check";

const ON = { [STRIPE_PAYMENT_DOMAIN_CHECK_ENV]: "1", STRIPE_SECRET_KEY: "sk_test_row283" } as NodeJS.ProcessEnv;
const READY: PaymentMethodDomainView = { domain_name: "www.traveloure.com", enabled: true, apple_pay: { status: "active" } };

function recorder() {
  const warnings: { obj: Record<string, unknown>; msg: string }[] = [];
  return { warnings, warn: (obj: Record<string, unknown>, msg: string) => warnings.push({ obj, msg }) };
}

test("D1: off unless the env flag is 1; no usable key means no call", async () => {
  let calls = 0;
  const list = async () => { calls++; return [READY]; };
  const r = recorder();
  assert.equal(await warnIfPaymentDomainsUnregistered({ env: {}, list, warn: r.warn }), "off");
  assert.equal(await warnIfPaymentDomainsUnregistered({ env: { [STRIPE_PAYMENT_DOMAIN_CHECK_ENV]: "true" }, list, warn: r.warn }), "off");
  assert.equal(await warnIfPaymentDomainsUnregistered({ env: { [STRIPE_PAYMENT_DOMAIN_CHECK_ENV]: "1" }, list, warn: r.warn }), "no_key");
  assert.equal(
    await warnIfPaymentDomainsUnregistered({ env: { [STRIPE_PAYMENT_DOMAIN_CHECK_ENV]: "1", STRIPE_SECRET_KEY: "sk_live_x" }, list, warn: r.warn }),
    "no_key",
    "outside production a live key is never used",
  );
  assert.equal(calls, 0);
  assert.deepEqual(r.warnings, []);
});

test("D2: the comparison names each problem", () => {
  const expected = ["www.traveloure.com"];
  assert.deepEqual(paymentDomainProblems(expected, []), [{ domain: "www.traveloure.com", problem: "not_registered" }]);
  assert.deepEqual(paymentDomainProblems(expected, [{ ...READY, enabled: false }]), [{ domain: "www.traveloure.com", problem: "disabled" }]);
  assert.deepEqual(paymentDomainProblems(expected, [{ ...READY, apple_pay: { status: "inactive" } }]), [{ domain: "www.traveloure.com", problem: "apple_pay_inactive" }]);
  assert.deepEqual(paymentDomainProblems(expected, [{ ...READY, apple_pay: null }]), [{ domain: "www.traveloure.com", problem: "apple_pay_inactive" }]);
  assert.deepEqual(paymentDomainProblems(expected, [{ ...READY, domain_name: "traveloure.com" }]), [{ domain: "www.traveloure.com", problem: "not_registered" }], "the apex is not the www domain");
  assert.deepEqual(paymentDomainProblems(expected, [{ ...READY, domain_name: "WWW.Traveloure.com" }]), []);
  assert.deepEqual(paymentDomainProblems(expected, [READY]), []);
});

test("D3: a problem is one warning; a ready domain warns nothing", async () => {
  const bad = recorder();
  assert.equal(await warnIfPaymentDomainsUnregistered({ env: ON, list: async () => [], warn: bad.warn }), "warned");
  assert.equal(bad.warnings.length, 1);
  assert.deepEqual(bad.warnings[0].obj, { problems: [{ domain: "www.traveloure.com", problem: "not_registered" }] });
  assert.match(bad.warnings[0].msg, /Payment method domains/);
  const good = recorder();
  assert.equal(await warnIfPaymentDomainsUnregistered({ env: ON, list: async () => [READY], warn: good.warn }), "ok");
  assert.deepEqual(good.warnings, []);
});

test("D4: a failing list is one warning and the check returns", async () => {
  const r = recorder();
  const out = await warnIfPaymentDomainsUnregistered({ env: ON, list: async () => { throw new Error("stripe down"); }, warn: r.warn });
  assert.equal(out, "error");
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(r.warnings[0].obj, { error: "stripe down" });
});

test("D5: the expected domain is the canonical origin's host", () => {
  assert.deepEqual(expectedPaymentDomains(), ["www.traveloure.com"]);
  assert.deepEqual(expectedPaymentDomains("https://example.test"), ["example.test"]);
});

test("D6: mountWellKnown triggers it unawaited, and the check only lists", () => {
  const wk = fs.readFileSync("server/well-known.ts", "utf8");
  assert.ok(wk.includes("void warnIfPaymentDomainsUnregistered();"));
  const src = fs.readFileSync("server/utils/stripe-payment-domain-check.ts", "utf8");
  assert.ok(src.includes("paymentMethodDomains.list("));
  assert.doesNotMatch(src, /paymentMethodDomains\.(create|update|validate)\(/);
});

test("D7: the README says the association file is committed, and it is", () => {
  const readme = fs.readFileSync("client/public/.well-known/README.md", "utf8");
  assert.ok(fs.existsSync("client/public/.well-known/apple-developer-merchantid-domain-association"));
  assert.doesNotMatch(readme, /MISSING|NOT committed/);
  assert.match(readme, /committed in this directory/);
  assert.match(readme, /STRIPE_PAYMENT_DOMAIN_CHECK=1/);
});
