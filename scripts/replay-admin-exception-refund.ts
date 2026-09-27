/**
 * replay-admin-exception-refund.ts — REAL-STRIPE, end-to-end proof for lane 4 (ledger
 * `2026-09-27-admin-exception-refund`). Charges real test-mode PaymentIntents, seeds the bookings they
 * paid for, signs in as an ADMIN on a RUNNING app and drives the admin routes over HTTP:
 *
 *   1 quote     — GET shows what was charged (booking + fee)
 *   2 partial   — POST a partial amount: Stripe's own refund is EXACTLY that amount; the booking is
 *                 `refunded`; the access audit log names the admin, the reason and the refund id
 *   3 again     — a second POST is refused (409); Stripe still holds ONE refund
 *   4 disputed  — a disputed booking is refused (409) and Stripe is never asked
 *   5 over      — an amount above the charge is refused (400)
 *   6 non-admin — a traveler is refused (403)
 *
 * DISPOSABLE DB + LOCAL APP ONLY; every seeded row is deleted at the end.
 *   BASE_URL=http://127.0.0.1:5602 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   STRIPE_SECRET_KEY=sk_test_… npx tsx scripts/replay-admin-exception-refund.ts
 */
import { Pool } from "pg";
import crypto from "node:crypto";
import Stripe from "stripe";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5602";
const KEY = process.env.STRIPE_SECRET_KEY ?? "";
if (!/^sk_test_[A-Za-z0-9]{24,}$/.test(KEY)) throw new Error("a real sk_test_ key is required in STRIPE_SECRET_KEY");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const host = new URL(process.env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
  throw new Error(`refusing to seed a non-local database (${host}); opt in with JOURNEY_DB_WRITES_OK=1`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stripe = new Stripe(KEY, { apiVersion: "2024-12-18.acacia" as any, maxNetworkRetries: 2 });
const RUN = crypto.randomUUID().slice(0, 8);
const pw = `Replay-${RUN}-pw!`;
const ids = { admin: `rp-aer-${RUN}-admin`, trav: `rp-aer-${RUN}-trav`, svc: `rp-aer-${RUN}-svc` };
const emails = { admin: `rp-aer-${RUN}-admin@t.test`, trav: `rp-aer-${RUN}-trav@t.test` };
const bookings: string[] = [];
let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
}
function hashPassword(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(p, salt, 64, (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)));
  });
}
async function login(email: string) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function paidBooking(status: string): Promise<{ id: string; pi: string }> {
  const pi = await stripe.paymentIntents.create({ amount: 11500, currency: "usd", payment_method_types: ["card"], payment_method: "pm_card_visa", confirm: true, metadata: { source: "replay-aer", run: RUN } });
  const id = crypto.randomUUID();
  bookings.push(id);
  await pool.query(
    `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, stripe_payment_intent_id, booking_details)
     VALUES ($1, $2, $3, $3, $4, '105.00', '0.00', $5, $6::jsonb)`,
    [id, ids.svc, ids.trav, status, pi.id, JSON.stringify({ travelerServiceFee: { charged: 10, waived: false } })],
  );
  return { id, pi: pi.id };
}
const post = (cookie: string, id: string, body: unknown) =>
  fetch(`${BASE_URL}/api/admin/bookings/${id}/exception-refund`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });

async function main() {
  const hash = await hashPassword(pw);
  for (const [id, email, role] of [[ids.admin, emails.admin, "admin"], [ids.trav, emails.trav, "user"]] as const) {
    await pool.query(
      `INSERT INTO users (id, email, first_name, last_name, password, role, email_verified, terms_accepted_at, privacy_accepted_at, terms_version, privacy_version)
       VALUES ($1, $2, 'Aer', 'Replay', $3, $4, NOW(), NOW(), NOW(), '1.1', '1.0')`,
      [id, email, hash, role],
    );
  }
  await pool.query(`INSERT INTO provider_services (id, user_id, service_name, price) VALUES ($1, $2, 'Aer replay', '105.00')`, [ids.svc, ids.trav]);
  const admin = await login(emails.admin);
  const trav = await login(emails.trav);

  const one = await paidBooking("confirmed");
  console.log("── 1 quote");
  const q = await fetch(`${BASE_URL}/api/admin/bookings/${one.id}/exception-refund`, { headers: { cookie: admin } });
  const qj: any = await q.json();
  check("quote shows booking + fee charged", q.status === 200 && qj.chargedCents === 11500 && qj.feeChargedCents === 1000 && qj.refusal === null, qj);

  console.log("── 2 partial refund");
  const reason = "goodwill: the tour started an hour late";
  const r = await post(admin, one.id, { mode: "partial", amountCents: 4001, reason });
  const rj: any = await r.json();
  check("refund accepted", r.status === 200 && rj.ok === true, rj);
  const refunds = await stripe.refunds.list({ payment_intent: one.pi });
  check("Stripe holds ONE refund of exactly $40.01", refunds.data.length === 1 && refunds.data[0].amount === 4001, refunds.data.map((x) => x.amount));
  const st = (await pool.query(`SELECT status FROM service_bookings WHERE id = $1`, [one.id])).rows[0].status;
  check("booking is refunded", st === "refunded", st);
  const audit = (await pool.query(`SELECT actor_id, action, metadata FROM access_audit_logs WHERE resource_id = $1 AND action = 'exception_refund_issued'`, [one.id])).rows;
  check("audit log names the admin, the reason and the refund", audit.length === 1 && audit[0].actor_id === ids.admin && audit[0].metadata?.reason === reason && audit[0].metadata?.refundId === refunds.data[0]?.id, audit);

  console.log("── 3 a second attempt");
  const r2 = await post(admin, one.id, { mode: "full", reason });
  check("refused 409", r2.status === 409, await r2.text());
  check("Stripe still holds ONE refund", (await stripe.refunds.list({ payment_intent: one.pi })).data.length === 1);

  console.log("── 4 disputed");
  const two = await paidBooking("disputed");
  const r4 = await post(admin, two.id, { mode: "full", reason });
  check("refused 409", r4.status === 409, await r4.text());
  check("Stripe was never asked", (await stripe.refunds.list({ payment_intent: two.pi })).data.length === 0);

  console.log("── 5 over the charge");
  const three = await paidBooking("confirmed");
  const r5 = await post(admin, three.id, { mode: "partial", amountCents: 11501, reason });
  check("refused 400", r5.status === 400, await r5.text());

  console.log("── 6 non-admin");
  const r6 = await post(trav, three.id, { mode: "full", reason });
  check("refused 403", r6.status === 403, r6.status);
  check("Stripe was never asked", (await stripe.refunds.list({ payment_intent: three.pi })).data.length === 0);
}

main()
  .catch((err) => { failures++; console.error(err); })
  .finally(async () => {
    for (const id of bookings) {
      await pool.query(`DELETE FROM access_audit_logs WHERE resource_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM refunds WHERE booking_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM fee_ledger WHERE booking_id = $1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM service_bookings WHERE id = $1`, [id]).catch(() => {});
    }
    await pool.query(`DELETE FROM provider_services WHERE id = $1`, [ids.svc]).catch(() => {});
    await pool.query(`DELETE FROM sessions WHERE sess::text LIKE $1`, [`%rp-aer-${RUN}%`]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [ids.admin, ids.trav]).catch(() => {});
    await pool.end();
    console.log(failures === 0 ? "[replay] ALL PASS" : `[replay] ${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
  });
