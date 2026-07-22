/**
 * Provider application rejection email — correctness tests.
 *
 * Run with:
 *   npx tsx --test server/__tests__/provider-rejection-email.test.ts
 *
 * Coverage:
 * (A) Rejection email fires when PATCH status="rejected" and the provider user
 *     has an email address — including when rejectionMessage is null.
 * (B) Rejection email is NOT sent when status="approved".
 * (C) Rejection email is NOT sent when the provider user has no email address.
 * (D) sendProviderApplicationRejectionEmail does not throw when rejectionMessage
 *     is null or undefined — the "no reason given" case must be safe on its own.
 *
 * Strategy:
 * – The admin router is imported, its route handler extracted from the stack,
 *   and called directly with mock req/res objects (bypasses isAuthenticated).
 * – storage methods are monkey-patched on the shared mutable storage object.
 * – db.select / db.insert / db.update are monkey-patched on the shared db object
 *   so internal helpers (getFullAdminUser, insertNotification, updateUserRole)
 *   return controlled data without touching the database.
 * – The email service's _emailTestHooks seam captures the call params.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── shared singletons ────────────────────────────────────────────────────────
import { db } from '../db.js';
import { storage } from '../storage.js';
import { _emailTestHooks } from '../services/email.service.js';

// ─── the router under test ────────────────────────────────────────────────────
import adminRouter from '../routes/admin.routes.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns a chainable/thenable drizzle-orm mock that resolves to `value`. */
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

/** Finds the actual route handler (last stack entry) for the PATCH status route. */
function getStatusRouteHandler(): (req: any, res: any, next: any) => Promise<void> {
  const targetPath = '/api/admin/provider-applications/:id/status';
  const layer = (adminRouter as any).stack.find(
    (l: any) => l.route?.path === targetPath && l.route?.methods?.patch,
  );
  assert.ok(layer, `Could not find PATCH ${targetPath} in adminRouter`);
  const handlers: any[] = layer.route.stack;
  // handlers[0] = isAuthenticated middleware, handlers[last] = real handler
  return handlers[handlers.length - 1].handle;
}

/** Minimal mock req for an admin user (email-auth shape). */
function makeReq(overrides: Partial<{
  params: Record<string, string>;
  body: Record<string, unknown>;
}>): any {
  return {
    user: { id: 'admin-user-1' },
    params: { id: 'application-1', ...overrides.params },
    body: { ...overrides.body },
    isAuthenticated: () => true,
  };
}

/** Minimal mock res that captures the response. */
function makeRes(): { json: (d: any) => void; status: (c: number) => any; captured: { status: number; data: any } } {
  const captured = { status: 200, data: null as any };
  return {
    captured,
    json(data: any) { captured.data = data; },
    status(code: number) {
      captured.status = code;
      return { json(data: any) { captured.data = data; } };
    },
  };
}

// ─── saved originals ──────────────────────────────────────────────────────────

let origDbSelect: typeof db.select;
let origDbInsert: typeof db.insert;
let origDbUpdate: typeof db.update;
let origUpdateServiceProviderFormStatus: typeof storage.updateServiceProviderFormStatus;
let origGetUser: typeof storage.getUser;
let savedResendKey: string | undefined;

const FAKE_ADMIN_USER = {
  id: 'admin-user-1',
  role: 'admin',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
};

const FAKE_PROVIDER_USER_WITH_EMAIL = {
  id: 'provider-user-1',
  email: 'provider@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  role: 'user',
};

const FAKE_PROVIDER_USER_NO_EMAIL = {
  id: 'provider-user-2',
  email: null,
  firstName: 'Bob',
  lastName: 'Jones',
  role: 'user',
};

function makeRejectedApplication(userId: string) {
  return {
    id: 'application-1',
    userId,
    status: 'rejected',
    rejectionMessage: null,
    businessName: 'Test Biz',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeApprovedApplication(userId: string) {
  return {
    id: 'application-1',
    userId,
    status: 'approved',
    rejectionMessage: null,
    businessName: 'Test Biz',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── test-wide setup/teardown ─────────────────────────────────────────────────

before(() => {
  savedResendKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY; // prevent any real email sends

  origDbSelect = db.select.bind(db);
  origDbInsert = db.insert.bind(db);
  origDbUpdate = db.update.bind(db);
  origUpdateServiceProviderFormStatus = storage.updateServiceProviderFormStatus.bind(storage);
  origGetUser = storage.getUser.bind(storage);
});

after(() => {
  // Restore env
  if (savedResendKey !== undefined) {
    process.env.RESEND_API_KEY = savedResendKey;
  } else {
    delete process.env.RESEND_API_KEY;
  }

  // Restore DB and storage
  (db as any).select = origDbSelect;
  (db as any).insert = origDbInsert;
  (db as any).update = origDbUpdate;
  storage.updateServiceProviderFormStatus = origUpdateServiceProviderFormStatus;
  storage.getUser = origGetUser;

  // Clear email hooks
  delete _emailTestHooks.sendProviderApplicationRejectionEmail;
});

afterEach(() => {
  // Restore between tests to keep each test isolated
  (db as any).select = origDbSelect;
  (db as any).insert = origDbInsert;
  (db as any).update = origDbUpdate;
  storage.updateServiceProviderFormStatus = origUpdateServiceProviderFormStatus;
  storage.getUser = origGetUser;
  delete _emailTestHooks.sendProviderApplicationRejectionEmail;
});

// ─── Route-level integration tests ───────────────────────────────────────────

describe('PATCH /api/admin/provider-applications/:id/status — rejection email', () => {
  it('(A) fires rejection email with correct params when status="rejected" and user has an email', async () => {
    const routeHandler = getStatusRouteHandler();

    const capturedEmailCalls: any[] = [];
    _emailTestHooks.sendProviderApplicationRejectionEmail = async (params) => {
      capturedEmailCalls.push(params);
    };

    // getFullAdminUser → admin user (select returns array, .then unwraps first)
    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    // insertNotification → no-op
    (db as any).insert = (_table: any) => makeChain([]);
    // updateUserRole would use db.update but we're in rejected branch so it shouldn't run
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async (_id, _status, _msg) =>
      makeRejectedApplication(FAKE_PROVIDER_USER_WITH_EMAIL.id) as any;

    storage.getUser = async (userId) =>
      userId === FAKE_PROVIDER_USER_WITH_EMAIL.id
        ? (FAKE_PROVIDER_USER_WITH_EMAIL as any)
        : null;

    const req = makeReq({ body: { status: 'rejected', rejectionMessage: null } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.strictEqual(
      capturedEmailCalls.length,
      1,
      'Rejection email must be sent exactly once for a rejected user with an email',
    );
    assert.deepStrictEqual(capturedEmailCalls[0], {
      toEmail: 'provider@example.com',
      firstName: 'Alice',
      rejectionMessage: null,
    });
  });

  it('(A) fires rejection email with the reviewer note when rejectionMessage is provided', async () => {
    const routeHandler = getStatusRouteHandler();

    const capturedEmailCalls: any[] = [];
    _emailTestHooks.sendProviderApplicationRejectionEmail = async (params) => {
      capturedEmailCalls.push(params);
    };

    const appWithReason = {
      ...makeRejectedApplication(FAKE_PROVIDER_USER_WITH_EMAIL.id),
      rejectionMessage: 'Insufficient documentation.',
    };

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async () => appWithReason as any;
    storage.getUser = async () => FAKE_PROVIDER_USER_WITH_EMAIL as any;

    const req = makeReq({ body: { status: 'rejected', rejectionMessage: 'Insufficient documentation.' } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.strictEqual(capturedEmailCalls.length, 1);
    assert.strictEqual(
      capturedEmailCalls[0].rejectionMessage,
      'Insufficient documentation.',
      'Rejection reason must be passed through to the email params',
    );
  });

  it('(B) does NOT fire rejection email when status="approved"', async () => {
    const routeHandler = getStatusRouteHandler();

    const capturedEmailCalls: any[] = [];
    _emailTestHooks.sendProviderApplicationRejectionEmail = async (params) => {
      capturedEmailCalls.push(params);
    };

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);  // updateUserRole

    storage.updateServiceProviderFormStatus = async () =>
      makeApprovedApplication(FAKE_PROVIDER_USER_WITH_EMAIL.id) as any;

    storage.getUser = async () => FAKE_PROVIDER_USER_WITH_EMAIL as any;

    const req = makeReq({ body: { status: 'approved' } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.strictEqual(
      capturedEmailCalls.length,
      0,
      'Rejection email must NOT fire when the application is approved',
    );
  });

  it('(C) does NOT fire rejection email when provider user has no email address', async () => {
    const routeHandler = getStatusRouteHandler();

    const capturedEmailCalls: any[] = [];
    _emailTestHooks.sendProviderApplicationRejectionEmail = async (params) => {
      capturedEmailCalls.push(params);
    };

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async () =>
      makeRejectedApplication(FAKE_PROVIDER_USER_NO_EMAIL.id) as any;

    storage.getUser = async () => FAKE_PROVIDER_USER_NO_EMAIL as any;

    const req = makeReq({ body: { status: 'rejected', rejectionMessage: 'Policy violation.' } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.strictEqual(
      capturedEmailCalls.length,
      0,
      'Rejection email must NOT fire when the provider user has no email address',
    );
  });

  it('(C) does NOT fire rejection email when storage.getUser returns null', async () => {
    const routeHandler = getStatusRouteHandler();

    const capturedEmailCalls: any[] = [];
    _emailTestHooks.sendProviderApplicationRejectionEmail = async (params) => {
      capturedEmailCalls.push(params);
    };

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async () =>
      makeRejectedApplication('ghost-user') as any;

    storage.getUser = async () => null; // user not found

    const req = makeReq({ body: { status: 'rejected' } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.strictEqual(
      capturedEmailCalls.length,
      0,
      'Rejection email must NOT fire when the provider user lookup returns null',
    );
  });

  it('route returns 200 with the updated application on success', async () => {
    const routeHandler = getStatusRouteHandler();

    _emailTestHooks.sendProviderApplicationRejectionEmail = async () => {};

    const expectedApp = makeRejectedApplication(FAKE_PROVIDER_USER_WITH_EMAIL.id);

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async () => expectedApp as any;
    storage.getUser = async () => FAKE_PROVIDER_USER_WITH_EMAIL as any;

    const req = makeReq({ body: { status: 'rejected' } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.ok(res.captured.data, 'Route must respond with the updated application');
    assert.strictEqual(res.captured.data.id, 'application-1');
    assert.strictEqual(res.captured.data.status, 'rejected');
  });
});

// ─── Email-service unit tests (graceful null/undefined handling) ──────────────

describe('sendProviderApplicationRejectionEmail — graceful handling (no API key)', () => {
  it('(D) does not throw when rejectionMessage is null', async () => {
    const { sendProviderApplicationRejectionEmail } = await import(
      '../services/email.service.js'
    );
    await assert.doesNotReject(
      () =>
        sendProviderApplicationRejectionEmail({
          toEmail: 'provider@example.com',
          firstName: 'Alice',
          rejectionMessage: null,
        }),
      'Function must not throw when rejectionMessage is null',
    );
  });

  it('(D) does not throw when rejectionMessage key is omitted (undefined)', async () => {
    const { sendProviderApplicationRejectionEmail } = await import(
      '../services/email.service.js'
    );
    await assert.doesNotReject(
      () =>
        sendProviderApplicationRejectionEmail({
          toEmail: 'provider@example.com',
          firstName: 'Alice',
          // rejectionMessage intentionally absent
        }),
      'Function must not throw when rejectionMessage key is omitted',
    );
  });

  it('(D) does not throw when firstName is null', async () => {
    const { sendProviderApplicationRejectionEmail } = await import(
      '../services/email.service.js'
    );
    await assert.doesNotReject(
      () =>
        sendProviderApplicationRejectionEmail({
          toEmail: 'provider@example.com',
          firstName: null,
          rejectionMessage: null,
        }),
      'Function must not throw when firstName is null',
    );
  });
});
