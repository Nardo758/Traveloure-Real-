/**
 * Payout setup against a disposable database (ledger 2026-10-23-payout-setup-server).
 *
 * Migration 408 applies and rolls back. The save route writes only the caller's row.
 * Bank-like handles are not stored. Payouts are held until setup is complete, and
 * earnings still accrue. Owed rows carry setup status and not the handle.
 * mark-paid still rejects amountCents and reference.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/payout-setup.db.test.ts
 */
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { authStorage } from "../replit_integrations/auth/storage";
import { listOwedEarners, markPaidBodySchema, markPayoutPaidExternally } from "../services/payout-admin.service";
import { lockPayoutRequestDecision } from "../services/payout-setup.service";
import {
  STRIPE_NOT_CONNECTED_MESSAGE,
} from "../services/payout-setup";
import paymentsRouter from "../routes/payments.routes";
import adminRouter from "../routes/admin.routes";

const RUN = crypto.randomUUID().slice(0, 8);
const P = `p8${RUN}`;
const id = (suffix: string) => `${P}-${suffix}`;
const MIGRATION = fs.readFileSync(path.resolve("server/migrations/408_payout_setup.sql"), "utf8");
const ROUTING = "021000021";
const HANDLE = `ps${RUN}@example.test`;

const adminId = id("admin");
const bareId = id("bare");
const paypalId = id("paypal");
const otherId = id("other");
const travelerId = id("traveler");
const expertOpenId = id("exopen");
const expertDoneId = id("exdone");
const bankId = id("bank");
const stripeId = id("stripe");
const adminCreateId = id("admc");

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
    throw new Error(`[payout-setup] REFUSING to write fixtures: host '${host ?? "<none>"}' is not disposable.`);
  }
}

type Col = { column_name: string; data_type: string; character_maximum_length: number | null; is_nullable: string; column_default: string | null };

async function columnShape(conn: { execute: typeof db.execute } = db): Promise<Col[]> {
  const r = await conn.execute(sql`
    SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name IN ('payout_method_type', 'payout_handle')
    ORDER BY column_name
  `);
  return (r.rows as any[]).map((row) => ({
    column_name: row.column_name,
    data_type: row.data_type,
    character_maximum_length: row.character_maximum_length == null ? null : Number(row.character_maximum_length),
    is_nullable: row.is_nullable,
    column_default: row.column_default,
  }));
}

function assertColumns(cols: Col[]) {
  assert.deepEqual(cols, [
    { column_name: "payout_handle", data_type: "character varying", character_maximum_length: 254, is_nullable: "YES", column_default: null },
    { column_name: "payout_method_type", data_type: "character varying", character_maximum_length: 32, is_nullable: "YES", column_default: null },
  ]);
}

async function applyMigration(conn: { execute: typeof db.execute } = db) {
  await conn.execute(sql.raw(MIGRATION));
}

class RollbackProbe extends Error {
  constructor() {
    super("rollback-payout-setup");
    this.name = "RollbackProbe";
  }
}

async function proveMigrationRollsBack() {
  const before = await columnShape();
  let rolled = false;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS payout_handle`);
      await tx.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS payout_method_type`);
      const gone = await columnShape(tx);
      assert.equal(gone.length, 0);
      await applyMigration(tx);
      assertColumns(await columnShape(tx));
      await applyMigration(tx);
      assertColumns(await columnShape(tx));
      const constraints = await tx.execute(sql`
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'public.users'::regclass
          AND a.attname IN ('payout_method_type', 'payout_handle')
      `);
      assert.equal(constraints.rows.length, 0);
      throw new RollbackProbe();
    });
  } catch (err) {
    if (!(err instanceof RollbackProbe)) throw err;
    rolled = true;
  }
  assert.equal(rolled, true);
  assert.deepEqual(await columnShape(), before);
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

async function insertUser(userId: string, role: string, extra?: { stripe?: boolean; method?: string | null; handle?: string | null }) {
  await db.execute(sql`
    INSERT INTO users (
      id, email, first_name, last_name, role,
      stripe_account_id, stripe_account_status, can_receive_payments,
      payout_method_type, payout_handle
    ) VALUES (
      ${userId},
      ${`${userId}@payout-setup.invalid`},
      'Payout',
      'Setup',
      ${role},
      ${extra?.stripe ? "acct_test_payout_setup" : null},
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

async function earning(table: "expert_earnings" | "provider_earnings", ownerCol: "expert_id" | "provider_id", ownerId: string, amount: string, status: string, when: string) {
  const type = table === "expert_earnings" ? "tip" : "service_booking";
  await db.execute(sql`
    INSERT INTO ${sql.raw(table)} (id, ${sql.raw(ownerCol)}, type, amount, status, dispute_state, available_at)
    VALUES (${crypto.randomUUID()}, ${ownerId}, ${type}, ${amount}, ${status}, 'none', ${when}::timestamptz)
  `);
}

async function payoutCount(table: "expert_payouts" | "provider_payouts", ownerCol: "expert_id" | "provider_id", ownerId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE ${sql.raw(ownerCol)} = ${ownerId}
  `);
  return Number((r.rows[0] as any)?.n ?? 0);
}

async function payoutStatus(table: "expert_payouts" | "provider_payouts", payoutId: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT status FROM ${sql.raw(table)} WHERE id = ${payoutId}`);
  return ((r.rows[0] as any)?.status as string | null) ?? null;
}

async function storedHandle(userId: string): Promise<{ method: string | null; handle: string | null }> {
  const r = await db.execute(sql`
    SELECT payout_method_type AS method, payout_handle AS handle FROM users WHERE id = ${userId}
  `);
  return { method: (r.rows[0] as any)?.method ?? null, handle: (r.rows[0] as any)?.handle ?? null };
}

async function earningCount(table: "expert_earnings" | "provider_earnings", ownerCol: "expert_id" | "provider_id", ownerId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM ${sql.raw(table)} WHERE ${sql.raw(ownerCol)} = ${ownerId}
  `);
  return Number((r.rows[0] as any)?.n ?? 0);
}

describe("payout setup database", { concurrency: 1 }, () => {
  before(async () => {
    await assertDisposableDb();
    assert.match(MIGRATION, /Migration 408 SQL approved — Leon/);
    await proveMigrationRollsBack();
    await applyMigration();
    assertColumns(await columnShape());
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await insertUser(adminId, "admin");
    await insertUser(bareId, "service_provider");
    await insertUser(paypalId, "service_provider", { method: "paypal", handle: HANDLE });
    await insertUser(otherId, "service_provider");
    await insertUser(travelerId, "traveler");
    await insertUser(expertOpenId, "travel_expert", { stripe: true });
    await insertForm(expertOpenId, "not_started");
    await insertUser(expertDoneId, "travel_expert");
    await insertForm(expertDoneId, "complete");
    await insertUser(bankId, "service_provider", { method: "other", handle: ROUTING });
    await insertUser(stripeId, "service_provider", { stripe: true });
    await insertUser(adminCreateId, "service_provider", { method: "paypal", handle: `admin${RUN}@example.test` });
    await earning("provider_earnings", "provider_id", bareId, "25.00", "releasable", past);
    await earning("provider_earnings", "provider_id", bareId, "40.00", "held", future);
    await earning("provider_earnings", "provider_id", paypalId, "25.00", "releasable", past);
    await earning("provider_earnings", "provider_id", adminCreateId, "25.00", "releasable", past);
    await earning("expert_earnings", "expert_id", expertOpenId, "25.00", "releasable", past);
    await storage.createExpertEarning({
      expertId: expertOpenId,
      type: "tip",
      amount: "12.00",
      status: "releasable",
      disputeState: "none",
      availableAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await earning("expert_earnings", "expert_id", expertDoneId, "25.00", "releasable", past);
  });

  after(async () => {
    await db.execute(sql`DELETE FROM users WHERE id LIKE ${`${P}-%`}`);
  });

  test("migration 408 applies, is idempotent, and rolls back", async () => {
    assertColumns(await columnShape());
    await applyMigration();
    assertColumns(await columnShape());
    await proveMigrationRollsBack();
    await applyMigration();
    assertColumns(await columnShape());
  });

  test("PUT /api/me/payout-setup writes only the caller and rejects a bank-like handle", async () => {
    const traveler = await call(paymentsRouter, "put", "/api/me/payout-setup", travelerId, {
      payoutMethodType: "paypal",
      payoutHandle: HANDLE,
    });
    assert.equal(traveler.statusCode, 403);
    assert.equal(traveler.body.error, "not_an_earner");

    const cross = await call(paymentsRouter, "put", "/api/me/payout-setup", paypalId, {
      payoutMethodType: "other",
      payoutHandle: "intruder",
      userId: otherId,
    });
    assert.equal(cross.statusCode, 400);
    assert.equal(cross.body.error, "invalid_payout_setup");
    assert.equal(JSON.stringify(cross.body).includes(otherId), false);
    assert.deepEqual(await storedHandle(otherId), { method: null, handle: null });
    assert.deepEqual(await storedHandle(paypalId), { method: "paypal", handle: HANDLE });

    const bank = await call(paymentsRouter, "put", "/api/me/payout-setup", bareId, {
      payoutMethodType: "paypal",
      payoutHandle: ROUTING,
    });
    assert.equal(bank.statusCode, 400);
    assert.equal(bank.body.error, "payout_handle_rejected");
    assert.equal(JSON.stringify(bank.body).includes(ROUTING), false);
    assert.deepEqual(await storedHandle(bareId), { method: null, handle: null });

    const saved = await call(paymentsRouter, "put", "/api/me/payout-setup", otherId, {
      payoutMethodType: "paypal",
      payoutHandle: `other${RUN}@example.test`,
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.body.payoutHandle, `other${RUN}@example.test`);
    assert.equal(saved.body.setupComplete, true);
    assert.deepEqual(await storedHandle(paypalId), { method: "paypal", handle: HANDLE });

    const viaAuth = await authStorage.updateUser(otherId, {
      payoutHandle: ROUTING,
      payoutMethodType: "other",
      firstName: "Still",
    } as any);
    assert.equal(viaAuth?.firstName, "Still");
    assert.deepEqual(await storedHandle(otherId), { method: "paypal", handle: `other${RUN}@example.test` });
    assert.equal(JSON.stringify(viaAuth).includes(ROUTING), false);
  });

  test("a stored bank-like handle is omitted, and a cleared handle blocks under the row lock", async () => {
    const read = await call(paymentsRouter, "get", "/api/me/payout-setup", bankId);
    assert.equal(read.statusCode, 200);
    assert.equal(read.body.payoutHandle, null);
    assert.equal(read.body.payoutHandlePresent, true);
    assert.equal(read.body.payoutHandleAccepted, false);
    assert.equal(read.body.setupComplete, false);
    assert.equal(JSON.stringify(read.body).includes(ROUTING), false);

    const own = await call(paymentsRouter, "get", "/api/me/payout-setup", paypalId);
    assert.equal(own.body.payoutHandle, HANDLE);
    assert.equal(own.body.setupComplete, true);
    assert.equal(own.body.earnerType, "provider");

    let sawBlock = false;
    await db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE users SET payout_method_type = NULL, payout_handle = NULL WHERE id = ${paypalId}`);
      const decision = await lockPayoutRequestDecision(tx, paypalId);
      assert.equal(decision.action, "block");
      if (decision.action === "block") assert.equal(decision.error, "stripe_not_connected");
      sawBlock = true;
      throw new RollbackProbe();
    }).catch((err) => {
      if (!(err instanceof RollbackProbe)) throw err;
    });
    assert.equal(sawBlock, true);
    assert.deepEqual(await storedHandle(paypalId), { method: "paypal", handle: HANDLE });
  });

  test("payouts are held until setup is complete, and earnings still accrue", async () => {
    const beforeBare = await earningCount("provider_earnings", "provider_id", bareId);
    const beforeExpert = await earningCount("expert_earnings", "expert_id", expertOpenId);
    assert.ok(beforeBare >= 2);
    assert.ok(beforeExpert >= 2);

    const bare = await call(paymentsRouter, "post", "/api/payouts/request", bareId, {});
    assert.equal(bare.statusCode, 400);
    assert.equal(bare.body.error, "stripe_not_connected");
    assert.equal(bare.body.message, STRIPE_NOT_CONNECTED_MESSAGE);
    assert.equal(await payoutCount("provider_payouts", "provider_id", bareId), 0);
    assert.equal(await earningCount("provider_earnings", "provider_id", bareId), beforeBare);

    const expertOpen = await call(paymentsRouter, "post", "/api/payouts/request", expertOpenId, {});
    assert.equal(expertOpen.statusCode, 400);
    assert.equal(expertOpen.body.error, "payout_setup_incomplete");
    assert.equal(await payoutCount("expert_payouts", "expert_id", expertOpenId), 0);
    assert.equal(await earningCount("expert_earnings", "expert_id", expertOpenId), beforeExpert);

    const expertDone = await call(paymentsRouter, "post", "/api/payouts/request", expertDoneId, {});
    assert.equal(expertDone.statusCode, 400);
    assert.equal(expertDone.body.error, "stripe_not_connected");
    const doneRead = await call(paymentsRouter, "get", "/api/me/payout-setup", expertDoneId);
    assert.equal(doneRead.body.setupComplete, true);
    assert.equal(doneRead.body.connectSource, "local_expert_forms");
    assert.equal(doneRead.body.stripeTransferReady, false);

    const paypal = await call(paymentsRouter, "post", "/api/payouts/request", paypalId, { amountCents: 999999 });
    assert.equal(paypal.statusCode, 201, JSON.stringify(paypal.body));
    assert.equal(paypal.body.status, "pending");
    assert.equal(paypal.body.requesterType, "provider");
    assert.equal(await payoutCount("provider_payouts", "provider_id", paypalId), 1);
    assert.equal(await earningCount("provider_earnings", "provider_id", paypalId), 1);

    const expertCreated = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
      requesterType: "expert",
      requesterId: expertDoneId,
      notes: "admin desk note",
    });
    assert.equal(expertCreated.statusCode, 201, JSON.stringify(expertCreated.body));
    assert.equal(expertCreated.body.status, "pending");
    const expertTransfer = await call(adminRouter, "patch", "/api/admin/payouts/:id", adminId, {
      status: "completed",
      requesterType: "expert",
    }, { id: expertCreated.body.id });
    assert.equal(expertTransfer.statusCode, 400);
    assert.equal(expertTransfer.body.error, "Recipient does not have an active Stripe Connect account. They must complete onboarding first.");
    assert.equal(await payoutStatus("expert_payouts", expertCreated.body.id), "pending");

    const expertOpenAdmin = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
      requesterType: "expert",
      requesterId: expertOpenId,
    });
    assert.equal(expertOpenAdmin.statusCode, 400);
    assert.equal(expertOpenAdmin.body.error, "payout_setup_incomplete");

    const adminBlocked = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
      requesterType: "provider",
      requesterId: bareId,
      amountCents: 2500,
    });
    assert.equal(adminBlocked.statusCode, 400);
    assert.equal(adminBlocked.body.error, "payout_setup_incomplete");
    assert.equal(await payoutCount("provider_payouts", "provider_id", bareId), 0);

    const created = await call(adminRouter, "post", "/api/admin/payouts", adminId, {
      requesterType: "provider",
      requesterId: adminCreateId,
    });
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    assert.equal(created.body.status, "pending");
    assert.equal(created.body.requesterType, "provider");

    const transferExternal = await call(adminRouter, "patch", "/api/admin/payouts/:id", adminId, {
      status: "completed",
      requesterType: "provider",
    }, { id: paypal.body.id });
    assert.equal(transferExternal.statusCode, 400);
    assert.equal(transferExternal.body.error, "payout_not_stripe_transfer");
    assert.equal(await payoutStatus("provider_payouts", paypal.body.id), "pending");

    await db.execute(sql`
      INSERT INTO provider_payouts (id, provider_id, amount, status)
      VALUES (${id("bare-pay")}, ${bareId}, '10.00', 'pending')
    `);
    const transferBare = await call(adminRouter, "patch", "/api/admin/payouts/:id", adminId, {
      status: "completed",
      requesterType: "provider",
    }, { id: id("bare-pay") });
    assert.equal(transferBare.statusCode, 400);
    assert.equal(transferBare.body.error, "payout_setup_incomplete");
    assert.equal(await payoutStatus("provider_payouts", id("bare-pay")), "pending");
  });

  test("owed rows carry setup status and not the handle", async () => {
    const rows = await listOwedEarners();
    const paypal = rows.find((row) => row.earnerId === paypalId);
    const bare = rows.find((row) => row.earnerId === bareId);
    const expert = rows.find((row) => row.earnerId === expertDoneId);
    assert.ok(paypal && bare && expert);
    assert.equal(paypal.payoutSetup.setupComplete, true);
    assert.equal(paypal.payoutSetup.payoutMethodType, "paypal");
    assert.equal(paypal.payoutSetup.payoutHandlePresent, true);
    assert.equal("payoutHandle" in paypal.payoutSetup, false);
    assert.equal(bare.payoutSetup.setupComplete, false);
    assert.equal(expert.payoutSetup.setupComplete, true);
    assert.equal(expert.payoutSetup.connectSource, "local_expert_forms");
    const encoded = JSON.stringify(rows.filter((row) => row.earnerId.startsWith(`${P}-`)));
    assert.equal(encoded.includes(HANDLE), false);
    assert.equal(encoded.includes(ROUTING), false);
    assert.equal(encoded.includes('"payoutHandle":'), false);

    const http = await call(adminRouter, "get", "/api/admin/payouts/owed", adminId);
    assert.equal(http.statusCode, 200);
    const httpPaypal = http.body.earners.find((row: any) => row.earnerId === paypalId);
    assert.equal(httpPaypal.payoutSetup.setupComplete, true);
    assert.equal(JSON.stringify(httpPaypal).includes(HANDLE), false);
  });

  test("mark-paid schema still rejects amountCents and reference, and the audit row omits the handle", async () => {
    assert.equal(markPaidBodySchema.safeParse({ requesterType: "provider", amountCents: 2500 }).success, false);
    assert.equal(markPaidBodySchema.safeParse({ requesterType: "provider", reference: "ref-1" }).success, false);
    assert.equal(markPaidBodySchema.safeParse({ requesterType: "provider", method: "paypal", notes: "desk-ref" }).success, true);

    const markUser = id("marku");
    const markHandle = `mark${RUN}@example.test`;
    await insertUser(markUser, "service_provider", { method: "paypal", handle: markHandle });
    await earning(
      "provider_earnings",
      "provider_id",
      markUser,
      "10.00",
      "releasable",
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    );
    const payoutId = id("mark");
    await db.execute(sql`
      INSERT INTO provider_payouts (id, provider_id, amount, status)
      VALUES (${payoutId}, ${markUser}, '10.00', 'pending')
    `);
    const marked = await markPayoutPaidExternally({
      payoutId,
      requesterType: "provider",
      method: "paypal",
      notes: "desk-ref",
      actorId: adminId,
      actorRole: "admin",
    });
    assert.equal(marked.ok, true, JSON.stringify(marked));
    const audit = await db.execute(sql`
      SELECT metadata::text AS meta FROM access_audit_logs
      WHERE action = 'payout_mark_paid' AND resource_id = ${payoutId}
    `);
    const meta = (audit.rows[0] as any)?.meta as string;
    assert.ok(meta);
    assert.equal(meta.includes(HANDLE), false);
    assert.equal(meta.includes(markHandle), false);
    assert.equal(meta.includes("payoutHandle"), false);
    assert.equal(meta.includes("payout_handle"), false);
  });

  test("a Stripe claim re-reads setup, and a paypal switch releases an unsent claim", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await earning("provider_earnings", "provider_id", stripeId, "10.00", "releasable", past);
    const payoutId = id("race");
    await db.execute(sql`
      INSERT INTO provider_payouts (id, provider_id, amount, status)
      VALUES (${payoutId}, ${stripeId}, '10.00', 'pending')
    `);
    await db.execute(sql`
      UPDATE users SET payout_method_type = 'paypal', payout_handle = ${`race${RUN}@example.test`}
      WHERE id = ${stripeId}
    `);
    const blocked = await storage.claimProviderPayoutForStripeTransfer(payoutId, stripeId);
    assert.equal(blocked.payout, undefined);
    assert.equal(blocked.reason, "payout_setup_blocked");
    assert.equal(blocked.error, "payout_not_stripe_transfer");
    assert.equal(blocked.message?.includes("race"), false);
    assert.equal(await payoutStatus("provider_payouts", payoutId), "pending");

    await db.execute(sql`
      UPDATE users SET payout_method_type = NULL, payout_handle = NULL WHERE id = ${stripeId}
    `);
    const claimed = await storage.claimProviderPayoutForStripeTransfer(payoutId, stripeId);
    assert.ok(claimed.payout, JSON.stringify(claimed));
    assert.equal(claimed.payout.status, "processing");
    const reserved = await db.execute(sql`
      SELECT count(*)::int AS n FROM provider_earnings
      WHERE provider_id = ${stripeId} AND payout_id = ${payoutId} AND status = 'releasable'
    `);
    assert.equal(Number((reserved.rows[0] as any)?.n), 1);

    await db.execute(sql`
      UPDATE users SET payout_method_type = 'paypal', payout_handle = ${`race${RUN}@example.test`}
      WHERE id = ${stripeId}
    `);
    const released = await storage.recheckStripeTransferBeforeSend(payoutId, "provider", stripeId);
    assert.equal(released.proceed, false);
    assert.equal("reason" in released, false);
    if (!released.proceed && !("reason" in released)) {
      assert.equal(released.error, "payout_not_stripe_transfer");
    }
    assert.equal(await payoutStatus("provider_payouts", payoutId), "pending");
    const cleared = await db.execute(sql`
      SELECT count(*)::int AS n FROM provider_earnings
      WHERE provider_id = ${stripeId} AND payout_id = ${payoutId}
    `);
    assert.equal(Number((cleared.rows[0] as any)?.n), 0);
  });
});
