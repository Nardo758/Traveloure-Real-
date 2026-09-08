/**
 * LEGACY `bookings` RAIL — what the traveler is charged (ledger 2026-09-08-legacy-rail-fee).
 *
 * THE RULING. The traveler pays the price, the concierge fee, real surcharges and the ruled
 * traveler service fee. The provider's COMMISSION is a DEDUCTION FROM THE PAYOUT and is never a
 * line added to the buyer. `2026-09-08-cart-fee-line` landed that on `/api/checkout`; this suite
 * pins it on the OTHER live rail, `POST /api/bookings/process-cart` → `processInstantBookings`.
 *
 * VERIFIED ON THIS RAIL'S OWN ARITHMETIC, not copied across (the lane's own instruction):
 *   • `pricingService.calculatePlatformFees` sets `providerDeduction = platformFee`, and the row is
 *     written with `provider_payout = price − providerDeduction` — so `platformFee` IS WITHHELD
 *     here, and adding it to the charge collected the same commission twice. Pinned by P1/P3.
 *   • There is NO insurance term on this rail (nothing in this path reads or writes
 *     `insurance_fee`) and NO concierge term (`calculatePlatformFees` returns the commission
 *     alone). They are structurally absent, not zero-filled unknowns — P4 pins the snapshot that
 *     says so.
 *
 * WHAT MUST NOT MOVE, and is pinned here: `platform_fee` and `provider_payout` on the row are
 * BYTE-IDENTICAL to before, because the confirm path pays `provider_earnings` from
 * `provider_payout` and recognises `platform_revenue.platform_fee` from `platform_fee`. This lane
 * changed WHO PAYS THE COMMISSION-SHAPED NUMBER, not the number.
 *
 * Run with:
 *   npx tsx --test server/__tests__/legacy-rail-traveler-charge.test.ts
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../db';
import { pricingService } from '../services/pricing.service';
import { stripePaymentService } from '../services/stripe-payment.service';
import { bookingService } from '../services/booking.service';
import type { CartItem } from '../services/booking.service';
import { TRAVELER_CHARGE_SNAPSHOT_KEY, travelerChargeBasis } from '../services/traveler-charge';

// ── the worked example ───────────────────────────────────────────────────────────────────────
const SERVER_PRICE = 400;        // itinerary_items.estimated_cost — the server's own price (§14)
const CLIENT_PRICE = 999;        // what the client claims; must never reach a charge
const COMMISSION = 60;           // the stubbed platform fee == providerDeduction (WITHHELD)
const BAND_RATE = 0.05;          // fee_bands.traveler_service_fee, read through the ONE resolver
const BAND_CAP = 25;             // the band's max_amount — 400 × 0.05 = 20, so the cap is not hit
const TRAVELER_FEE = 20;         // SERVER_PRICE × BAND_RATE
const DEPOSIT = 100;             // stubbed calculateDeposit

/** Reconstruct the literal SQL text of a drizzle `sql` template (StringChunks only). */
function sqlTextOf(q: any): string {
  const out: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (Array.isArray(node.value) && node.value.every((v: any) => typeof v === 'string')) {
      out.push(node.value.join(''));
      return;
    }
    if (Array.isArray(node.queryChunks)) walk(node.queryChunks);
  };
  walk(q?.queryChunks ?? q);
  return out.join(' ');
}

/**
 * The interpolated parameter values of a drizzle `sql` template, in order. A chunk is either a
 * StringChunk (an object whose `value` is an array of literal SQL strings), a nested SQL fragment,
 * or an interpolated VALUE — which is what this returns, `null` included.
 */
function paramsOf(q: any): any[] {
  const out: any[] = [];
  const walk = (node: any) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      if (Array.isArray(node.value) && node.value.every((v: any) => typeof v === 'string')) return; // StringChunk
      if (Array.isArray(node.queryChunks)) { walk(node.queryChunks); return; }
      if ('value' in node) { out.push(node.value); return; }  // a wrapped Param, if drizzle wraps
    }
    out.push(node);
  };
  walk(q?.queryChunks ?? q);
  return out;
}

function makeAiItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'itinerary-item-legacy-charge',
    tripId: 'trip-legacy-charge',
    title: 'Kiyomizu-dera guided walk',
    itemType: 'activity',
    bookingType: 'instant',
    date: '2026-10-02',
    time: '10:00',
    price: CLIENT_PRICE,
    location: 'Kyoto, Japan',
    ...overrides,
  };
}

let originalExecute: typeof db.execute;
let originalTransaction: typeof db.transaction;
let originalCalcFees: typeof pricingService.calculatePlatformFees;
let originalCalcDeposit: typeof pricingService.calculateDeposit;
let originalCreateIntent: typeof stripePaymentService.createPaymentIntent;

/** Every statement the service issued this run, as text — used to prove the absences. */
let seenSql: string[] = [];
/** The parameters of the INSERT INTO bookings statement. */
let insertParams: any[] | null = null;
let insertText = '';
/** The amount handed to Stripe. */
let chargedToStripe: number | null = null;

before(() => {
  originalExecute = db.execute.bind(db);
  originalTransaction = db.transaction.bind(db);
  originalCalcFees = pricingService.calculatePlatformFees.bind(pricingService);
  originalCalcDeposit = pricingService.calculateDeposit.bind(pricingService);
  originalCreateIntent = stripePaymentService.createPaymentIntent.bind(stripePaymentService);
});

after(() => {
  db.execute = originalExecute;
  db.transaction = originalTransaction;
  pricingService.calculatePlatformFees = originalCalcFees;
  pricingService.calculateDeposit = originalCalcDeposit;
  stripePaymentService.createPaymentIntent = originalCreateIntent;
});

function arm() {
  seenSql = [];
  insertParams = null;
  insertText = '';
  chargedToStripe = null;

  (db as any).execute = async (q: unknown) => {
    const text = sqlTextOf(q);
    seenSql.push(text);
    if (/FROM\s+trips/i.test(text)) return { rows: [{ id: 'trip-legacy-charge' }] };
    if (/FROM\s+fee_bands/i.test(text)) {
      // §8: the traveler service fee is BAND-DRIVEN. No literal rate exists in the charge path —
      // the service reads this row through the ONE resolver and multiplies nothing of its own.
      return {
        rows: [{
          id: 'band-traveler-service-fee',
          band_key: 'traveler_service_fee',
          rate: BAND_RATE,
          rate_type: 'percent',
          max_amount: BAND_CAP,
        }],
      };
    }
    if (/FROM\s+itinerary_items/i.test(text)) return { rows: [{ price: String(SERVER_PRICE) }] };
    // Everything else (the trip-entitlement coverage probe included) answers "no rows", which the
    // service reads as NOT covered — the un-waived case, which is the one that must be priced.
    return { rows: [] };
  };

  (db as any).transaction = async (fn: Function) => {
    const mockTx = {
      execute: async (q: unknown) => {
        const text = sqlTextOf(q);
        seenSql.push(text);
        if (/INSERT\s+INTO\s+bookings/i.test(text)) {
          insertText = text;
          insertParams = paramsOf(q);
          return { rows: [{ id: 'booking-legacy-1' }] };
        }
        return { rows: [] };
      },
    };
    return fn(mockTx);
  };

  (pricingService as any).calculatePlatformFees = async (amount: number) => ({
    serviceAmount: amount,
    platformFee: COMMISSION,
    providerDeduction: COMMISSION,   // === platformFee: this is what makes it WITHHELD
    providerPayout: amount - COMMISSION,
    totalAmount: amount + COMMISSION,
  });
  (pricingService as any).calculateDeposit = async () => DEPOSIT;
  (stripePaymentService as any).createPaymentIntent = async (
    _userId: string,
    _bookings: any[],
    amount: number,
  ) => {
    chargedToStripe = amount;
    return { id: 'pi_legacy_stub' };
  };
}

/** Named readers over the INSERT's positional parameters (the column list is pinned in P2). */
function inserted() {
  assert.ok(insertParams, 'expected an INSERT INTO bookings');
  const p = insertParams as any[];
  return {
    serviceAmount: Number(p[10]),
    platformFee: Number(p[11]),
    totalAmount: Number(p[12]),
    providerPayout: Number(p[13]),
    depositAmount: p[15] === null ? null : Number(p[15]),
    balanceAmount: p[16] === null ? null : Number(p[16]),
    metadata: JSON.parse(String(p[17])),
  };
}

describe('legacy `bookings` rail — the traveler is not billed the withheld commission', () => {
  beforeEach(arm);
  afterEach(() => {
    db.execute = originalExecute;
    db.transaction = originalTransaction;
    pricingService.calculatePlatformFees = originalCalcFees;
    pricingService.calculateDeposit = originalCalcDeposit;
    stripePaymentService.createPaymentIntent = originalCreateIntent;
  });

  it('P1 — the charge is price + traveler service fee; the commission is not on it', async () => {
    const result = await bookingService.processCart('user-legacy-1', [makeAiItem()], 'full');
    assert.deepEqual(result.errors, []);

    // BEFORE this lane: 400 + 60 (commission) + 20 (fee) = 480. AFTER: 400 + 20 = 420.
    assert.equal(result.paymentRequired, SERVER_PRICE + TRAVELER_FEE);
    assert.notEqual(
      result.paymentRequired,
      SERVER_PRICE + COMMISSION + TRAVELER_FEE,
      'the withheld commission must not be re-added to the buyer bill',
    );
    assert.equal(chargedToStripe, SERVER_PRICE + TRAVELER_FEE, 'Stripe is charged the same number');
    assert.equal(result.travelerFeeTotal, TRAVELER_FEE);
    assert.equal(result.instantBookings[0].totalAmount, SERVER_PRICE);
    assert.equal(result.instantBookings[0].travelerServiceFee, TRAVELER_FEE);
    // §14: nothing anywhere is derived from the client's price.
    assert.notEqual(result.paymentRequired, CLIENT_PRICE);
    assert.notEqual(result.paymentRequired, CLIENT_PRICE + TRAVELER_FEE);
  });

  it('P2 — the provider payout and the platform fee on the row are unchanged', async () => {
    await bookingService.processCart('user-legacy-2', [makeAiItem()], 'full');
    const row = inserted();

    // The two numbers the confirm path pays and recognises from. Untouched by this lane.
    assert.equal(row.platformFee, COMMISSION);
    assert.equal(row.providerPayout, SERVER_PRICE - COMMISSION);
    assert.equal(row.serviceAmount, SERVER_PRICE);
    // `total_amount` keeps its meaning — the service amount charged to the traveler — and that is
    // now the price alone.
    assert.equal(row.totalAmount, SERVER_PRICE);

    // The positional readers above are only safe while the column list is this one; pin it, so a
    // reorder fails loudly here instead of silently asserting the wrong column.
    assert.match(
      insertText.replace(/\s+/g, ' '),
      /service_amount, platform_fee, total_amount, provider_payout/,
    );
  });

  it('P3 — the row now balances: platform_fee + provider_payout === total_amount', async () => {
    await bookingService.processCart('user-legacy-3', [makeAiItem()], 'full');
    const row = inserted();
    // This identity did NOT hold before the lane (total_amount was price + commission), which is
    // exactly the double-collection stated arithmetically: the buyer's line carried a commission
    // the payout had already given up.
    assert.equal(row.platformFee + row.providerPayout, row.totalAmount);
  });

  it('P4 — the row carries the presence-discriminator, and there is no backfill', async () => {
    await bookingService.processCart('user-legacy-4', [makeAiItem()], 'full');
    const row = inserted();

    const snapshot = row.metadata?.[TRAVELER_CHARGE_SNAPSHOT_KEY];
    assert.ok(snapshot, 'a row priced under A3 must SAY so');
    // 0.00 because this rail resolves no concierge fee at all — not because one came out at zero.
    assert.equal(snapshot.conciergeFee, '0.00');
    assert.equal(travelerChargeBasis(snapshot.conciergeFee), 'a3_snapshot');

    // A PRE-A3 legacy row carries no such key and is therefore read on its OWN arithmetic. On this
    // rail that arithmetic is `total_amount` in both eras — the column has always been the service
    // amount charged to the traveler — so nothing about a historical row is reinterpreted and
    // nothing may be rewritten. Proven negatively: this path issues no UPDATE against `bookings`.
    const legacyMetadata: Record<string, any> = { travelerServiceFee: { charged: 0 } };
    assert.equal(
      travelerChargeBasis(legacyMetadata[TRAVELER_CHARGE_SNAPSHOT_KEY]?.conciergeFee),
      'pre_a3_legacy',
    );
    assert.equal(
      seenSql.filter((t) => /UPDATE\s+bookings/i.test(t)).length,
      0,
      'no backfill: a historical row is never rewritten to the new composition (§13)',
    );
  });

  it('P5 — the traveler fee is band-driven (§8): the band rate on the server price', async () => {
    const result = await bookingService.processCart('user-legacy-5', [makeAiItem()], 'full');
    assert.ok(
      seenSql.some((t) => /FROM\s+fee_bands/i.test(t)),
      'the fee must be resolved from fee_bands, never from a literal in this path',
    );
    assert.equal(result.travelerFeeTotal, Math.round(SERVER_PRICE * BAND_RATE * 100) / 100);
  });

  it('P6 — a deposit line splits the traveler charge, not the charge plus a commission', async () => {
    const result = await bookingService.processCart('user-legacy-6', [makeAiItem()], 'deposit');
    const row = inserted();

    assert.equal(row.depositAmount, DEPOSIT);
    // BEFORE: balance was price + commission − deposit (360). AFTER: price − deposit (300).
    assert.equal(row.balanceAmount, SERVER_PRICE - DEPOSIT);
    assert.equal(
      (row.depositAmount as number) + (row.balanceAmount as number),
      row.totalAmount,
      'deposit + balance === the line traveler charge for the service',
    );
    // Ruling 2026-09-02 / D: the traveler fee is assessed ONCE, at the deposit.
    assert.equal(result.paymentRequired, DEPOSIT + TRAVELER_FEE);
  });
});
