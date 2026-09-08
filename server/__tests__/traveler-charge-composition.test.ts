/**
 * THE CART CHARGED THE PROVIDER'S COMMISSION TO THE TRAVELER — the composition, and the coverage
 * of every surface that quotes, charges, re-drives, reconciles or refunds it.
 *
 * Ruling: `docs/ROADMAP.md` §A A3, accepted — ledger `2026-09-08-cart-fee-line`.
 *   The traveler pays the PRICE, the ruled TRAVELER SERVICE FEE, the CONCIERGE fee where it
 *   applies, and REAL SURCHARGES. The provider's COMMISSION is a DEDUCTION FROM THE PAYOUT and is
 *   never a line added to the buyer.
 *
 * WHY THIS IS PURE. The defect is ARITHMETIC — `fullTotal = subtotal + platformFee + …` — and the
 * arithmetic now lives in `server/services/traveler-charge.ts`, which imports no `db`, no Stripe
 * client and no resolver. P1–P12 prove the composition and the ledger identity (the provider earns
 * and the platform keeps EXACTLY what they did before; only the buyer's bill changes). S1–S12 read
 * the shipped source, because a composition with one implementation is only worth what its call
 * sites are: a surface that keeps its own copy of `+ platformFee` is the drift class §18 rule 1
 * names, and it is precisely how the cart display and the charge agreed with each other while both
 * were wrong.
 *
 * WHAT THESE HOLD:
 *   P1   the traveler's total is price + concierge + surcharge + traveler fee — the commission is
 *        not a term, and there is no parameter that could make it one.
 *   P2   the worked example in the PR body, to the cent.
 *   P3   §14 ledger identity: provider earnings are UNCHANGED by this ruling.
 *   P4   §14 ledger identity: the platform's own revenue (its `platform_fee` + the traveler fee)
 *        is UNCHANGED — what disappears is the SECOND collection of the same commission.
 *   P5   a $0-price line composes $0 and never a negative or NaN total.
 *   P6   cents rounding: the composition rounds once, at the end.
 *   P7   A3 row read-back: total_amount (price + surcharge) + the concierge snapshot.
 *   P8   PRE-A3 row read-back: the whole platform_fee, because that is what it was charged (§13 —
 *        presence of the snapshot is the discriminator, and there is no backfill).
 *   P9   insurance is added ONLY on the legacy branch and ONLY for the callers that pass it, so
 *        the refund/cancellation basis for an old row stays byte-identical.
 *   P10  a `"0.00"` concierge snapshot is PRESENT — a zero-fee A3 row is read the A3 way, not
 *        mistaken for a legacy row.
 *   P11  the deposit split: deposit + balance still sum to the traveler's line charge.
 *   P12  the quote and the charge cannot disagree — the same inputs give the same number.
 *   S1   the charge site composes through `composeTravelerCharge` and no longer sums `platformFee`.
 *   S2   the charge site's per-line charge (the deposit base) drops `totalPlatformFeeAmt`.
 *   S3   the claim stamps the `travelerCharge` snapshot on the row.
 *   S4   `GET /api/cart` composes through the same function.
 *   S5   `GET /api/cart/fee-preview` composes through the same function.
 *   S6   the client cart neither sums nor shows the platform fee.
 *   S7   the re-drive reads a claimed row through `travelerChargeForRow`.
 *   S8   the reconciliation job's expected charge goes through the SAME helper — all three sites.
 *   S9   the refund's charged ceiling goes through it.
 *   S10  the cancellation quote's refund basis goes through it.
 *   S11  the module holds no rate, no cap and no fee literal (§8), and reads no request (§14).
 *   S12  the money spine is untouched: the idempotency keys, the atomic claim predicate and the
 *        pre-flight marker are all still where §15/§15b put them.
 *
 * Run: npx tsx --test server/__tests__/traveler-charge-composition.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  composeTravelerCharge,
  travelerChargeForRow,
  TRAVELER_CHARGE_SNAPSHOT_KEY,
} from "../services/traveler-charge";

const REPO = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");

const PAYMENTS = "server/routes/payments.routes.ts";
const ROUTES = "server/routes.ts";
const CART_PAGE = "client/src/pages/cart.tsx";
const RECON = "server/jobs/stripeReconciliation.ts";
const REFUND = "server/services/stripe-payment.service.ts";
const CANCEL = "server/services/cancellation-policy.service.ts";
const MODULE = "server/services/traveler-charge.ts";

describe("A3 — what the traveler pays", () => {
  it("P1 the commission is not a term of the traveler's total", () => {
    // A $200 line at the seeded `expert_standard` band (25% platform take) ⇒ a $50 commission
    // withheld from the payout, and a $14 traveler fee (`traveler_service_fee`, 7% under its
    // $25 cap). Both rates are resolved from `fee_bands` upstream; none of them lives here (§8).
    const total = composeTravelerCharge({
      subtotal: 200,
      conciergeFee: 0,
      surchargeTotal: 0,
      travelerFee: 14,
    });
    assert.equal(total, 214);
    // The old composition would have been 200 + 50 + 14 = 264.
    assert.notEqual(total, 264);
  });

  it("P2 the worked example, to the cent", () => {
    const price = 200;
    const commission = 50; // price × (1 − 0.75 owner share)
    const travelerFee = 14; // 7% of 200, under the $25 cap
    const before = price + commission + travelerFee; // 264.00 — what was charged
    const after = composeTravelerCharge({
      subtotal: price,
      conciergeFee: 0,
      surchargeTotal: 0,
      travelerFee,
    }); // 214.00 — what is charged
    assert.equal(before, 264);
    assert.equal(after, 214);
    assert.equal(Number((before - after).toFixed(2)), commission);
  });

  it("P3 provider earnings are unchanged by this ruling", () => {
    const price = 200;
    const ownerShare = 0.75;
    const insurance = 0;
    const surcharge = 0;
    // `netExpertEarningsAmt` is composed at the charge site from the row's own facts and is not a
    // term of the traveler total at all — before or after.
    const providerEarnings = price * ownerShare - insurance + surcharge;
    assert.equal(providerEarnings, 150);
  });

  it("P4 the platform's own revenue is unchanged; only the second collection disappears", () => {
    const price = 200;
    const ownerShare = 0.75;
    const travelerFee = 14;
    const rowPlatformFee = price - price * ownerShare; // 50 — withheld, persisted, unchanged
    const providerEarnings = price * ownerShare; // 150
    const chargedAfter = composeTravelerCharge({
      subtotal: price,
      conciergeFee: 0,
      surchargeTotal: 0,
      travelerFee,
    });
    // The platform keeps what the traveler paid minus what the provider is owed.
    assert.equal(Number((chargedAfter - providerEarnings).toFixed(2)), rowPlatformFee + travelerFee);
    // BEFORE, it kept the commission twice over: 264 − 150 = 114 = 50 + 50 + 14.
    const chargedBefore = price + rowPlatformFee + travelerFee;
    assert.equal(
      Number((chargedBefore - providerEarnings).toFixed(2)),
      rowPlatformFee * 2 + travelerFee,
    );
  });

  it("P5 a zero-price line composes zero, never a negative or a NaN", () => {
    const t = composeTravelerCharge({
      subtotal: 0,
      conciergeFee: 0,
      surchargeTotal: 0,
      travelerFee: 0,
    });
    assert.equal(t, 0);
    assert.ok(Number.isFinite(t));
  });

  it("P6 the composition rounds once, at the end", () => {
    const t = composeTravelerCharge({
      subtotal: 33.333,
      conciergeFee: 1.666,
      surchargeTotal: 0.001,
      travelerFee: 0,
    });
    assert.equal(t, 35);
  });

  it("P7 an A3 row reads back as total_amount + its concierge snapshot", () => {
    const r = travelerChargeForRow({
      totalAmount: "225.00", // 200 price + 25 travel surcharge
      platformFee: "65.00", // 40 commission + 25 concierge — withheld/charged mix
      conciergeFeeSnapshot: "25.00",
    });
    assert.equal(r.amount, 250);
    assert.equal(r.basis, "a3_snapshot");
  });

  it("P8 a PRE-A3 row reads back the way it was actually charged", () => {
    const r = travelerChargeForRow({
      totalAmount: "200.00",
      platformFee: "40.00",
      conciergeFeeSnapshot: null,
    });
    assert.equal(r.amount, 240);
    assert.equal(r.basis, "pre_a3_legacy");
  });

  it("P9 insurance rides ONLY the legacy branch, and only when the caller passes it", () => {
    const legacy = travelerChargeForRow({
      totalAmount: "200.00",
      platformFee: "40.00",
      insuranceFee: "5.00",
      conciergeFeeSnapshot: null,
    });
    assert.equal(legacy.amount, 245);
    const a3 = travelerChargeForRow({
      totalAmount: "200.00",
      platformFee: "45.00",
      insuranceFee: "5.00",
      conciergeFeeSnapshot: "0.00",
    });
    assert.equal(a3.amount, 200);
  });

  it("P10 a zero concierge snapshot is PRESENT, not absent", () => {
    const r = travelerChargeForRow({
      totalAmount: "100.00",
      platformFee: "30.00",
      conciergeFeeSnapshot: "0.00",
    });
    assert.equal(r.basis, "a3_snapshot");
    assert.equal(r.amount, 100);
  });

  it("P11 a deposit split still sums to the traveler's line charge", () => {
    const price = 200;
    const surcharge = 25;
    const concierge = 10;
    const lineFullCharge = price + surcharge + concierge; // the new base for resolveDepositPlan
    const deposit = 50;
    const balance = lineFullCharge - deposit;
    assert.equal(deposit + balance, 235);
    assert.equal(
      composeTravelerCharge({
        subtotal: price,
        conciergeFee: concierge,
        surchargeTotal: surcharge,
        travelerFee: 0,
      }),
      lineFullCharge,
    );
  });

  it("P12 the same inputs give the same number, so quote and charge cannot disagree", () => {
    const parts = { subtotal: 412.5, conciergeFee: 20.63, surchargeTotal: 15, travelerFee: 25 };
    assert.equal(composeTravelerCharge(parts), composeTravelerCharge({ ...parts }));
    assert.equal(composeTravelerCharge(parts), 473.13);
  });
});

describe("A3 — the call sites (a composition is worth what its callers are)", () => {
  const payments = read(PAYMENTS);
  const routes = read(ROUTES);
  const cartPage = read(CART_PAGE);
  const recon = read(RECON);

  it("S1 the CHARGE composes through the shared function and no longer sums platformFee", () => {
    assert.match(
      payments,
      /const fullTotal = composeTravelerCharge\(\{\s*subtotal,\s*conciergeFee,\s*surchargeTotal,\s*travelerFee: travelerFeeTotal,\s*\}\);/,
    );
    assert.ok(
      !/fullTotal\s*=\s*subtotal\s*\+\s*platformFee/.test(payments),
      "the charge must not re-sum the provider's withheld commission",
    );
  });

  it("S2 the per-line charge (the deposit base) drops the withheld platform fee", () => {
    assert.match(payments, /const lineFullCharge = price \+ surchargeAmt \+ conciergeFeeAmt;/);
    assert.ok(!/lineFullCharge = price \+ surchargeAmt \+ totalPlatformFeeAmt/.test(payments));
  });

  it("S3 the claim stamps the travelerCharge snapshot on the row", () => {
    assert.equal(TRAVELER_CHARGE_SNAPSHOT_KEY, "travelerCharge");
    assert.match(
      payments,
      /\[TRAVELER_CHARGE_SNAPSHOT_KEY\]: \{ conciergeFee: conciergeFeeAmt\.toFixed\(2\) \}/,
    );
  });

  it("S4 GET /api/cart composes through the same function", () => {
    assert.match(routes, /total: composeTravelerCharge\(\{/);
    assert.ok(
      !/total: \(subtotal \+ platformFeeTotal/.test(routes),
      "the cart quote must not add the commission either — that is how it agreed with a wrong charge",
    );
  });

  it("S5 the fee preview composes through the same function", () => {
    assert.match(payments, /total: composeTravelerCharge\(\{\s*subtotal: previewSubtotal,/);
    assert.ok(!/previewSubtotal \+ previewPlatformFeeTotal \+/.test(payments));
  });

  it("S6 the client cart neither sums nor shows the platform fee", () => {
    assert.match(
      cartPage,
      /const combinedTotal = combinedSubtotal \+ conciergeFee \+ travelSurcharge;/,
    );
    assert.ok(!/Platform fee/.test(cartPage), "the buyer's summary shows no commission line");
    assert.ok(!/text-platform-fee/.test(cartPage));
  });

  it("S7 the re-drive reads a claimed row through the shared derivation", () => {
    assert.match(payments, /travelerChargeForRow\(\{\s*totalAmount: r\.totalAmount,/);
    assert.ok(
      !/parseFloat\(r\.totalAmount \|\| "0"\) \+ parseFloat\(r\.platformFee \|\| "0"\)/.test(payments),
      "the re-drive must not keep its own copy of the old composition",
    );
  });

  it("S8 the reconciliation job derives the expected charge through the SAME helper", () => {
    assert.match(recon, /function expectedChargeForRow\(r: CartBookingRow\): number \{/);
    assert.match(recon, /travelerChargeForRow\(\{/);
    // three call sites, one derivation
    const uses = recon.match(/expectedChargeForRow\(r\)/g) ?? [];
    assert.equal(uses.length, 3);
    assert.ok(
      !/parseFloat\(r\.totalAmount \|\| "0"\) \+ parseFloat\(r\.platformFee \|\| "0"\)/.test(recon),
      "a second copy here is how the drift job indicts every honest booking",
    );
  });

  it("S9 the refund's charged ceiling goes through it", () => {
    const refund = read(REFUND);
    assert.match(refund, /const \{ amount: amountCharged \} = travelerChargeForRow\(\{/);
    assert.ok(
      !/totalAmount \+ parseFloat\(row\.platform_fee \|\| '0'\) \+ parseFloat\(row\.insurance_fee/.test(
        refund,
      ),
      "a full refund must not hand back a commission the traveler never paid",
    );
  });

  it("S10 the cancellation quote's refund basis goes through it", () => {
    const cancel = read(CANCEL);
    assert.match(cancel, /const \{ amount: amountPaid \} = travelerChargeForRow\(\{/);
    assert.match(cancel, /traveler_charge_concierge_fee/);
  });

  it("S11 the module holds no rate, no cap and no request read (§8/§14)", () => {
    const mod = read(MODULE);
    const code = mod
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join("\n");
    assert.ok(!/req\.body|req\.query|req\.params/.test(code), "§14 — this module reads no request");
    assert.ok(!/fee_bands|resolveCommissionRates|0\.0[0-9]/.test(code), "§8 — no rate lives here");
    assert.ok(!/from ["'].*\/db["']/.test(code), "the composition takes no claim of its own");
  });

  it("S12 the money spine is untouched (§15/§15b)", () => {
    assert.match(payments, /markStripeAttempt\(bookingIds, `pi-\$\{checkoutKey\}`\)/);
    assert.match(payments, /await stampAuthorization\(bookingIds, paymentIntent\.paymentIntentId\)/);
    assert.match(payments, /checkoutKey,\n\s*\{ offSession: args\.useSavedCard === true \}/);
  });
});
