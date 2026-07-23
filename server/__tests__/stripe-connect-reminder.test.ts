/**
 * Stripe Connect Reminder Scheduler — correctness tests.
 *
 * Run with:
 *   npx tsx --test server/__tests__/stripe-connect-reminder.test.ts
 *
 * Coverage:
 * (A) New unconnected provider (no stripeAccountId) gets a notification row.
 * (B) Fully-connected provider (stripeAccountStatus = 'complete') is excluded
 *     from the pending query — no notification row inserted.
 * (C) Recently-notified provider (notification within 72 h cooldown) is skipped.
 * (D) runReminders() is a no-op when there are zero pending users.
 *
 * Strategy:
 * – db.select / db.insert are monkey-patched so tests run without a real DB.
 * – runReminders() is private; tests call it via (scheduler as any).runReminders().
 * – A makeSelectSequence() helper lets the two sequential db.select calls inside
 *   runReminders() return different data (pendingUsers first, recentlyNotified second).
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../db.js';
import { stripeConnectReminderScheduler } from '../services/stripe-connect-reminder.service.js';

// ─── chain builder ─────────────────────────────────────────────────────────────

/** Returns a thenable/chainable Drizzle-ORM mock that resolves to `value`. */
function makeChain(value: unknown = null): any {
  const chain: any = {};
  const p = Promise.resolve(value);
  const methods = ['from', 'where', 'set', 'values', 'limit', 'orderBy', 'returning'];
  for (const m of methods) {
    chain[m] = (..._: unknown[]) => chain;
  }
  chain.then = (resolve: any, reject?: any) => p.then(resolve, reject);
  chain.catch = (reject: any) => p.catch(reject);
  chain[Symbol.toStringTag] = 'Promise';
  return chain;
}

/**
 * Returns a db.select mock that cycles through `responses` in order.
 * The first call returns responses[0], the second returns responses[1], etc.
 * Subsequent calls beyond the array length return the last entry.
 */
function makeSelectSequence(responses: unknown[]): () => any {
  let callIndex = 0;
  return (_fields?: any) => {
    const value = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return makeChain(value);
  };
}

// ─── fake user fixtures ────────────────────────────────────────────────────────

const UNCONNECTED_PROVIDER = {
  id: 'prov-unconnected-1',
  role: 'service_provider',
  stripeAccountId: null,
  stripeAccountStatus: null,
};

const CONNECTED_PROVIDER = {
  id: 'prov-connected-1',
  role: 'service_provider',
  stripeAccountId: 'acct_abc',
  stripeAccountStatus: 'complete',
};

const UNCONNECTED_EXPERT = {
  id: 'expert-unconnected-1',
  role: 'local_expert',
  stripeAccountId: null,
  stripeAccountStatus: null,
};

// ─── saved originals ───────────────────────────────────────────────────────────

let origDbSelect: typeof db.select;
let origDbInsert: typeof db.insert;

before(() => {
  origDbSelect = db.select.bind(db);
  origDbInsert = db.insert.bind(db);
});

after(() => {
  (db as any).select = origDbSelect;
  (db as any).insert = origDbInsert;
});

afterEach(() => {
  (db as any).select = origDbSelect;
  (db as any).insert = origDbInsert;
});

// ─── tests ─────────────────────────────────────────────────────────────────────

describe('StripeConnectReminderService.runReminders()', () => {
  it('(A) inserts a notification row for a new unconnected provider', async () => {
    const insertedRows: any[][] = [];

    // First db.select → pending users (the unconnected provider)
    // Second db.select → recently-notified set (empty — never notified before)
    (db as any).select = makeSelectSequence([
      [{ id: UNCONNECTED_PROVIDER.id, role: UNCONNECTED_PROVIDER.role }],
      [], // no recent notifications
    ]);

    (db as any).insert = (_table: any) => {
      return {
        values(rows: any[]) {
          insertedRows.push(rows);
          return Promise.resolve();
        },
      };
    };

    await (stripeConnectReminderScheduler as any).runReminders();

    assert.strictEqual(insertedRows.length, 1, 'insert must be called once');
    assert.strictEqual(insertedRows[0].length, 1, 'exactly one notification row must be inserted');

    const row = insertedRows[0][0];
    assert.strictEqual(row.userId, UNCONNECTED_PROVIDER.id);
    assert.strictEqual(row.type, 'stripe_connect_reminder');
    assert.ok(row.title, 'notification row must have a title');
    assert.ok(row.message, 'notification row must have a message');
    assert.strictEqual(
      row.data?.link,
      '/provider/earnings',
      'provider link must point to /provider/earnings',
    );
  });

  it('(A) local_expert link points to /expert/earnings', async () => {
    const insertedRows: any[][] = [];

    (db as any).select = makeSelectSequence([
      [{ id: UNCONNECTED_EXPERT.id, role: UNCONNECTED_EXPERT.role }],
      [],
    ]);

    (db as any).insert = (_table: any) => ({
      values(rows: any[]) {
        insertedRows.push(rows);
        return Promise.resolve();
      },
    });

    await (stripeConnectReminderScheduler as any).runReminders();

    assert.strictEqual(insertedRows[0][0].data?.link, '/expert/earnings');
  });

  it('(B) connected provider is excluded — no notification inserted', async () => {
    // The DB query itself filters out connected providers, so the first select
    // returns an empty array (the connected provider was filtered at DB level).
    (db as any).select = makeSelectSequence([
      [], // connected provider already excluded by WHERE clause
    ]);

    let insertCalled = false;
    (db as any).insert = (_table: any) => ({
      values(_rows: any[]) {
        insertCalled = true;
        return Promise.resolve();
      },
    });

    await (stripeConnectReminderScheduler as any).runReminders();

    assert.strictEqual(
      insertCalled,
      false,
      'insert must NOT be called when no users are pending',
    );
  });

  it('(C) recently-notified provider is skipped within the 3-day cooldown', async () => {
    let insertCalled = false;

    // First select returns the unconnected provider as pending
    // Second select returns that same provider as recently notified
    (db as any).select = makeSelectSequence([
      [{ id: UNCONNECTED_PROVIDER.id, role: UNCONNECTED_PROVIDER.role }],
      [{ userId: UNCONNECTED_PROVIDER.id }], // already notified recently
    ]);

    (db as any).insert = (_table: any) => ({
      values(_rows: any[]) {
        insertCalled = true;
        return Promise.resolve();
      },
    });

    await (stripeConnectReminderScheduler as any).runReminders();

    assert.strictEqual(
      insertCalled,
      false,
      'insert must NOT be called when the provider was recently notified',
    );
  });

  it('(C) only un-notified providers receive a notification when the list is mixed', async () => {
    const STALE_PROVIDER = { id: 'prov-stale', role: 'service_provider' };
    const FRESH_PROVIDER = { id: 'prov-fresh', role: 'service_provider' };

    const insertedRows: any[][] = [];

    // Both providers are pending (no complete Stripe account)
    // Only STALE_PROVIDER was recently notified
    (db as any).select = makeSelectSequence([
      [STALE_PROVIDER, FRESH_PROVIDER],
      [{ userId: STALE_PROVIDER.id }], // STALE_PROVIDER is in cooldown
    ]);

    (db as any).insert = (_table: any) => ({
      values(rows: any[]) {
        insertedRows.push(rows);
        return Promise.resolve();
      },
    });

    await (stripeConnectReminderScheduler as any).runReminders();

    assert.strictEqual(insertedRows.length, 1, 'insert must be called once');
    assert.strictEqual(insertedRows[0].length, 1, 'exactly one row must be inserted');
    assert.strictEqual(
      insertedRows[0][0].userId,
      FRESH_PROVIDER.id,
      'only the non-recently-notified provider must receive a notification',
    );
  });

  it('(D) runReminders() is a no-op when there are zero pending users', async () => {
    (db as any).select = makeSelectSequence([[]]);

    let insertCalled = false;
    (db as any).insert = (_table: any) => ({
      values(_rows: any[]) {
        insertCalled = true;
        return Promise.resolve();
      },
    });

    await assert.doesNotReject(
      () => (stripeConnectReminderScheduler as any).runReminders(),
      'runReminders must not throw when there are no pending users',
    );

    assert.strictEqual(insertCalled, false, 'insert must not be called when pending list is empty');
  });
});
