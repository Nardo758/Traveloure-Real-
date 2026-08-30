/**
 * FP-5 — ONE BOOKING-VISIBILITY PREDICATE, PROVEN ON THE WIRE (M1 · M2 · X1 · I1 · S2).
 *
 * Evidence: docs/testing/CONSOLE_TABS_EXERCISE.md (branch `lane/provider-batch-exercise`, as-of
 * `f747d0a`). A traveler put a real listing through the real cart and the real checkout; Stripe
 * was unreachable on that bench (`sk_test_dummy`), so `POST /api/checkout` did exactly what §15b
 * prescribes: it wrote its provisional claim BEFORE calling Stripe, the call failed, and the row
 * was left at `status='payment_pending'` with `stripe_payment_intent_id IS NULL` — an unauthorized
 * claim by construction. Six console surfaces read that row and FIVE disagreed about what it
 * meant, including one that called $83.60 of it "Your lifetime earnings" beside a ledger showing
 * $0.00.
 *
 * WHAT THIS SUITE PROVES — the seam is the SERVER's answer, because the console's disagreement was
 * only half client-side. Two of the five wrong answers were server aggregations with no status
 * filter at all (`GET /api/me/earnings-by-source`, `GET /api/me/link-analytics`), and the "pending"
 * tile on Today comes from `GET /api/provider/analytics/dashboard`. So the assertions below are
 * against the real payloads:
 *
 *   N-M1   an unauthorized claim contributes ZERO to earnings-by-source (it read "$95.00" before)
 *   N-M2   an unauthorized claim contributes ZERO to a tracked link's attributed revenue — the
 *          latent half, which read $0 on the bench only because that claim happened to be untagged
 *   N-X1   the same row is not "pending" on Today, and IS disclosed as awaiting-payment there
 *   P-X1   Today, Customers and the shared predicate return the SAME two numbers for the SAME rows
 *   P-M    a genuinely authorized booking DOES appear in every one of those numbers
 *   S2     the payout threshold the Money page prints is read from the provider's own settings row,
 *          server-side; a stricter value binds, a value below the platform floor cannot lower it
 *
 * FIXTURE HONESTY. The claim row is INSERTED directly. Driving a real checkout to the §15b state
 * requires an unreachable Stripe, which is exactly the bench limit the exercise recorded and
 * declined to work around; a test cannot both refuse DB surgery and pin a state only a payment
 * failure produces. Every row inserted here mirrors, column for column, the real row the exercise
 * captured in its §4 DB block — including the `stripeAttemptAt` pre-flight marker.
 *
 * Runs against the ALREADY-RUNNING dev server (the fp1/fp3 posture).
 * DISPOSABLE DB ONLY — every row created here is cleaned up in after().
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/fp5-console-agreement.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { MIN_PAYOUT_CENTS } from "../config/payout.config";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];
const createdShortLinkCodes: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[fp5] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

function api(pathname: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

let provider = { id: "", email: "", cookie: "" };
let traveler = { id: "", email: "" };
let serviceId = "";
let trackedCode = "";

async function register(prefix: string, role: string | null): Promise<{ id: string; email: string; cookie: string }> {
  const email = `fp5-${prefix}-${RUN}@t.test`;
  const res = await readOnce(await api("/api/auth/register", undefined, "POST", {
    email, password: PASSWORD, firstName: "FP", lastName: "Five",
  }));
  assert.equal(res.status, 201, `register failed (${res.status}): ${res.text}`);
  createdEmails.push(email);
  const id = res.body.user.id as string;
  if (role) await db.execute(sql`UPDATE users SET role = ${role} WHERE id = ${id}`);
  const login = await api("/api/auth/login", undefined, "POST", { email, password: PASSWORD });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  return { id, email, cookie };
}

/**
 * Insert one `service_bookings` row. Mirrors the shape the real checkout writes, including the
 * §15b pre-flight marker on the provisional row — an unmarked claim is a DIFFERENT (provably
 * un-attempted) state and must not be confused with this one.
 */
async function seedBooking(opts: {
  status: string;
  totalAmount: string;
  platformFee: string;
  providerEarnings: string;
  paymentIntentId?: string | null;
  source?: string;
  acquisitionRef?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  const details = opts.status === "payment_pending"
    ? JSON.stringify({ stripeAttemptAt: new Date().toISOString() })
    : JSON.stringify({});
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee,
       provider_earnings, stripe_payment_intent_id, source, acquisition_ref, booking_details)
    VALUES
      (${id}, ${serviceId}, ${traveler.id}, ${provider.id}, ${opts.status}, ${opts.totalAmount},
       ${opts.platformFee}, ${opts.providerEarnings}, ${opts.paymentIntentId ?? null},
       ${opts.source ?? "direct"}, ${opts.acquisitionRef ?? null}, ${details}::jsonb)
  `);
  createdBookingIds.push(id);
  return id;
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  provider = await register("provider", "service_provider");
  traveler = await register("traveler", null);

  // A real approved+active listing to hang bookings off (the FK is real — §"Service Model").
  serviceId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status)
    VALUES (${serviceId}, ${provider.id}, ${`FP5 ${RUN} listing`},
            ${"FP-5 fixture listing — server/__tests__/fp5-console-agreement.db.test.ts"},
            ${"95.00"}, ${"active"}, ${"approved"})
  `);
  createdServiceIds.push(serviceId);

  // A tracked share link through the REAL owner-gated create route (never a hand-written row).
  const link = await readOnce(await api("/api/short-links", provider.cookie, "POST", {
    targetType: "service", targetId: serviceId,
  }));
  assert.equal(link.status < 300, true, `short-link create failed (${link.status}): ${link.text}`);
  trackedCode = link.body.code as string;
  assert.ok(trackedCode, "the bench must produce a real short_links.code");
  createdShortLinkCodes.push(trackedCode);

  // ── The bench, three rows, exactly the shapes the console must tell apart ────────────────────
  // 1. THE CLAIM — the exercise's own row: nothing charged, no PaymentIntent, tagged to the
  //    tracked link (the case M2 says the bench never actually reached).
  await seedBooking({
    status: "payment_pending",
    totalAmount: "95.00", platformFee: "11.40", providerEarnings: "83.60",
    paymentIntentId: null, source: "link", acquisitionRef: trackedCode,
  });
  // 2. A GENUINELY PAID booking off the SAME link — the positive half of M2.
  await seedBooking({
    status: "confirmed",
    totalAmount: "200.00", platformFee: "24.00", providerEarnings: "176.00",
    paymentIntentId: `pi_fp5_${RUN}`, source: "link", acquisitionRef: trackedCode,
  });
  // 3. A legacy-rail request the provider genuinely OWES a response — the only actionable row.
  await seedBooking({
    status: "pending",
    totalAmount: "60.00", platformFee: "7.20", providerEarnings: "52.80",
  });
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of createdBookingIds) {
      await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
    }
    for (const code of createdShortLinkCodes) {
      await db.execute(sql`DELETE FROM short_links WHERE code = ${code}`).catch(() => {});
    }
    for (const id of createdServiceIds) {
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const email of createdEmails) {
      const uid = sql`(SELECT id FROM users WHERE email = ${email})`;
      await db.execute(sql`DELETE FROM provider_settings WHERE user_id = ${uid}`).catch(() => {});
      await db.execute(sql`DELETE FROM short_links WHERE owner_user_id = ${uid}`).catch(() => {});
      await db.execute(sql`DELETE FROM service_bookings WHERE provider_id = ${uid} OR traveler_id = ${uid}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE user_id = ${uid}`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

// ═══ NEGATIVES FIRST — the unauthorized claim is money nowhere ══════════════════════════════════

test("N-M1: GET /api/me/earnings-by-source excludes the never-charged claim", async () => {
  const res = await readOnce(await api("/api/me/earnings-by-source", provider.cookie));
  assert.equal(res.status, 200, `earnings-by-source failed (${res.status}): ${res.text}`);
  const link = res.body.buckets.find((b: any) => b.source === "link");
  // Before the fix this bucket grouped EVERY row: 2 bookings / $295. The claim's $95 is the
  // "Direct, 1 booking, $95.00" the exercise photographed, here in its real `link` bucket.
  assert.equal(link.count, 1, "only the authorized booking counts — the claim is not a sale");
  assert.equal(Number(link.revenue), 200, "the never-charged $95 is absent from attributed revenue");
  assert.equal(Number(res.body.totals.revenue), 200, "and absent from the totals line");
  assert.equal(res.body.totals.count, 1);
});

test("N-M2: GET /api/me/link-analytics excludes it from the tracked link's revenue", async () => {
  const res = await readOnce(await api("/api/me/link-analytics?days=365", provider.cookie));
  assert.equal(res.status, 200, `link-analytics failed (${res.status}): ${res.text}`);
  const row = res.body.links.find((l: any) => l.code === trackedCode);
  assert.ok(row, "the caller's own tracked link must appear");
  // THE LATENT HALF, now reachable: the exercise's claim was untagged, so this read $0 by luck.
  // This bench tags a failed checkout to the link — the number a provider uses to decide where to
  // spend must never include money that does not exist.
  assert.equal(row.bookings, 1, "one conversion, not two — the claim converted nothing");
  assert.equal(Number(row.revenue), 200, "unpaid revenue is not attributed to the link");
  assert.equal(Number(res.body.totals.totalRevenue), 200);
});

test("N-X1: the claim is not 'pending' on Today, and IS disclosed there", async () => {
  const res = await readOnce(await api("/api/provider/analytics/dashboard", provider.cookie));
  assert.equal(res.status, 200, `dashboard failed (${res.status}): ${res.text}`);
  // §18b: an unauthorized claim is not provider-actionable — a provider Accept on one destroyed
  // reclaimable inventory. Today's "0" was the CORRECT answer of the three; it now reaches it
  // through the shared predicate rather than its own private filter.
  assert.equal(res.body.summary.pendingBookings, 1, "exactly the one row the provider owes a response");
  assert.equal(
    res.body.summary.awaitingPaymentBookings, 1,
    "the claim is REPORTED, separately — disclosed without being banked or queued",
  );
});

test("N-S2: a payout minimum below the platform floor cannot lower it", async () => {
  const patch = await readOnce(await api("/api/provider/settings", provider.cookie, "PATCH", {
    minimumPayoutAmount: "1.00",
  }));
  assert.equal(patch.status, 200, `settings PATCH failed (${patch.status}): ${patch.text}`);
  const summary = await readOnce(await api("/api/provider/earnings/summary", provider.cookie));
  assert.equal(summary.status, 200);
  assert.equal(summary.body.payoutMinimum.effectiveCents, MIN_PAYOUT_CENTS, "the floor holds");
  assert.equal(summary.body.payoutMinimum.source, "platform_floor");
});

test("N-S2b: the payout threshold is never taken from the request body (§14)", async () => {
  // A crafted request naming its own minimum must change nothing. The call is refused for the
  // REAL reason (no connected Stripe account on this bench) — never because a body value was
  // honoured, and the stored preference is untouched afterwards.
  const before = await readOnce(await api("/api/provider/earnings/summary", provider.cookie));
  const res = await readOnce(await api("/api/payouts/request", provider.cookie, "POST", {
    minimumPayoutAmount: "0.01", minimumCents: 1, amount: "9999.00",
  }));
  assert.equal(res.status, 400, `expected a refusal, got ${res.status}: ${res.text}`);
  assert.equal(res.body.error, "stripe_not_connected", "refused on its own pre-check, not on the body");
  const after = await readOnce(await api("/api/provider/earnings/summary", provider.cookie));
  assert.equal(
    after.body.payoutMinimum.effectiveCents,
    before.body.payoutMinimum.effectiveCents,
    "the body did not move the threshold",
  );
});

// ═══ POSITIVES — the surfaces now agree, and a real sale shows up everywhere ════════════════════

test("P-X1: Today and Customers return the SAME two numbers for the same rows", async () => {
  const dash = await readOnce(await api("/api/provider/analytics/dashboard", provider.cookie));
  const customers = await readOnce(await api("/api/me/customers", provider.cookie));
  assert.equal(customers.status, 200, `customers failed (${customers.status}): ${customers.text}`);

  const rows: any[] = customers.body.customers ?? customers.body.rows ?? customers.body;
  const mine = (Array.isArray(rows) ? rows : []).filter((r: any) => r.userId === traveler.id);
  const pendingPayment = mine.reduce((s: number, r: any) => s + (r.pendingPaymentBookings ?? 0), 0);

  // THE X1 DEFECT, inverted into an assertion: the exercise got 0 / "1 Pending" / "1 pending
  // payment" for one row from three tabs. Customers was the only honest one; the others now agree
  // with it because all three read the same predicate.
  assert.equal(pendingPayment, 1, "Customers still counts the claim as a pending payment");
  assert.equal(
    dash.body.summary.awaitingPaymentBookings, pendingPayment,
    "Today's awaiting-payment count EQUALS Customers' — one row, one answer",
  );
});

test("P-M: a genuinely authorized booking appears in every money surface, consistently", async () => {
  const [bySource, links, dash] = await Promise.all([
    readOnce(await api("/api/me/earnings-by-source", provider.cookie)),
    readOnce(await api("/api/me/link-analytics?days=365", provider.cookie)),
    readOnce(await api("/api/provider/analytics/dashboard", provider.cookie)),
  ]);
  const linkBucket = bySource.body.buckets.find((b: any) => b.source === "link");
  const linkRow = links.body.links.find((l: any) => l.code === trackedCode);

  // Same booking, same amount, from two independently-written aggregations.
  assert.equal(Number(linkBucket.revenue), 200);
  assert.equal(Number(linkRow.revenue), 200);
  assert.equal(linkBucket.count, linkRow.bookings, "the two panels count the same conversions");
  // And the paid row is NOT mistaken for something the provider must act on.
  assert.equal(dash.body.summary.pendingBookings, 1);
});

test("P-S2: a stricter provider minimum binds, and the Money page is told the effective figure", async () => {
  const patch = await readOnce(await api("/api/provider/settings", provider.cookie, "PATCH", {
    minimumPayoutAmount: "250.00",
  }));
  assert.equal(patch.status, 200, `settings PATCH failed (${patch.status}): ${patch.text}`);

  // Read back through the endpoint the Money page actually consumes — the setting is resolved
  // SERVER-side from the caller's own row, by the same helper POST /api/payouts/request gates on.
  const summary = await readOnce(await api("/api/provider/earnings/summary", provider.cookie));
  assert.equal(summary.status, 200, `summary failed (${summary.status}): ${summary.text}`);
  assert.equal(summary.body.payoutMinimum.effectiveCents, 25000, "the provider's own 250 governs");
  assert.equal(summary.body.payoutMinimum.platformFloorCents, MIN_PAYOUT_CENTS, "the floor is still stated");
  assert.equal(summary.body.payoutMinimum.source, "provider_setting", "and the page can say WHOSE number it is");

  // The stored row is the source — not a client echo.
  const stored = await db.execute(sql`
    SELECT minimum_payout_amount FROM provider_settings WHERE user_id = ${provider.id}
  `);
  assert.equal(Number((stored.rows as any[])[0]?.minimum_payout_amount), 250);
});

test("P-N1: a provider with no notifications is told ZERO — the bell's real source", async () => {
  // N1's dot is `count > 0` and nothing else (shouldShowUnreadDot, unit-pinned separately). This
  // asserts the SOURCE it reads is real, user-scoped and honestly empty for a fresh account —
  // which is precisely the account the hardcoded dot was lit for.
  const res = await readOnce(await api("/api/notifications/unread-count", provider.cookie));
  assert.equal(res.status, 200, `unread-count failed (${res.status}): ${res.text}`);
  assert.equal(res.body.count, 0, "a brand-new provider has nothing unread — so no dot");
});
