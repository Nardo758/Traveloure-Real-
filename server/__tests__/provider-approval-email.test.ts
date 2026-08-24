/**
 * Provider application approval email — correctness tests.
 *
 * Run with:
 *   npx tsx --test server/__tests__/provider-approval-email.test.ts
 *
 * Coverage:
 * (A) Approval email fires when PATCH status="approved" and the provider user
 *     has an email address.
 * (B) Approval email is NOT sent when status="rejected".
 * (C) Approval email is NOT sent when the provider user has no email address.
 * (C) Approval email is NOT sent when storage.getUser returns null.
 * (D) sendProviderApplicationApprovalEmail does not throw when firstName is null.
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

import { describe, it, before, after, afterEach } from 'node:test';
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
  delete _emailTestHooks.sendProviderApplicationApprovalEmail;
});

afterEach(() => {
  // Restore between tests to keep each test isolated
  (db as any).select = origDbSelect;
  (db as any).insert = origDbInsert;
  (db as any).update = origDbUpdate;
  storage.updateServiceProviderFormStatus = origUpdateServiceProviderFormStatus;
  storage.getUser = origGetUser;
  delete _emailTestHooks.sendProviderApplicationApprovalEmail;
});

// ─── Route-level integration tests ───────────────────────────────────────────

describe('PATCH /api/admin/provider-applications/:id/status — approval email', () => {
  it('(A) fires approval email with correct params when status="approved" and user has an email', async () => {
    const routeHandler = getStatusRouteHandler();

    const capturedEmailCalls: any[] = [];
    _emailTestHooks.sendProviderApplicationApprovalEmail = async (params) => {
      capturedEmailCalls.push(params);
    };

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async (_id, _status, _msg) =>
      makeApprovedApplication(FAKE_PROVIDER_USER_WITH_EMAIL.id) as any;

    storage.getUser = async (userId) =>
      userId === FAKE_PROVIDER_USER_WITH_EMAIL.id
        ? (FAKE_PROVIDER_USER_WITH_EMAIL as any)
        : null;

    const req = makeReq({ body: { status: 'approved' } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.strictEqual(
      capturedEmailCalls.length,
      1,
      'Approval email must be sent exactly once for an approved user with an email',
    );
    assert.deepStrictEqual(capturedEmailCalls[0], {
      toEmail: 'provider@example.com',
      firstName: 'Alice',
    });
  });

  it('(B) does NOT fire approval email when status="rejected"', async () => {
    const routeHandler = getStatusRouteHandler();

    const capturedEmailCalls: any[] = [];
    _emailTestHooks.sendProviderApplicationApprovalEmail = async (params) => {
      capturedEmailCalls.push(params);
    };

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async () =>
      makeRejectedApplication(FAKE_PROVIDER_USER_WITH_EMAIL.id) as any;

    storage.getUser = async () => FAKE_PROVIDER_USER_WITH_EMAIL as any;

    const req = makeReq({ body: { status: 'rejected', rejectionMessage: null } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.strictEqual(
      capturedEmailCalls.length,
      0,
      'Approval email must NOT fire when the application is rejected',
    );
  });

  it('(C) does NOT fire approval email when provider user has no email address', async () => {
    const routeHandler = getStatusRouteHandler();

    const capturedEmailCalls: any[] = [];
    _emailTestHooks.sendProviderApplicationApprovalEmail = async (params) => {
      capturedEmailCalls.push(params);
    };

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async () =>
      makeApprovedApplication(FAKE_PROVIDER_USER_NO_EMAIL.id) as any;

    storage.getUser = async () => FAKE_PROVIDER_USER_NO_EMAIL as any;

    const req = makeReq({ body: { status: 'approved' } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.strictEqual(
      capturedEmailCalls.length,
      0,
      'Approval email must NOT fire when the provider user has no email address',
    );
  });

  it('(C) does NOT fire approval email when storage.getUser returns null', async () => {
    const routeHandler = getStatusRouteHandler();

    const capturedEmailCalls: any[] = [];
    _emailTestHooks.sendProviderApplicationApprovalEmail = async (params) => {
      capturedEmailCalls.push(params);
    };

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async () =>
      makeApprovedApplication('ghost-user') as any;

    storage.getUser = async () => null; // user not found

    const req = makeReq({ body: { status: 'approved' } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.strictEqual(
      capturedEmailCalls.length,
      0,
      'Approval email must NOT fire when the provider user lookup returns null',
    );
  });

  it('route returns 200 with the updated application on success', async () => {
    const routeHandler = getStatusRouteHandler();

    _emailTestHooks.sendProviderApplicationApprovalEmail = async () => {};

    const expectedApp = makeApprovedApplication(FAKE_PROVIDER_USER_WITH_EMAIL.id);

    (db as any).select = (_fields?: any) => makeChain([FAKE_ADMIN_USER]);
    (db as any).insert = (_table: any) => makeChain([]);
    (db as any).update = (_table: any) => makeChain([]);

    storage.updateServiceProviderFormStatus = async () => expectedApp as any;
    storage.getUser = async () => FAKE_PROVIDER_USER_WITH_EMAIL as any;

    const req = makeReq({ body: { status: 'approved' } });
    const res = makeRes();

    await routeHandler(req, res, () => {});

    assert.ok(res.captured.data, 'Route must respond with the updated application');
    assert.strictEqual(res.captured.data.id, 'application-1');
    assert.strictEqual(res.captured.data.status, 'approved');
  });
});

// ─── Email-service unit tests (graceful null/undefined handling) ──────────────

describe('sendProviderApplicationApprovalEmail — graceful handling (no API key)', () => {
  it('(D) does not throw when firstName is null', async () => {
    const { sendProviderApplicationApprovalEmail } = await import(
      '../services/email.service.js'
    );
    await assert.doesNotReject(
      () =>
        sendProviderApplicationApprovalEmail({
          toEmail: 'provider@example.com',
          firstName: null,
        }),
      'Function must not throw when firstName is null',
    );
  });

  it('(D) does not throw when firstName key is omitted (undefined)', async () => {
    const { sendProviderApplicationApprovalEmail } = await import(
      '../services/email.service.js'
    );
    await assert.doesNotReject(
      () =>
        sendProviderApplicationApprovalEmail({
          toEmail: 'provider@example.com',
        } as any),
      'Function must not throw when firstName key is omitted',
    );
  });
});
