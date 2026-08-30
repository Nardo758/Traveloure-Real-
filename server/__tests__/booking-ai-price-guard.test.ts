/**
 * BookingService — AI item price guard tests (§14 enforcement).
 *
 * Verifies two critical behaviors in processInstantBookings:
 *
 *   (A) REJECTION: An AI cart item whose ID has no matching row in
 *       itinerary_items OR itinerary_variant_items is rejected with the
 *       expected error message and is NOT added to the booking list.
 *
 *   (B) SERVER-PRICE-WINS: When the item ID matches an itinerary_items row,
 *       the server's estimated_cost is used as the final price, regardless
 *       of what `price` the client sent.
 *
 * Run with:
 *   npx tsx --test server/__tests__/booking-ai-price-guard.test.ts
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ── shared db object (same instance imported by the service) ────────────────
import { db } from '../db';
import { pricingService } from '../services/pricing.service';
import { stripePaymentService } from '../services/stripe-payment.service';
import { bookingService } from '../services/booking.service';
import type { CartItem } from '../services/booking.service';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Returns a minimal valid CartItem for an AI-generated item (no providerId). */
function makeAiItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-does-not-exist-' + Math.random().toString(36).slice(2),
    tripId: 'trip-test-123',
    title: 'AI Museum Visit',
    itemType: 'activity',
    bookingType: 'instant',
    date: '2026-08-15',
    time: '10:00',
    price: 999,      // client-supplied price — must NOT be trusted
    location: 'Tokyo, Japan',
    ...overrides,
  };
}

// ── monkey-patch bookkeeping ─────────────────────────────────────────────────

type DbExecute   = typeof db.execute;
type DbTransaction = typeof db.transaction;

let originalExecute:       DbExecute;
let originalTransaction:   DbTransaction;
let originalGetPrice:      typeof pricingService.getPrice;
let originalCalcFees:      typeof pricingService.calculatePlatformFees;
let originalCalcDeposit:   typeof pricingService.calculateDeposit;
let originalCreateIntent:  typeof stripePaymentService.createPaymentIntent;

before(() => {
  originalExecute     = db.execute.bind(db);
  originalTransaction = db.transaction.bind(db);
  originalGetPrice    = pricingService.getPrice.bind(pricingService);
  originalCalcFees    = pricingService.calculatePlatformFees.bind(pricingService);
  originalCalcDeposit = pricingService.calculateDeposit.bind(pricingService);
  originalCreateIntent = stripePaymentService.createPaymentIntent.bind(stripePaymentService);
});

after(() => {
  // Restore all originals so any test that runs after this suite sees a clean state.
  db.execute         = originalExecute;
  db.transaction     = originalTransaction;
  pricingService.getPrice               = originalGetPrice;
  pricingService.calculatePlatformFees  = originalCalcFees;
  pricingService.calculateDeposit       = originalCalcDeposit;
  stripePaymentService.createPaymentIntent = originalCreateIntent;
});

// ── (A) rejection test ───────────────────────────────────────────────────────

describe('BookingService — AI item rejection when no price record exists', () => {
  beforeEach(() => {
    let callCount = 0;

    // db.execute call order when no itinerary_items/itinerary_variant_items row exists:
    //   1. tripExists → SELECT id FROM trips …          → row found (trip is valid)
    //   2. itinerary_items lookup                        → no rows
    //   3. itinerary_variant_items fallback lookup       → no rows
    (db as any).execute = async (_sql: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        // tripExists check — trip is valid
        return { rows: [{ id: 'trip-test-123' }] };
      }
      // All subsequent queries (itinerary_items + itinerary_variant_items) return no rows.
      return { rows: [] };
    };

    // transaction should never be reached in the rejection path
    (db as any).transaction = async (_fn: Function) => {
      throw new Error('db.transaction must not be called when item is rejected');
    };

    // Pricing services — should not be invoked for a rejected item
    (pricingService as any).calculatePlatformFees = async () => {
      throw new Error('calculatePlatformFees must not be called for a rejected item');
    };
  });

  afterEach(() => {
    db.execute         = originalExecute;
    db.transaction     = originalTransaction;
    (pricingService as any).calculatePlatformFees = originalCalcFees;
  });

  it('returns an error message containing the item title and item id', async () => {
    const item = makeAiItem({ id: 'ghost-item-abc', title: 'Ghost Activity' });

    const result = await bookingService.processCart(
      'user-test-1',
      [item],
      'full'
    );

    assert.ok(
      result.errors.length > 0,
      'Expected at least one error when AI item has no DB record'
    );

    const priceError = result.errors.find(
      (e) => e.includes('Cannot verify price') && e.includes('Ghost Activity')
    );
    assert.ok(
      priceError !== undefined,
      `Expected a "Cannot verify price" error for "Ghost Activity"; got: ${JSON.stringify(result.errors)}`
    );
  });

  it('does NOT add the rejected item to instantBookings', async () => {
    const item = makeAiItem({ id: 'ghost-item-xyz', title: 'Ghost Activity' });

    const result = await bookingService.processCart(
      'user-test-2',
      [item],
      'full'
    );

    assert.strictEqual(
      result.instantBookings.length,
      0,
      'instantBookings must be empty when the only item is rejected'
    );
  });

  it('error message contains the item id so operators can investigate', async () => {
    const item = makeAiItem({ id: 'sentinel-id-789', title: 'Sentinel Tour' });

    const result = await bookingService.processCart(
      'user-test-3',
      [item],
      'full'
    );

    const priceError = result.errors.find((e) => e.includes('sentinel-id-789'));
    assert.ok(
      priceError !== undefined,
      `Expected error to contain item id "sentinel-id-789"; got: ${JSON.stringify(result.errors)}`
    );
  });
});

// ── (B) server-price-wins test ───────────────────────────────────────────────

describe('BookingService — server estimated_cost overrides client-supplied price', () => {
  const SERVER_PRICE = 150;   // what the DB says
  const CLIENT_PRICE = 999;   // what the client claims (must be ignored)

  beforeEach(() => {
    let callCount = 0;

    // db.execute call order when itinerary_items row IS found:
    //   1. tripExists → SELECT id FROM trips …  → row found
    //   2. itinerary_items lookup                → row with estimated_cost = SERVER_PRICE
    //   (INSERT happens inside db.transaction, not db.execute directly)
    (db as any).execute = async (_sql: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        return { rows: [{ id: 'trip-test-456' }] };
      }
      if (callCount === 2) {
        // itinerary_items row — server price
        return { rows: [{ price: String(SERVER_PRICE) }] };
      }
      // Slot-check inside transaction (if it leaks here)
      return { rows: [] };
    };

    // Simulate the transaction: no slot conflict, return a new booking id.
    (db as any).transaction = async (fn: Function) => {
      const mockTx = {
        execute: async (_sql: unknown) => ({ rows: [{ id: 'booking-inserted-id' }] }),
      };
      return fn(mockTx);
    };

    // Pricing service stubs
    (pricingService as any).calculatePlatformFees = async (_amount: number, _category: string) => ({
      platformFee: 15,
      providerDeduction: 15,
      providerPayout: _amount - 15,
      totalAmount: _amount + 15,
    });
    (pricingService as any).calculateDeposit = async (_total: number) => Math.round(_total * 0.2);

    // Stripe stub
    (stripePaymentService as any).createPaymentIntent = async () => ({ id: 'pi_test_stub' });
  });

  afterEach(() => {
    db.execute         = originalExecute;
    db.transaction     = originalTransaction;
    (pricingService as any).calculatePlatformFees = originalCalcFees;
    (pricingService as any).calculateDeposit      = originalCalcDeposit;
    (stripePaymentService as any).createPaymentIntent = originalCreateIntent;
  });

  it('uses the server estimated_cost, not the client-supplied price', async () => {
    const item = makeAiItem({
      id: 'itinerary-item-real',
      tripId: 'trip-test-456',
      title: 'Museum of Art',
      price: CLIENT_PRICE,   // client lies about price
    });

    const result = await bookingService.processCart(
      'user-test-4',
      [item],
      'full'
    );

    assert.strictEqual(
      result.errors.length,
      0,
      `Expected no errors when DB record exists; got: ${JSON.stringify(result.errors)}`
    );

    assert.ok(
      result.instantBookings.length === 1,
      'Expected exactly one booking to be created'
    );

    const booking = result.instantBookings[0];

    assert.strictEqual(
      booking.serviceAmount,
      SERVER_PRICE,
      `Expected serviceAmount to equal the server price (${SERVER_PRICE}), ` +
      `not the client price (${CLIENT_PRICE}). Got: ${booking.serviceAmount}`
    );

    assert.notStrictEqual(
      booking.serviceAmount,
      CLIENT_PRICE,
      'serviceAmount must NOT equal the untrusted client-supplied price'
    );
  });

  it('total amount reflects server price plus platform fee, not client price', async () => {
    const item = makeAiItem({
      id: 'itinerary-item-real',
      tripId: 'trip-test-456',
      title: 'Museum of Art',
      price: CLIENT_PRICE,
    });

    const result = await bookingService.processCart(
      'user-test-5',
      [item],
      'full'
    );

    const booking = result.instantBookings[0];
    const expectedTotal = SERVER_PRICE + 15;  // SERVER_PRICE + stubbed platformFee

    assert.strictEqual(
      booking.totalAmount,
      expectedTotal,
      `Expected totalAmount ${expectedTotal} (server price + fee); got ${booking.totalAmount}`
    );
  });
});

// ── (C) itinerary_variant_items fallback test ────────────────────────────────

describe('BookingService — falls back to itinerary_variant_items when itinerary_items has no row', () => {
  const VARIANT_PRICE = 200;
  const CLIENT_PRICE  = 999;

  beforeEach(() => {
    let callCount = 0;

    (db as any).execute = async (_sql: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        // tripExists
        return { rows: [{ id: 'trip-test-789' }] };
      }
      if (callCount === 2) {
        // itinerary_items — no row
        return { rows: [] };
      }
      if (callCount === 3) {
        // itinerary_variant_items — row found
        return { rows: [{ price: String(VARIANT_PRICE) }] };
      }
      return { rows: [] };
    };

    (db as any).transaction = async (fn: Function) => {
      const mockTx = {
        execute: async (_sql: unknown) => ({ rows: [{ id: 'booking-variant-id' }] }),
      };
      return fn(mockTx);
    };

    (pricingService as any).calculatePlatformFees = async (_amount: number, _category: string) => ({
      platformFee: 20,
      providerDeduction: 20,
      providerPayout: _amount - 20,
      totalAmount: _amount + 20,
    });
    (pricingService as any).calculateDeposit = async (_total: number) => Math.round(_total * 0.2);
    (stripePaymentService as any).createPaymentIntent = async () => ({ id: 'pi_test_stub' });
  });

  afterEach(() => {
    db.execute         = originalExecute;
    db.transaction     = originalTransaction;
    (pricingService as any).calculatePlatformFees = originalCalcFees;
    (pricingService as any).calculateDeposit      = originalCalcDeposit;
    (stripePaymentService as any).createPaymentIntent = originalCreateIntent;
  });

  it('uses price from itinerary_variant_items when itinerary_items has no match', async () => {
    const item = makeAiItem({
      id: 'variant-item-real',
      tripId: 'trip-test-789',
      title: 'Optimized City Tour',
      price: CLIENT_PRICE,
    });

    const result = await bookingService.processCart(
      'user-test-6',
      [item],
      'full'
    );

    assert.strictEqual(
      result.errors.length,
      0,
      `Expected no errors when variant record exists; got: ${JSON.stringify(result.errors)}`
    );

    assert.ok(result.instantBookings.length === 1, 'Expected one booking');

    assert.strictEqual(
      result.instantBookings[0].serviceAmount,
      VARIANT_PRICE,
      `Expected variant price ${VARIANT_PRICE}; got ${result.instantBookings[0].serviceAmount}`
    );
  });
});
