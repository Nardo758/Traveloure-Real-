/**
 * TEST 2 — Rollback safety: mid-transaction failure
 *
 * Inserts a real booking row, then runs a transaction that:
 *   1. UPDATE bookings → 'confirmed' (succeeds)
 *   2. INSERT provider_earnings              (succeeds)
 *   3. throws a deliberate Error             ← simulates platform_revenue INSERT failing
 *
 * Postgres must roll back steps 1 and 2 entirely.
 * After the throw, asserts:
 *   • booking.status is still 'pending_payment' (the UPDATE was rolled back)
 *   • NO orphaned provider_earnings row for the booking
 *   • NO orphaned platform_revenue row for the booking
 *
 * Cleans up all rows on exit regardless of pass/fail.
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

// ── helpers ───────────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function cleanup(bookingId: string, providerId: string, isTestUser: boolean) {
  await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${bookingId}`);
  await db.execute(sql`DELETE FROM platform_revenue  WHERE source_id = ${bookingId}`);
  await db.execute(sql`DELETE FROM bookings          WHERE id        = ${bookingId}`);
  if (isTestUser) {
    await db.execute(sql`DELETE FROM users WHERE id = ${providerId} AND email = 'test-provider-rollback@traveloure-test.internal'`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('TEST 2 — Rollback safety: mid-transaction failure');
  console.log('══════════════════════════════════════════════════════\n');

  // 1. Resolve a provider user (FK required by provider_earnings)
  const existingUser = await db.execute(sql`SELECT id FROM users LIMIT 1`);
  let providerId: string;
  let isTestUser = false;

  if (existingUser.rows.length > 0) {
    providerId = (existingUser.rows[0] as any).id as string;
    console.log(`Using existing user as provider: ${providerId}`);
  } else {
    providerId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO users (id, email, role, created_at)
      VALUES (${providerId}, 'test-provider-rollback@traveloure-test.internal', 'provider', NOW())
    `);
    isTestUser = true;
    console.log(`Created test provider user: ${providerId}`);
  }

  // 2. Insert a booking at status='pending_payment'
  const bookingId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO bookings (
      id, user_id, provider_id, status, payment_status,
      service_amount, platform_fee, total_amount, provider_payout,
      travelers, title, created_at, updated_at
    ) VALUES (
      ${bookingId}, ${providerId}, ${providerId}, 'pending_payment', 'pending',
      '80.00', '20.00', '100.00', '80.00',
      1, 'Test Rollback Safety Booking', NOW(), NOW()
    )
  `);
  console.log(`Inserted test booking: ${bookingId}`);
  console.log('Initial status: pending_payment\n');

  const results: Array<{ label: string; ok: boolean; detail?: string }> = [];

  try {
    // 3. Run a transaction that succeeds through earnings INSERT but then throws
    console.log('Running transaction: UPDATE ✓ → INSERT earnings ✓ → throw ✗ (deliberate)...');
    let threwAsExpected = false;
    let thrownMessage = '';

    try {
      await db.transaction(async (tx) => {
        // Step 1: UPDATE booking (this succeeds — we want to verify it gets rolled back)
        const updateResult = await tx.execute(sql`
          UPDATE bookings SET
            status = 'confirmed',
            payment_status = 'succeeded',
            confirmed_at = NOW(),
            confirmation_code = 'ROLLBACK-TEST',
            deposit_paid = true,
            stripe_payment_intent_id = 'pi_test_rollback'
          WHERE id = ${bookingId}
            AND status = 'pending_payment'
          RETURNING id
        `);

        if (!updateResult.rows || updateResult.rows.length === 0) {
          throw new Error('Booking not in pending_payment — unexpected in test setup');
        }
        console.log('  Step 1 (UPDATE bookings): executed successfully inside tx');

        // Step 2: INSERT provider_earnings (this succeeds)
        const earningId = crypto.randomUUID();
        await tx.execute(sql`
          INSERT INTO provider_earnings (
            id, provider_id, type, amount, currency,
            source_type, source_id, description, status, available_at, created_at
          ) VALUES (
            ${earningId}, ${providerId}, 'service_booking',
            '80.00', 'USD',
            'booking', ${bookingId},
            ${'Test earnings for ' + bookingId},
            'held', NOW() + INTERVAL '7 days', NOW()
          )
        `);
        console.log('  Step 2 (INSERT provider_earnings): executed successfully inside tx');

        // Step 3: deliberate failure — simulates platform_revenue INSERT throwing
        console.log('  Step 3: throwing deliberate error to simulate platform_revenue failure...');
        throw new Error('DELIBERATE_TEST_FAILURE: simulated platform_revenue INSERT crash');
      });
    } catch (e: any) {
      if (e.message?.includes('DELIBERATE_TEST_FAILURE')) {
        threwAsExpected = true;
        thrownMessage = e.message;
        console.log(`  Transaction threw as expected: "${e.message}"\n`);
      } else {
        throw e; // unexpected error — re-throw
      }
    }

    // 4. Query DB for actual state AFTER the rollback
    const bookingRow    = await db.execute(sql`SELECT status, confirmation_code FROM bookings WHERE id = ${bookingId}`);
    const earningsRows  = await db.execute(sql`SELECT id FROM provider_earnings WHERE source_id = ${bookingId}`);
    const revenueRows   = await db.execute(sql`SELECT id FROM platform_revenue  WHERE source_id = ${bookingId}`);

    const bookingStatus  = (bookingRow.rows[0] as any)?.status;
    const confirmCode    = (bookingRow.rows[0] as any)?.confirmation_code;
    const earningsCount  = earningsRows.rows.length;
    const revenueCount   = revenueRows.rows.length;

    console.log('── DB state after rollback ──');
    console.log(`  bookings.status            : ${bookingStatus}`);
    console.log(`  bookings.confirmation_code : ${confirmCode ?? '(null)'}`);
    console.log(`  provider_earnings rows     : ${earningsCount}`);
    console.log(`  platform_revenue rows      : ${revenueCount}\n`);

    // 5. Assertions
    results.push({
      label: 'Transaction threw as expected (deliberate failure propagated)',
      ok: threwAsExpected,
      detail: thrownMessage,
    });
    results.push({
      label: 'booking.status rolled back to "pending_payment" (not "confirmed")',
      ok: bookingStatus === 'pending_payment',
      detail: `actual: "${bookingStatus}"`,
    });
    results.push({
      label: 'confirmation_code is NULL (UPDATE rolled back)',
      ok: !confirmCode,
      detail: `actual: "${confirmCode}"`,
    });
    results.push({
      label: '0 orphaned provider_earnings rows (INSERT rolled back)',
      ok: earningsCount === 0,
      detail: `actual count: ${earningsCount}`,
    });
    results.push({
      label: '0 orphaned platform_revenue rows (never reached, but verify clean)',
      ok: revenueCount === 0,
      detail: `actual count: ${revenueCount}`,
    });

  } finally {
    await cleanup(bookingId, providerId, isTestUser);
    console.log('Cleaned up test rows.\n');
  }

  // 6. Report
  let allPassed = true;
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    const detail = r.detail ? `  (${r.detail})` : '';
    console.log(`  ${icon}  ${r.label}${detail}`);
    if (!r.ok) allPassed = false;
  }

  console.log('\n' + (allPassed ? '✅ TEST 2 PASSED' : '❌ TEST 2 FAILED'));
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
