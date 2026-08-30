/**
 * booking-payment-isolation.spec.ts
 *
 * Security regression test: confirms that a provider session cannot see a
 * traveler's Stripe payment intent IDs through GET /api/bookings/:id.
 *
 * Three access tiers are exercised against the same booking row:
 *
 *   1. TRAVELER (owner)  — full row including stripe* fields          → 200 + fields present
 *   2. PROVIDER (earner) — sanitized via sanitizeBookingForExpert()   → 200 + fields absent
 *   3. UNRELATED user    — not traveler, not provider                  → 403
 *
 * Why an integration test (not a unit test)?
 *   The sanitization gate sits at the HTTP handler level. A unit test of
 *   sanitizeBookingForExpert() in isolation cannot catch a future refactor
 *   that bypasses the helper or returns the raw DB row early.
 *
 * Relevant source:
 *   - server/routes/bookings.ts lines 37-79   (the consolidated handler)
 *   - server/utils/data-sanitizer.ts line 146 (sanitizeBookingForExpert)
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import crypto from 'crypto';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000';

// ── SQL helper (psql) ─────────────────────────────────────────────────────────

function sql(query: string): string {
  const db = process.env.DATABASE_URL;
  if (!db) throw new Error('DATABASE_URL is not set — cannot run SQL helper');
  const escaped = query.replace(/'/g, `'\\''`);
  return execSync(`psql '${db}' -t -A -c '${escaped}'`, {
    encoding: 'utf8',
  }).trim();
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

/**
 * Register a new user and return their database id.
 * The request context stores the resulting session cookie automatically so
 * subsequent calls from the same context are authenticated.
 */
async function register(
  req: import('@playwright/test').APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await req.post(`${BASE_URL}/api/auth/register`, {
    data: {
      email,
      password,
      firstName: 'Test',
      lastName: 'User',
      userType: 'user',
    },
  });
  expect(res.status(), `register ${email}`).toBe(201);
  const body = await res.json();
  return body.user.id as string;
}

/**
 * Log in with existing credentials.
 * Used after a server-side role change so the session claims reflect the
 * new role.
 */
async function login(
  req: import('@playwright/test').APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const res = await req.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password },
  });
  expect(res.status(), `login ${email}`).toBe(200);
}

// ── The test ──────────────────────────────────────────────────────────────────

test.describe('GET /api/bookings/:id — payment-field isolation', () => {
  test(
    'provider cannot see stripe intent IDs; traveler sees them; unrelated user gets 403',
    async ({ browser }) => {
      const password = 'Isolate!Test99';
      const suffix = uid();
      const travelerEmail = `isolation-traveler-${suffix}@example.com`;
      const providerEmail = `isolation-provider-${suffix}@example.com`;
      const unrelatedEmail = `isolation-unrelated-${suffix}@example.com`;

      // All mutable state declared upfront so the finally block can clean up
      // regardless of which step fails.
      const bookingId = crypto.randomUUID();
      const fakePaymentIntentId = `pi_test_${uid()}`;
      const fakeDepositIntentId = `pi_dep_${uid()}`;
      const fakeBalanceIntentId = `pi_bal_${uid()}`;

      // Three independent browser contexts — each has its own cookie jar so
      // they maintain separate authenticated sessions.
      const travelerCtx = await browser.newContext();
      const providerCtx = await browser.newContext();
      const unrelatedCtx = await browser.newContext();

      try {
        const travelerReq = travelerCtx.request;
        const providerReq = providerCtx.request;
        const unrelatedReq = unrelatedCtx.request;

        // ── 1. Register all three users ───────────────────────────────────────
        //    All start with role='user' (register enforces this server-side).
        const travelerId = await register(travelerReq, travelerEmail, password);
        const providerId = await register(providerReq, providerEmail, password);
        await register(unrelatedReq, unrelatedEmail, password);

        // ── 2. Elevate provider's role, then re-login ─────────────────────────
        //    Role upgrades require a direct DB write (the API won't allow it).
        //    Re-login forces the session to pick up the new role from claims.
        sql(`UPDATE users SET role = 'service_provider' WHERE id = '${providerId}'`);
        await login(providerReq, providerEmail, password);

        // ── 3. Insert the test booking row with all three stripe intent IDs ───
        sql(`
          INSERT INTO service_bookings
            (id, traveler_id, provider_id, total_amount, status,
             stripe_payment_intent_id, stripe_deposit_intent_id, stripe_balance_intent_id,
             created_at, updated_at)
          VALUES
            ('${bookingId}', '${travelerId}', '${providerId}', '100.00', 'confirmed',
             '${fakePaymentIntentId}', '${fakeDepositIntentId}', '${fakeBalanceIntentId}',
             NOW(), NOW())
        `);

        // ── 4. TRAVELER — positive control: all stripe fields must be present ─
        const travelerRes = await travelerReq.get(`${BASE_URL}/api/bookings/${bookingId}`);
        expect(travelerRes.status(), 'traveler owner should receive 200').toBe(200);
        const travelerBody = await travelerRes.json();

        expect(
          travelerBody.stripePaymentIntentId,
          'traveler must see stripePaymentIntentId',
        ).toBe(fakePaymentIntentId);
        expect(
          travelerBody.stripeDepositIntentId,
          'traveler must see stripeDepositIntentId',
        ).toBe(fakeDepositIntentId);
        expect(
          travelerBody.stripeBalanceIntentId,
          'traveler must see stripeBalanceIntentId',
        ).toBe(fakeBalanceIntentId);

        // ── 5. PROVIDER — stripe fields must be stripped ──────────────────────
        //    sanitizeBookingForExpert() removes these columns for non-admin
        //    sessions.  The booking itself is accessible (200 returned).
        const providerRes = await providerReq.get(`${BASE_URL}/api/bookings/${bookingId}`);
        expect(providerRes.status(), 'provider should receive 200').toBe(200);
        const providerBody = await providerRes.json();

        expect(
          providerBody.stripePaymentIntentId,
          'provider must NOT see stripePaymentIntentId',
        ).toBeUndefined();
        expect(
          providerBody.stripeDepositIntentId,
          'provider must NOT see stripeDepositIntentId',
        ).toBeUndefined();
        expect(
          providerBody.stripeBalanceIntentId,
          'provider must NOT see stripeBalanceIntentId',
        ).toBeUndefined();

        // Sanity: non-sensitive fields are still present in the provider view
        expect(providerBody.id, 'provider can see booking id').toBe(bookingId);
        expect(providerBody.status, 'provider can see booking status').toBe('confirmed');

        // ── 6. UNRELATED user — must receive 403 ─────────────────────────────
        const unrelatedRes = await unrelatedReq.get(`${BASE_URL}/api/bookings/${bookingId}`);
        expect(
          unrelatedRes.status(),
          'unrelated user must receive 403 Access denied',
        ).toBe(403);

        console.log(
          '[booking-payment-isolation] PASS — ' +
            'traveler sees stripe fields; provider does not; unrelated gets 403.',
        );
      } finally {
        // Best-effort cleanup — removes only the test booking row.
        // Ephemeral user accounts created via /api/auth/register are left in
        // place (they have no real data) to avoid cascading FK deletes that
        // could disturb concurrent test runs.
        try {
          sql(`DELETE FROM service_bookings WHERE id = '${bookingId}'`);
        } catch {
          // Non-fatal: the row may not exist if setup failed before the INSERT.
        }
        await travelerCtx.close();
        await providerCtx.close();
        await unrelatedCtx.close();
      }
    },
  );
});
