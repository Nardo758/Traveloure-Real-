/**
 * Payout email verification against a disposable database.
 *
 * Unless EMAIL_SENDS_ENABLED is exactly "true", an unverified earner can still
 * request a payout. With the flag on, an unverified earner cannot open a
 * self-service request, and an admin cannot create a payout row or start a
 * Stripe transfer for them. A verified earner keeps the setup, minimum, and
 * duplicate responses. Setup saves, earnings rows, and mark-paid stay open.
 * The PayPal handle maps digits to letters so it cannot be an 8-digit run.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/verified-email-payout-gate.db.test.ts
 */
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { stripeConnectService } from "../services/stripe-connect.service";
import { PAYOUT_EMAIL_VERIFICATION_BODY } from "../services/verified-email-action-gate";
import paymentsRouter from "../routes/payments.routes";
import adminRouter from "../routes/admin.routes";

const RUN = crypto.randomUUID().slice(0, 8);
const P = `vp${RUN}`;
const id = (suffix: string) => `${P}-${suffix}`;
const HANDLE = `vp${RUN.replace(/\d/g, (d) => "abcdefghij"[Number(d)])}@example.test`;
const priorSends = process.env.EMAIL_SENDS_ENABLED;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(`[verified-email-payout-gate] REFUSING to write fixtures: host '${host ?? "<none>"}' is not disposable.`);
  }
}

function setSends(value: string | undefined): void {
  if (value === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = value;
}

async function withSends<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prior = process.env.EMAIL_SENDS_ENABLED;
  setSends(value);
  try {
    return await fn();
  } finally {
    setSends(prior);
  }
}

function handlerFor(router: { stack: any[] }, method: string, routePath: string) {
  const layer = router.stack.find((l) => l.route?.path === routePath && l.route.methods?.[method]);
  if (!layer) throw new Error(`missing ${method} ${routePath}`);
  return layer.route.stack.at(-1).handle as (req: any, res: any) => Promise<void>;
}

function capture() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

function reqFor(userId: string, body?: unknown, params?: Record<string, string>) {
  return {
    user: { claims: { sub: userId } },
    body: body ?? {},
    params: params ?? {},
    get: () => null,
    ip: "127.0.0.1",
  };
}

async function call(router: { stack: any[] }, method: string, routePath: string, userId: string, body?: unknown, params?: Record<string, string>) {
  const res = capture();
  await handlerFor(router, method, routePath)(reqFor(userId, body, params), res);
  return res;
}

async function insertUser(
  userId: string,
  role: string,
  extra?: { verified?: boolean; stripe?: boolean; method?: string | null; handle?: string | null },
) {
  await db.execute(sql`
    INSERT INTO users (
      id, email, first_name, last_name, role, email_verified,
      stripe_account_id, stripe_account_status, can_receive_payments,
      payout_method_type, payout_handle
    ) VALUES (
      ${userId},
      ${`${userId}@payout-email.invalid`},
      'Payout',
      'Email',
      ${role},
      ${extra?.verified ? new Date() : null},
      ${extra?.stripe ? "acct_test_payout_email" : null},
      ${extra?.stripe ? "active" : null},
      ${extra?.stripe ?? false},
      ${extra?.method ?? null},
      ${extra?.handle ?? null}
    )
  `);
}

async function insertForm(userId: string, connect: string) {
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, status, identity_verification_status, stripe_connect_status)
    VALUES (${crypto.randomUUID()}, ${userId}, 'approved', 'verified', ${connect})
  `);
}

async function earning(table: "expert_earnings" | "provider_earnings", ownerCol: "expert_id" | "provider_id", ownerId: string, amount: string) {
  const type = table === "expert_earnings" ? "tip" : "service_booking";
  const when = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await db.execute(sql`
    INSERT INTO ${sql.raw(table)} (id, ${sql.raw(ownerCol)}, type, amount, status, dispute_state, available_at)
    VALUES (${crypto.randomUUID()}, ${ownerId}, ${type}, ${amount}, 'releasable', 'none', ${when}::timestamptz)
  `);
}

async function payoutCount(table: "expert_payouts" | "provider_payouts", ownerCol: "expert_id" | "provider_id", ownerId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE ${sql.raw(ownerCol)} = ${ownerId}
  `);
  return Number((r.rows[0] as any)?.n ?? 0);
}

async function earningCount(table: "expert_earnings" | "provider_earnings", ownerCol: "expert_id" | "provider_id", ownerId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE ${sql.raw(ownerCol)} = ${ownerId}
  `);
  return Number((r.rows[0] as any)?.n ?? 0);
}

async function payoutStatus(table: "expert_payouts" | "provider_payouts", payoutId: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT status FROM ${sql.raw(table)} WHERE id = ${payoutId}`);
  return ((r.rows[0] as any)?.status as string | null) ?? null;
}

async function insertPayout(table: "expert_payouts" | "provider_payouts", ownerCol: "expert_id" | "provider_id", payoutId: string, ownerId: string, amount: string, status: string) {
  await db.execute(sql`
    INSERT INTO ${sql.raw(table)} (id, ${sql.raw(ownerCol)}, amount, status)
    VALUES (${payoutId}, ${ownerId}, ${amount}, ${status})
  `);
}

const adminId = id("admin");
const travelerId = id("traveler");
const flagOffId = id("flagoff");
const unverifiedPaypalId = id("uvpay");
const unverifiedBareId = id("uvbare");
const verifiedOrderId = id("vorder");
const unverifiedSetupId = id("uvset");
const verifiedExpertId = id("vex");
const unverifiedExpertId = id("uvex");
const adminUnverifiedId = id("admuv");
const adminVerifiedBareId = id("admvb");
const adminVerifiedId = id("admv");
const stripeUnverifiedId = id("stuv");
const expertVerifiedConnectId = id("exvc");
const expertUnverifiedConnectId = id("exuv");
const claimId = id("claim");
const recheckId = id("rechk");
const flagOffClaimId = id("flclm");
const markId = id("mark");
const processingId = id("proc");

describe("verified email payout gate", { concurrency: 1 }, () => {
  before(async () => {
    await assertDisposableDb();
    await insertUser(adminId, "admin", { verified: true });
    await insertUser(travelerId, "traveler");
    await insertUser(flagOffId, "service_provider", { method: "paypal", handle: HANDLE });
    await earning("provider_earnings", "provider_id", flagOffId, "25.00");
    await insertUser(unverifiedPaypalId, "service_provider", { method: "paypal", handle: `uv${HANDLE}` });
    await earning("provider_earnings", "provider_id", unverifiedPaypalId, "25.00");
    await insertUser(unverifiedBareId, "service_provider");
    await earning("provider_earnings", "provider_id", unverifiedBareId, "25.00");
    await insertUser(verifiedOrderId, "service_provider", { verified: true });
    await earning("provider_earnings", "provider_id", verifiedOrderId, "5.00");
    await insertUser(unverifiedSetupId, "service_provider");
    await insertUser(verifiedExpertId, "travel_expert", { verified: true, method: "paypal", handle: `ex${HANDLE}` });
    await earning("expert_earnings", "expert_id", verifiedExpertId, "25.00");
    await insertUser(unverifiedExpertId, "travel_expert", { method: "paypal", handle: `eux${HANDLE}` });
    await earning("expert_earnings", "expert_id", unverifiedExpertId, "25.00");
    await insertUser(adminUnverifiedId, "service_provider", { method: "paypal", handle: `au${HANDLE}` });
    await earning("provider_earnings", "provider_id", adminUnverifiedId, "25.00");
    await insertUser(adminVerifiedBareId, "service_provider", { verified: true });
    await earning("provider_earnings", "provider_id", adminVerifiedBareId, "25.00");
    await insertUser(adminVerifiedId, "service_provider", { verified: true, method: "paypal", handle: `av${HANDLE}` });
    await earning("provider_earnings", "provider_id", adminVerifiedId, "25.00");
    await insertUser(stripeUnverifiedId, "service_provider", { stripe: true });
    await earning("provider_earnings", "provider_id", stripeUnverifiedId, "10.00");
    await insertPayout("provider_payouts", "provider_id", id("stuv-pay"), stripeUnverifiedId, "10.00", "pending");
    await insertUser(expertVerifiedConnectId, "travel_expert", { verified: true });
    await insertForm(expertVerifiedConnectId, "complete");
    await insertPayout("expert_payouts", "expert_id", id("exvc-pay"), expertVerifiedConnectId, "10.00", "pending");
    await insertUser(expertUnverifiedConnectId, "travel_expert");
    await insertForm(expertUnverifiedConnectId, "complete");
    await insertPayout("expert_payouts", "expert_id", id("exuv-pay"), expertUnverifiedConnectId, "10.00", "pending");
    await insertUser(claimId, "service_provider", { stripe: true });
    await insertPayout("provider_payouts", "provider_id", id("claim-pay"), claimId, "10.00", "pending");
    await insertUser(recheckId, "service_provider", { stripe: true });
    await insertPayout("provider_payouts", "provider_id", id("rechk-pay"), recheckId, "10.00", "processing");
    await insertUser(flagOffClaimId, "service_provider", { stripe: true });
    await earning("provider_earnings", "provider_id", flagOffClaimId, "10.00");
    await insertPayout("provider_payouts", "provider_id", id("flclm-pay"), flagOffClaimId, "10.00", "pending");
    await insertUser(markId, "service_provider", { method: "paypal", handle: `mk${HANDLE}` });
    await earning("provider_earnings", "provider_id", markId, "10.00");
    await insertPayout("provider_payouts", "provider_id", id("mark-pay"), markId, "10.00", "pending");
    await insertUser(processingId, "service_provider");
    await insertPayout("provider_payouts", "provider_id", id("proc-pay"), processingId, "10.00", "pending");
  });

  after(async () => {
    setSends(priorSends);
    await db.execute(sql`DELETE FROM access_audit_logs WHERE resource_id LIKE ${`${P}-%`}`);
    await db.execute(sql`DELETE FROM provider_earnings WHERE provider_id LIKE ${`${P}-%`}`);
    await db.execute(sql`DELETE FROM expert_earnings WHERE expert_id LIKE ${`${P}-%`}`);
    await db.execute(sql`DELETE FROM provider_payouts WHERE provider_id LIKE ${`${P}-%`}`);
    await db.execute(sql`DELETE FROM expert_payouts WHERE expert_id LIKE ${`${P}-%`}`);
    await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id LIKE ${`${P}-%`}`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE ${`${P}-%`}`);
  });

  test("flag off, false, and TRUE leave an unverified PayPal request unchanged", async () => {
    for (const value of [undefined, "false", "TRUE"] as const) {
      await db.execute(sql`DELETE FROM provider_payouts WHERE provider_id = ${flagOffId}`);
      const res = await withSends(value, () => call(paymentsRouter, "post", "/api/payouts/request", flagOffId, {}));
      assert.equal(res.statusCode, 201, `${value ?? "unset"} ${JSON.stringify(res.body)}`);
      assert.equal(res.body.status, "pending");
      assert.notEqual(res.body.code, PAYOUT_EMAIL_VERIFICATION_BODY.code);
    }
  });

  test("flag on refuses an unverified provider or expert request and leaves earnings", async () => {
    await withSends("true", async () => {
      const before = await earningCount("provider_earnings", "provider_id", unverifiedPaypalId);
      const provider = await call(paymentsRouter, "post", "/api/payouts/request", unverifiedPaypalId, {});
      assert.equal(provider.statusCode, 403);
      assert.deepEqual(provider.body, PAYOUT_EMAIL_VERIFICATION_BODY);
      assert.equal(await payoutCount("provider_payouts", "provider_id", unverifiedPaypalId), 0);
      assert.equal(await earningCount("provider_earnings", "provider_id", unverifiedPaypalId), before);

      const bare = await call(paymentsRouter, "post", "/api/payouts/request", unverifiedBareId, {});
      assert.equal(bare.statusCode, 403);
      assert.deepEqual(bare.body, PAYOUT_EMAIL_VERIFICATION_BODY);
      assert.notEqual(bare.body.error, "stripe_not_connected");

      const expert = await call(paymentsRouter, "post", "/api/payouts/request", unverifiedExpertId, {});
      assert.equal(expert.statusCode, 403);
      assert.deepEqual(expert.body, PAYOUT_EMAIL_VERIFICATION_BODY);
      assert.equal(await payoutCount("expert_payouts", "expert_id", unverifiedExpertId), 0);

      const traveler = await call(paymentsRouter, "post", "/api/payouts/request", travelerId, {});
      assert.equal(traveler.statusCode, 403);
      assert.equal(traveler.body.error, "Only providers and experts can request payouts");
    });
  });

  test("flag on keeps setup saves open and a verified request's existing order", async () => {
    await withSends("true", async () => {
      const saved = await call(paymentsRouter, "put", "/api/me/payout-setup", unverifiedSetupId, {
        payoutMethodType: "paypal",
        payoutHandle: `set${HANDLE}`,
      });
      assert.equal(saved.statusCode, 200, JSON.stringify(saved.body));
      assert.equal(saved.body.setupComplete, true);
      assert.equal(saved.body.payoutHandle, `set${HANDLE}`);

      const read = await call(paymentsRouter, "get", "/api/me/payout-setup", unverifiedSetupId);
      assert.equal(read.statusCode, 200);
      assert.equal(read.body.payoutHandle, `set${HANDLE}`);

      const held = await call(paymentsRouter, "post", "/api/payouts/request", verifiedOrderId, {});
      assert.equal(held.statusCode, 400);
      assert.equal(held.body.error, "stripe_not_connected");
      assert.equal(await payoutCount("provider_payouts", "provider_id", verifiedOrderId), 0);

      const setup = await call(paymentsRouter, "put", "/api/me/payout-setup", verifiedOrderId, {
        payoutMethodType: "paypal",
        payoutHandle: `ord${HANDLE}`,
      });
      assert.equal(setup.statusCode, 200);

      const below = await call(paymentsRouter, "post", "/api/payouts/request", verifiedOrderId, {});
      assert.equal(below.statusCode, 400);
      assert.equal(below.body.error, "below_minimum");
      assert.equal(await payoutCount("provider_payouts", "provider_id", verifiedOrderId), 0);

      await earning("provider_earnings", "provider_id", verifiedOrderId, "20.00");
      const created = await call(paymentsRouter, "post", "/api/payouts/request", verifiedOrderId, { amountCents: 999999 });
      assert.equal(created.statusCode, 201, JSON.stringify(created.body));
      assert.equal(created.body.status, "pending");
      assert.equal(created.body.requesterType, "provider");

      const duplicate = await call(paymentsRouter, "post", "/api/payouts/request", verifiedOrderId, {});
      assert.equal(duplicate.statusCode, 409);
      assert.equal(duplicate.body.error, "payout_request_pending");
      assert.equal(await payoutCount("provider_payouts", "provider_id", verifiedOrderId), 1);

      const expert = await call(paymentsRouter, "post", "/api/payouts/request", verifiedExpertId, {});
      assert.equal(expert.statusCode, 201, JSON.stringify(expert.body));
      assert.equal(expert.body.requesterType, "expert");
    });
  });

  test("flag on blocks admin create for an unverified earner and keeps verified admin ordering", async () => {
    await withSends("true", async () => {
      const unverified = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
        requesterType: "provider",
        requesterId: adminUnverifiedId,
        amountCents: 2500,
      });
      assert.equal(unverified.statusCode, 403);
      assert.deepEqual(unverified.body, PAYOUT_EMAIL_VERIFICATION_BODY);
      assert.notEqual(unverified.body.error, "payout_setup_incomplete");
      assert.equal(await payoutCount("provider_payouts", "provider_id", adminUnverifiedId), 0);

      const unverifiedExpert = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
        requesterType: "expert",
        requesterId: unverifiedExpertId,
      });
      assert.equal(unverifiedExpert.statusCode, 403);
      assert.deepEqual(unverifiedExpert.body, PAYOUT_EMAIL_VERIFICATION_BODY);
      assert.equal(await payoutCount("expert_payouts", "expert_id", unverifiedExpertId), 0);

      const incomplete = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
        requesterType: "provider",
        requesterId: adminVerifiedBareId,
        amountCents: 2500,
      });
      assert.equal(incomplete.statusCode, 400);
      assert.equal(incomplete.body.error, "payout_setup_incomplete");

      const below = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
        requesterType: "provider",
        requesterId: adminVerifiedId,
        amountCents: 500,
      });
      assert.equal(below.statusCode, 400);
      assert.equal(below.body.minimumCents, 1000);
      assert.equal(await payoutCount("provider_payouts", "provider_id", adminVerifiedId), 0);

      const exceeds = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
        requesterType: "provider",
        requesterId: adminVerifiedId,
        amountCents: 999999,
      });
      assert.equal(exceeds.statusCode, 400);
      assert.equal(exceeds.body.error, "Payout amount exceeds available earnings");

      const created = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
        requesterType: "provider",
        requesterId: adminVerifiedId,
        amountCents: 2500,
      });
      assert.equal(created.statusCode, 201, JSON.stringify(created.body));
      assert.equal(created.body.status, "pending");
      assert.equal(created.body.requesterType, "provider");
    });
  });

  test("flag on refuses a Stripe transfer for an unverified earner and does not call Stripe", async () => {
    const calls = { transfer: 0, balance: 0 };
    const originalTransfer = stripeConnectService.createTransfer.bind(stripeConnectService);
    const originalBalance = stripeConnectService.getAccountBalance.bind(stripeConnectService);
    stripeConnectService.createTransfer = async () => {
      calls.transfer += 1;
      throw new Error("createTransfer must not run");
    };
    stripeConnectService.getAccountBalance = async () => {
      calls.balance += 1;
      throw new Error("getAccountBalance must not run");
    };
    try {
      await withSends("true", async () => {
        const refused = await call(adminRouter, "patch", "/api/admin/payouts/:id", adminId, {
          status: "completed",
          requesterType: "provider",
        }, { id: id("stuv-pay") });
        assert.equal(refused.statusCode, 403, JSON.stringify(refused.body));
        assert.deepEqual(refused.body, PAYOUT_EMAIL_VERIFICATION_BODY);
        assert.equal(await payoutStatus("provider_payouts", id("stuv-pay")), "pending");

        const expertRefused = await call(adminRouter, "patch", "/api/admin/payouts/:id", adminId, {
          status: "completed",
          requesterType: "expert",
        }, { id: id("exuv-pay") });
        assert.equal(expertRefused.statusCode, 403);
        assert.deepEqual(expertRefused.body, PAYOUT_EMAIL_VERIFICATION_BODY);
        assert.equal(await payoutStatus("expert_payouts", id("exuv-pay")), "pending");

        const verifiedExpert = await call(adminRouter, "patch", "/api/admin/payouts/:id", adminId, {
          status: "completed",
          requesterType: "expert",
        }, { id: id("exvc-pay") });
        assert.equal(verifiedExpert.statusCode, 400);
        assert.equal(verifiedExpert.body.error, "Recipient does not have an active Stripe Connect account. They must complete onboarding first.");
        assert.equal(await payoutStatus("expert_payouts", id("exvc-pay")), "pending");

        const claimed = await storage.claimProviderPayoutForStripeTransfer(id("claim-pay"), claimId);
        assert.equal(claimed.payout, undefined);
        assert.equal(claimed.reason, "email_verification_required");
        assert.equal(await payoutStatus("provider_payouts", id("claim-pay")), "pending");

        const rechecked = await storage.recheckStripeTransferBeforeSend(id("rechk-pay"), "provider", recheckId);
        assert.equal(rechecked.proceed, false);
        assert.equal("code" in rechecked && rechecked.code, "email_verification_required");
        assert.equal(await payoutStatus("provider_payouts", id("rechk-pay")), "pending");

        const processing = await call(adminRouter, "patch", "/api/admin/payouts/:id", adminId, {
          status: "processing",
          requesterType: "provider",
        }, { id: id("proc-pay") });
        assert.notEqual(processing.statusCode, 403);
        assert.notEqual(processing.body?.code, PAYOUT_EMAIL_VERIFICATION_BODY.code);
        assert.equal(processing.body.status, "processing");
      });
    } finally {
      stripeConnectService.createTransfer = originalTransfer;
      stripeConnectService.getAccountBalance = originalBalance;
    }
    assert.equal(calls.transfer, 0);
    assert.equal(calls.balance, 0);
  });

  test("flag off still claims a Stripe-ready unverified earner, and mark-paid stays open when the flag is on", async () => {
    const off = await withSends(undefined, () => storage.claimProviderPayoutForStripeTransfer(id("flclm-pay"), flagOffClaimId));
    assert.ok(off.payout, JSON.stringify(off));
    assert.equal(off.payout.status, "processing");

    const marked = await withSends("true", () => call(adminRouter, "post", "/api/admin/payouts/:id/mark-paid", adminId, {
      requesterType: "provider",
      method: "paypal",
      notes: "desk",
    }, { id: id("mark-pay") }));
    assert.equal(marked.statusCode, 200, JSON.stringify(marked.body));
    assert.equal(marked.body.status, "completed");
    assert.notEqual(marked.body.code, PAYOUT_EMAIL_VERIFICATION_BODY.code);
    assert.equal(await payoutStatus("provider_payouts", id("mark-pay")), "completed");
  });
});
