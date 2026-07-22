/**
 * TEST 1 — Race condition: concurrent double-confirm
 *
 * Inserts a real booking row directly (bypassing Stripe gates — we are testing
 * DB transaction semantics, not the full service).  Fires two confirmations
 * concurrently via Promise.all and then asserts:
 *   • exactly 1 provider_earnings row for the booking
 *   • exactly 1 platform_revenue row for the booking
 *   • booking.status === 'confirmed'
 *   • exactly one call succeeded and the other threw BOOKING_ALREADY_CONFIRMED
 *
 * Cleans up all inserted rows on exit (pass or fail).
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

const BOOKING_ID  = `test-race-${crypto.randomUUID()}`;
const PROVIDER_ID_PLACEHOLDER = '__PROVIDER_ID__'; // replaced below

// ── helpers ──────────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function cleanup(bookingId: string, providerId: string) {
  await db.execute(sql`DELETE FROM provider_earnings  WHERE source_id = ${bookingId}`);
  await db.execute(sql`DELETE FROM platform_revenue   WHERE source_id = ${bookingId}`);
  await db.execute(sql`DELETE FROM bookings           WHERE id        = ${bookingId}`);
  // remove test user only if we created one
  await db.execute(sql`DELETE FROM users WHERE id = ${providerId} AND email = 'test-provider-race@traveloure-test.internal'`);
}

// ── core transaction (mirrors confirmBookingPayment's db.transaction block) ──

async function runConfirmTx(bookingId: string, providerId: string, confirmationCode: string): Promise<void> {
  await db.transaction(async (tx) => {
    const updateResult = await tx.execute(sql`
      UPDATE bookings SET
        status = 'confirmed',
        payment_status = 'succeeded',
        confirmed_at = NOW(),
        confirmation_code = ${confirmationCode},
        deposit_paid = true,
        stripe_payment_intent_id = ${'pi_test_' + confirmationCode}
      WHERE id = ${bookingId}
        AND status = 'pending_payment'
      RETURNING id
    `);

    if (!updateResult.rows || updateResult.rows.length === 0) {
      const err = new Error(
        `Booking ${bookingId} was not in 'pending_payment' status — concurrent confirmation detected`
      );
      (err as any).code = 'BOOKING_ALREADY_CONFIRMED';
      throw err;
    }

    // provider_earnings insert
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

    // platform_revenue insert
    const revenueId = crypto.randomUUID();
    await tx.execute(sql`
      INSERT INTO platform_revenue (
        id, source_type, source_id, gross_amount, platform_fee,
        net_amount, processing_fees, provider_id, provider_earnings,
        description, status, transaction_date, created_at
      ) VALUES (
        ${revenueId}, 'booking_commission', ${bookingId},
        '100.00', '20.00',
        '17.12', '2.88',
        ${providerId}, '80.00',
        ${'Test platform revenue for ' + bookingId},
        'recorded', NOW(), NOW()
      )
    `);
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('TEST 1 — Race condition: concurrent double-confirm');
  console.log('══════════════════════════════════════════════════\n');

  // 1. Find or create a provider user (FK required by provider_earnings)
  const existingUser = await db.execute(sql`SELECT id FROM users LIMIT 1`);
  let providerId: string;
  let createdUser = false;

  if (existingUser.rows.length > 0) {
    providerId = (existingUser.rows[0] as any).id as string;
    console.log(`Using existing user as provider: ${providerId}`);
  } else {
    providerId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO users (id, email, role, created_at)
      VALUES (${providerId}, 'test-provider-race@traveloure-test.internal', 'provider', NOW())
    `);
    createdUser = true;
    console.log(`Created test provider user: ${providerId}`);
  }

  // 2. Insert a booking row at status='pending_payment'
  const bookingId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO bookings (
      id, user_id, provider_id, status, payment_status,
      service_amount, platform_fee, total_amount, provider_payout,
      travelers, title, created_at, updated_at
    ) VALUES (
      ${bookingId}, ${providerId}, ${providerId}, 'pending_payment', 'pending',
      '80.00', '20.00', '100.00', '80.00',
      1, 'Test Race Condition Booking', NOW(), NOW()
    )
  `);
  console.log(`Inserted test booking: ${bookingId}\n`);

  const results: Array<{ label: string; ok: boolean; error?: string }> = [];

  try {
    // 3. Fire two confirms simultaneously
    console.log('Firing two concurrent confirmations via Promise.all...');
    const confirmA = runConfirmTx(bookingId, providerId, 'CODE-A').then(() => 'A-succeeded').catch((e: any) => `A-threw:${e?.code ?? e?.message}`);
    const confirmB = runConfirmTx(bookingId, providerId, 'CODE-B').then(() => 'B-succeeded').catch((e: any) => `B-threw:${e?.code ?? e?.message}`);
    const [resultA, resultB] = await Promise.all([confirmA, confirmB]);

    console.log(`  Request A: ${resultA}`);
    console.log(`  Request B: ${resultB}\n`);

    // 4. Query the DB for actual state
    const bookingRow = await db.execute(sql`SELECT status, confirmation_code FROM bookings WHERE id = ${bookingId}`);
    const earningsRows = await db.execute(sql`SELECT id FROM provider_earnings WHERE source_id = ${bookingId}`);
    const revenueRows = await db.execute(sql`SELECT id FROM platform_revenue WHERE source_id = ${bookingId}`);

    const bookingStatus = (bookingRow.rows[0] as any)?.status;
    const earningsCount = earningsRows.rows.length;
    const revenueCount  = revenueRows.rows.length;

    console.log('── DB state after concurrent confirms ──');
    console.log(`  bookings.status          : ${bookingStatus}`);
    console.log(`  provider_earnings rows   : ${earningsCount}`);
    console.log(`  platform_revenue rows    : ${revenueCount}\n`);

    // 5. Assertions
    const oneSucceeded = (resultA === 'A-succeeded' && resultB.startsWith('B-threw')) ||
                         (resultB === 'B-succeeded' && resultA.startsWith('A-threw'));
    const thrownCode   = resultA.startsWith('A-threw') ? resultA : resultB;
    const codeCorrect  = thrownCode.includes('BOOKING_ALREADY_CONFIRMED');

    results.push({ label: 'Exactly one call succeeded',                   ok: oneSucceeded });
    results.push({ label: 'The other threw BOOKING_ALREADY_CONFIRMED',    ok: codeCorrect });
    results.push({ label: 'booking.status === "confirmed"',               ok: bookingStatus === 'confirmed' });
    results.push({ label: 'Exactly 1 provider_earnings row (not 2)',      ok: earningsCount === 1 });
    results.push({ label: 'Exactly 1 platform_revenue row (not 2)',       ok: revenueCount  === 1 });

  } finally {
    await cleanup(bookingId, createdUser ? providerId : '');
    console.log('Cleaned up test rows.\n');
  }

  // 6. Report
  let allPassed = true;
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`  ${icon}  ${r.label}`);
    if (!r.ok) allPassed = false;
  }

  console.log('\n' + (allPassed ? '✅ TEST 1 PASSED' : '❌ TEST 1 FAILED'));
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
