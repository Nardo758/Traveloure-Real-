/**
 * Integration test for policy-enforced cancellation refunds (dev DB + Stripe TEST mode).
 * Run: STRIPE_SECRET_KEY="$(node scripts/dev-stripe-key.cjs)" npx tsx scripts/test-cancellation-refund-integration.ts
 *
 * Covers the reviewer-flagged behaviors:
 *   [1] 50% policy cancellation — Stripe refund of exactly half; proportional (half) platform
 *       revenue reversal keeps the retained share recognised.
 *   [2] Stripe failure (bad PI) → booking status restored → traveler can retry.
 *   [3] Repeat + concurrent refund calls — exactly one refund proceeds (atomic claim),
 *       amount-scoped idempotency key never collides with a prior different-amount attempt.
 *
 * Writes only its own rows and deletes them afterward.
 */
import Stripe from 'stripe';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { stripePaymentService } from '../server/services/stripe-payment.service';
import { quoteCancellationForBooking } from '../server/services/cancellation-policy.service';
import { storage } from '../server/storage';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-12-18.acacia' as any });

let failures = 0;
function check(name: string, cond: boolean, detail?: any) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${cond ? '' : ' :: ' + JSON.stringify(detail)}`);
  if (!cond) failures++;
}

const ids: { bookings: string[]; services: string[]; revenue: string[] } = { bookings: [], services: [], revenue: [] };

async function makeConfirmedPI(amountCents: number): Promise<string> {
  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    payment_method: 'pm_card_visa',
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: { source: 'cancellation-refund-integration-test' },
  });
  if (pi.status !== 'succeeded') throw new Error(`PI not succeeded: ${pi.status}`);
  return pi.id;
}

async function makeBooking(opts: { policy: string | null; total: string; pi: string | null; scheduledDate: string; status?: string }) {
  const userRow = await db.execute(sql`SELECT id FROM users LIMIT 1`);
  const userId = (userRow.rows[0] as any)?.id;
  if (!userId) throw new Error('dev DB has no users');
  const svc = await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, cancellation_policy_type)
    VALUES (gen_random_uuid(), ${userId}, 'CANCEL-TEST service', 'integration test', ${opts.total}, ${opts.policy})
    RETURNING id
  `);
  const serviceId = (svc.rows[0] as any).id;
  ids.services.push(serviceId);
  const bk = await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, stripe_payment_intent_id, booking_details)
    VALUES (gen_random_uuid(), ${serviceId}, ${userId}, ${userId}, ${opts.status ?? 'confirmed'}, ${opts.total}, ${opts.pi},
            ${JSON.stringify({ scheduledDate: opts.scheduledDate })}::jsonb)
    RETURNING id
  `);
  const bookingId = (bk.rows[0] as any).id;
  ids.bookings.push(bookingId);
  return bookingId;
}

async function bookingStatus(id: string): Promise<string> {
  const r = await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`);
  return (r.rows[0] as any).status;
}

async function main() {
  const in3days = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

  // ── [1] 50% partial refund (moderate policy, 3 days out) + proportional revenue reversal ──
  {
    const pi = await makeConfirmedPI(10000); // $100
    const bookingId = await makeBooking({ policy: 'moderate', total: '100.00', pi, scheduledDate: in3days });

    // Recognised platform revenue row for this booking (as checkout would write).
    const rev = await db.execute(sql`
      INSERT INTO platform_revenue (id, source_type, source_id, gross_amount, platform_fee, net_amount, status, description, transaction_date)
      VALUES (gen_random_uuid(), 'service_booking', ${bookingId}, '100.00', '20.00', '20.00', 'recognized', 'integration test', NOW())
      RETURNING id
    `);
    ids.revenue.push((rev.rows[0] as any).id);

    const quote = await quoteCancellationForBooking(bookingId);
    check('[1] quote is 50% / $50.00', quote?.refundPercent === 50 && quote?.refundAmount === 50, quote);

    const reversedRows = await storage.reversePlatformRevenueForBooking(bookingId, new Date(), 0.5);
    check('[1] one revenue row reversed proportionally', reversedRows === 1, reversedRows);
    const net = await db.execute(sql`
      SELECT COALESCE(SUM(platform_fee::numeric), 0) AS net FROM platform_revenue WHERE source_id = ${bookingId}
    `);
    check('[1] retained half of platform fee stays recognised (net $10)', parseFloat((net.rows[0] as any).net) === 10, net.rows[0]);
    const again = await storage.reversePlatformRevenueForBooking(bookingId, new Date(), 0.5);
    check('[1] proportional reversal is idempotent (retry reverses 0 rows)', again === 0, again);

    const result = await stripePaymentService.refundServiceBooking(bookingId, 'test partial', { amountOverride: quote!.refundAmount });
    check('[1] refund amount is exactly $50', (result as any).amount === 50, result);
    const refund = await stripe.refunds.retrieve((result as any).refundId);
    check('[1] Stripe refund is 5000 cents', refund.amount === 5000, refund.amount);
    check('[1] booking status is refunded', (await bookingStatus(bookingId)) === 'refunded');

    // Repeat call (even with a different computed amount) → alreadyRefunded, no second refund.
    const repeat = await stripePaymentService.refundServiceBooking(bookingId, 'retry', { amountOverride: 100 });
    check('[1] repeat refund call is a no-op (alreadyRefunded)', (repeat as any).alreadyRefunded === true, repeat);
    const refunds = await stripe.refunds.list({ payment_intent: pi, limit: 10 });
    check('[1] exactly one Stripe refund exists', refunds.data.length === 1, refunds.data.length);
  }

  // ── [2] Stripe failure → status restored → retryable ──
  {
    const bookingId = await makeBooking({ policy: 'flexible', total: '80.00', pi: 'pi_nonexistent_for_test', scheduledDate: in3days });
    let threw = false;
    try {
      await stripePaymentService.refundServiceBooking(bookingId, 'test failure', { amountOverride: 80 });
    } catch { threw = true; }
    check('[2] refund with bad PI throws', threw);
    check('[2] status restored to confirmed (cancellation retryable, no cancelled-but-unrefunded dead end)',
      (await bookingStatus(bookingId)) === 'confirmed');
    // Retry also fails cleanly and leaves the booking cancellable.
    try { await stripePaymentService.refundServiceBooking(bookingId, 'retry', { amountOverride: 80 }); } catch {}
    check('[2] status still confirmed after retry', (await bookingStatus(bookingId)) === 'confirmed');
  }

  // ── [3] Concurrent refund calls — atomic claim admits exactly one ──
  {
    const pi = await makeConfirmedPI(6000); // $60
    const bookingId = await makeBooking({ policy: 'flexible', total: '60.00', pi, scheduledDate: in3days });
    const [a, b] = await Promise.all([
      stripePaymentService.refundServiceBooking(bookingId, 'concurrent-a', { amountOverride: 60 }).catch((e) => ({ error: String(e) })),
      stripePaymentService.refundServiceBooking(bookingId, 'concurrent-b', { amountOverride: 60 }).catch((e) => ({ error: String(e) })),
    ]);
    const winners = [a, b].filter((r: any) => r.refundId).length;
    const noops = [a, b].filter((r: any) => r.alreadyRefunded).length;
    check('[3] exactly one concurrent caller refunds, the other no-ops', winners === 1 && noops === 1, { a, b });
    const refunds = await stripe.refunds.list({ payment_intent: pi, limit: 10 });
    check('[3] exactly one Stripe refund exists', refunds.data.length === 1, refunds.data.length);
  }

  // Cleanup
  for (const b of ids.bookings) {
    await db.execute(sql`DELETE FROM refunds WHERE booking_id = ${b}`);
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${b}`);
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${b}`);
  }
  for (const s of ids.services) await db.execute(sql`DELETE FROM provider_services WHERE id = ${s}`);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
