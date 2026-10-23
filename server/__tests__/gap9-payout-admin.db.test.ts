/**
 * Gap 9 payout admin against a disposable database.
 *
 * An externally completed payout drops getExpertEarningsSummary / getProviderEarningsSummary
 * the same way a Stripe completion does. mark-paid stores payout_method external (never stripe),
 * refuses every status other than pending or approved, and refuses an amount above owed.
 * Manual reminders honor the 72h cooldown, write one audit row, and insert no email_outbox row.
 * Scheduler candidates skip Identity-only experts and read Connect from the expert form.
 *
 * Run: npx tsx --test server/__tests__/gap9-payout-admin.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { amountOwed, listOwedEarners, markPayoutPaidExternally } from "../services/payout-admin.service";
import { adminRemindStripeConnect, stripeConnectReminderCandidates } from "../services/stripe-connect-reminder.service";
import { listNotRoutableExperts } from "../services/expert-routability";
import { STRIPE_CONNECT_REMINDER_COOLDOWN_MS } from "../services/stripe-connect-reminder-policy";

const RUN = crypto.randomUUID().slice(0, 8);
const P = `g9${RUN}`;
const id = (suffix: string) => `${P}${suffix}`;

const adminId = id("adm");
const expertStripe = id("es");
const expertExternal = id("ee");
const expertBank = id("eb");
const expertProcessing = id("ep");
const expertCompleted = id("ec");
const expertFailed = id("ef");
const expertOver = id("eo");
const expertDirect = id("ed");
const expertProcDirect = id("ex");
const providerStripe = id("ps");
const providerExternal = id("pe");
const reminderId = id("rm");
const reminder71 = id("r7");
const identityOnly = id("id");
const staleUsers = id("st");
const providerComplete = id("pc");
const providerOpen = id("po");
const routableId = id("rt");
const notRoutableId = id("nr");

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[gap9] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

function near(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${label}: expected ${expected}, got ${actual}`);
}

async function insertUser(
  userId: string,
  role: string,
  stripe?: { accountId?: string | null; status?: string | null },
) {
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, stripe_account_id, stripe_account_status)
    VALUES (
      ${userId},
      ${`${userId}@payout-admin.invalid`},
      'Gap',
      'Nine',
      ${role},
      ${stripe?.accountId ?? null},
      ${stripe?.status ?? null}
    )
  `);
}

async function insertForm(userId: string, application: string, identity: string, connect: string) {
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, status, identity_verification_status, stripe_connect_status)
    VALUES (${crypto.randomUUID()}, ${userId}, ${application}, ${identity}, ${connect})
  `);
}

async function insertExpertEarning(earningId: string, expertId: string, amount: string, status: string, availableAt: string) {
  await db.execute(sql`
    INSERT INTO expert_earnings (id, expert_id, type, amount, status, dispute_state, available_at)
    VALUES (${earningId}, ${expertId}, 'tip', ${amount}, ${status}, 'none', ${availableAt}::timestamptz)
  `);
}

async function insertProviderEarning(earningId: string, providerId: string, amount: string, status: string, availableAt: string) {
  await db.execute(sql`
    INSERT INTO provider_earnings (id, provider_id, type, amount, status, dispute_state, available_at)
    VALUES (${earningId}, ${providerId}, 'service_booking', ${amount}, ${status}, 'none', ${availableAt}::timestamptz)
  `);
}

async function insertExpertPayout(payoutId: string, expertId: string, amount: string, status: string) {
  await db.execute(sql`
    INSERT INTO expert_payouts (id, expert_id, amount, status)
    VALUES (${payoutId}, ${expertId}, ${amount}, ${status})
  `);
}

async function insertProviderPayout(payoutId: string, providerId: string, amount: string, status: string) {
  await db.execute(sql`
    INSERT INTO provider_payouts (id, provider_id, amount, status)
    VALUES (${payoutId}, ${providerId}, ${amount}, ${status})
  `);
}

async function payoutMethodOf(table: "expert_payouts" | "provider_payouts", payoutId: string): Promise<string | null> {
  const rel = table === "expert_payouts" ? sql`expert_payouts` : sql`provider_payouts`;
  const r = await db.execute(sql`SELECT payout_method AS method, status FROM ${rel} WHERE id = ${payoutId}`);
  return ((r.rows[0] as any)?.method as string | null) ?? null;
}

async function payoutStatusOf(table: "expert_payouts" | "provider_payouts", payoutId: string): Promise<string | null> {
  const rel = table === "expert_payouts" ? sql`expert_payouts` : sql`provider_payouts`;
  const r = await db.execute(sql`SELECT status FROM ${rel} WHERE id = ${payoutId}`);
  return ((r.rows[0] as any)?.status as string | null) ?? null;
}

async function earningStatus(table: "expert_earnings" | "provider_earnings", earningId: string): Promise<string | null> {
  const rel = table === "expert_earnings" ? sql`expert_earnings` : sql`provider_earnings`;
  const r = await db.execute(sql`SELECT status FROM ${rel} WHERE id = ${earningId}`);
  return ((r.rows[0] as any)?.status as string | null) ?? null;
}

async function auditCount(action: string, resourceId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM access_audit_logs
    WHERE action = ${action} AND resource_id = ${resourceId}
  `);
  return Number((r.rows[0] as any)?.n ?? 0);
}

async function notificationCount(userId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM notifications
    WHERE user_id = ${userId} AND type = 'stripe_connect_reminder'
  `);
  return Number((r.rows[0] as any)?.n ?? 0);
}

async function emailCount(address: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM email_outbox WHERE to_email = ${address}`);
  return Number((r.rows[0] as any)?.n ?? 0);
}

const ids = {
  esEarn: id("ese"),
  esHold: id("esh"),
  esPay: id("esp"),
  eeEarn: id("eee"),
  eeHold: id("eeh"),
  eePay: id("eep"),
  ebEarn: id("ebe"),
  ebPay: id("ebp"),
  epEarn: id("epe"),
  epPay: id("epp"),
  ecPay: id("ecp"),
  efPay: id("efp"),
  eoEarn: id("eoe"),
  eoPay: id("eop"),
  edEarn: id("ede"),
  edPay: id("edp"),
  exEarn: id("exe"),
  exPay: id("exp"),
  psEarn: id("pse"),
  psHold: id("psh"),
  psPay: id("psp"),
  peEarn: id("pee"),
  peHold: id("peh"),
  pePay: id("pep"),
};

before(async () => {
  await assertDisposableDb();
  await insertUser(adminId, "admin");

  await insertUser(expertStripe, "travel_expert");
  await insertUser(expertExternal, "local_expert");
  await insertUser(expertBank, "event_planner");
  await insertUser(expertProcessing, "expert");
  await insertUser(expertCompleted, "travel_expert");
  await insertUser(expertFailed, "travel_expert");
  await insertUser(expertOver, "travel_expert");
  await insertUser(expertDirect, "travel_expert");
  await insertUser(expertProcDirect, "travel_expert");

  await insertExpertEarning(ids.esEarn, expertStripe, "40.00", "releasable", PAST);
  await insertExpertEarning(ids.esHold, expertStripe, "15.00", "held", FUTURE);
  await insertExpertPayout(ids.esPay, expertStripe, "40.00", "pending");

  await insertExpertEarning(ids.eeEarn, expertExternal, "40.00", "releasable", PAST);
  await insertExpertEarning(ids.eeHold, expertExternal, "15.00", "held", FUTURE);
  await insertExpertPayout(ids.eePay, expertExternal, "40.00", "pending");

  await insertExpertEarning(ids.ebEarn, expertBank, "25.00", "releasable", PAST);
  await insertExpertPayout(ids.ebPay, expertBank, "25.00", "approved");

  await insertExpertEarning(ids.epEarn, expertProcessing, "30.00", "releasable", PAST);
  await insertExpertPayout(ids.epPay, expertProcessing, "30.00", "processing");

  await insertExpertPayout(ids.ecPay, expertCompleted, "10.00", "completed");
  await insertExpertPayout(ids.efPay, expertFailed, "10.00", "failed");

  await insertExpertEarning(ids.eoEarn, expertOver, "40.00", "releasable", PAST);
  await insertExpertPayout(ids.eoPay, expertOver, "50.00", "pending");

  await insertExpertEarning(ids.edEarn, expertDirect, "40.00", "releasable", PAST);
  await insertExpertPayout(ids.edPay, expertDirect, "40.00", "pending");

  await insertExpertEarning(ids.exEarn, expertProcDirect, "40.00", "releasable", PAST);
  await insertExpertPayout(ids.exPay, expertProcDirect, "40.00", "processing");

  await insertUser(providerStripe, "service_provider");
  await insertUser(providerExternal, "service_provider");
  await insertProviderEarning(ids.psEarn, providerStripe, "25.00", "releasable", PAST);
  await insertProviderEarning(ids.psHold, providerStripe, "10.00", "held", FUTURE);
  await insertProviderPayout(ids.psPay, providerStripe, "25.00", "pending");
  await insertProviderEarning(ids.peEarn, providerExternal, "25.00", "releasable", PAST);
  await insertProviderEarning(ids.peHold, providerExternal, "10.00", "held", FUTURE);
  await insertProviderPayout(ids.pePay, providerExternal, "25.00", "pending");

  await insertUser(reminderId, "travel_expert");
  await insertUser(reminder71, "service_provider");
  await db.execute(sql`
    INSERT INTO notifications (id, user_id, type, title, message, created_at)
    VALUES (
      ${crypto.randomUUID()},
      ${reminder71},
      'stripe_connect_reminder',
      'Complete Your Payout Setup',
      'An admin has sent you a reminder to complete your Stripe Connect setup so you can receive payouts. Visit your Money page to get started.',
      now() - interval '71 hours'
    )
  `);

  await insertUser(identityOnly, "local_expert", { status: "onboarding_incomplete" });
  await insertForm(identityOnly, "approved", "pending", "complete");
  await insertUser(staleUsers, "travel_expert", { accountId: "acct_stale_gap9", status: "complete" });
  await insertForm(staleUsers, "approved", "verified", "not_started");
  await insertUser(providerComplete, "service_provider", { accountId: "acct_provider_ok", status: "complete" });
  await insertUser(providerOpen, "service_provider");

  await insertUser(routableId, "travel_expert");
  await insertForm(routableId, "approved", "verified", "complete");
  await insertUser(notRoutableId, "travel_expert");
  await insertForm(notRoutableId, "approved", "pending", "complete");
});

after(async () => {
  await db.execute(sql`DELETE FROM access_audit_logs WHERE actor_id LIKE ${P + "%"} OR target_user_id LIKE ${P + "%"}`);
  await db.execute(sql`DELETE FROM notifications WHERE user_id LIKE ${P + "%"}`);
  await db.execute(sql`DELETE FROM expert_payouts WHERE expert_id LIKE ${P + "%"}`);
  await db.execute(sql`DELETE FROM provider_payouts WHERE provider_id LIKE ${P + "%"}`);
  await db.execute(sql`DELETE FROM expert_earnings WHERE expert_id LIKE ${P + "%"}`);
  await db.execute(sql`DELETE FROM provider_earnings WHERE provider_id LIKE ${P + "%"}`);
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id LIKE ${P + "%"}`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${P + "%"}`);
});

test("external completion drops owed the same way a Stripe completion does", async () => {
  const beforeExpertStripe = await storage.getExpertEarningsSummary(expertStripe);
  const beforeExpertExternal = await storage.getExpertEarningsSummary(expertExternal);
  const beforeProviderStripe = await storage.getProviderEarningsSummary(providerStripe);
  const beforeProviderExternal = await storage.getProviderEarningsSummary(providerExternal);
  near(beforeExpertStripe.available, 40, "expert stripe available before");
  near(beforeExpertExternal.available, 40, "expert external available before");
  near(beforeExpertStripe.pending, 15, "expert stripe pending before");
  near(beforeExpertExternal.pending, 15, "expert external pending before");
  near(beforeExpertStripe.paidOut, 0, "expert stripe paid before");
  near(beforeProviderStripe.available, 25, "provider stripe available before");
  near(beforeProviderExternal.available, 25, "provider external available before");
  near(beforeProviderStripe.pending, 10, "provider stripe pending before");

  const owedBefore = await amountOwed("expert", expertExternal);
  near(owedBefore.owed, beforeExpertExternal.available, "owed matches available");
  const listed = (await listOwedEarners()).find((row) => row.earnerId === expertExternal);
  assert.ok(listed);
  near(listed.owed, 40, "owed list");

  await storage.updateExpertPayoutStatus(ids.esPay, "completed");
  const external = await markPayoutPaidExternally({
    payoutId: ids.eePay,
    requesterType: "expert",
    method: "stripe",
    actorId: adminId,
    actorRole: "admin",
  });
  assert.equal(external.ok, true);
  if (!external.ok) return;

  await storage.updateProviderPayoutStatus(ids.psPay, "completed");
  const providerPaid = await markPayoutPaidExternally({
    payoutId: ids.pePay,
    requesterType: "provider",
    method: "Stripe",
    actorId: adminId,
    actorRole: "admin",
  });
  assert.equal(providerPaid.ok, true);

  const afterExpertStripe = await storage.getExpertEarningsSummary(expertStripe);
  const afterExpertExternal = await storage.getExpertEarningsSummary(expertExternal);
  const afterProviderStripe = await storage.getProviderEarningsSummary(providerStripe);
  const afterProviderExternal = await storage.getProviderEarningsSummary(providerExternal);

  near(afterExpertStripe.available, afterExpertExternal.available, "expert available parity");
  near(afterExpertStripe.paidOut, afterExpertExternal.paidOut, "expert paidOut parity");
  near(afterExpertStripe.pending, afterExpertExternal.pending, "expert pending parity");
  near(afterExpertExternal.available, 0, "expert external available");
  near(afterExpertExternal.paidOut, 40, "expert external paidOut");
  near(afterExpertExternal.pending, 15, "held earning stays pending");
  near(afterProviderStripe.available, afterProviderExternal.available, "provider available parity");
  near(afterProviderStripe.paidOut, afterProviderExternal.paidOut, "provider paidOut parity");
  near(afterProviderExternal.available, 0, "provider external available");
  near(afterProviderExternal.paidOut, 25, "provider external paidOut");
  near(afterProviderExternal.pending, 10, "provider held stays pending");

  const owedAfter = await amountOwed("expert", expertExternal);
  const owedStripe = await amountOwed("expert", expertStripe);
  near(owedAfter.owed, owedStripe.owed, "owed parity");
  near(owedAfter.available, 0, "owed available");
  near((await amountOwed("provider", providerExternal)).owed, (await amountOwed("provider", providerStripe)).owed, "provider owed parity");

  assert.equal(external.payout.payoutMethod, "external");
  assert.notEqual(external.payout.payoutMethod, "stripe");
  assert.equal(await payoutMethodOf("expert_payouts", ids.eePay), "external");
  assert.equal(await payoutMethodOf("provider_payouts", ids.pePay), "external");
  assert.equal(await payoutMethodOf("expert_payouts", ids.esPay), null);
  assert.equal(await earningStatus("expert_earnings", ids.eeEarn), "paid_out");
  assert.equal(await earningStatus("expert_earnings", ids.esEarn), "paid_out");
  assert.equal(await earningStatus("expert_earnings", ids.eeHold), "held");
  assert.equal(await earningStatus("provider_earnings", ids.peEarn), "paid_out");
  assert.equal(await earningStatus("provider_earnings", ids.psEarn), "paid_out");

  const expertList = await storage.getAllExpertPayouts();
  const listedExpert = expertList.find((row) => row.id === ids.eePay);
  assert.equal(listedExpert?.status, "completed");
  assert.equal(listedExpert?.payoutMethod, "external");
  const providerList = await storage.getAllProviderPayouts();
  const listedProvider = providerList.find((row) => row.id === ids.pePay);
  assert.equal(listedProvider?.status, "completed");
  assert.equal(listedProvider?.payoutMethod, "external");

  assert.equal(await auditCount("payout_mark_paid", ids.eePay), 1);
  const again = await markPayoutPaidExternally({
    payoutId: ids.eePay,
    requesterType: "expert",
    method: "bank_transfer",
    actorId: adminId,
    actorRole: "admin",
  });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.status, 409);
  assert.equal(await payoutMethodOf("expert_payouts", ids.eePay), "external");
  assert.equal(await auditCount("payout_mark_paid", ids.eePay), 1);
});

test("mark-paid refuses every state other than pending or approved, and an amount above owed", async () => {
  for (const payoutId of [ids.epPay, ids.ecPay, ids.efPay]) {
    const refused = await markPayoutPaidExternally({
      payoutId,
      requesterType: "expert",
      method: "bank_transfer",
      actorId: adminId,
      actorRole: "admin",
    });
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.status, 409);
    assert.equal(await auditCount("payout_mark_paid", payoutId), 0);
  }
  assert.equal(await payoutStatusOf("expert_payouts", ids.epPay), "processing");
  assert.equal(await earningStatus("expert_earnings", ids.epEarn), "releasable");
  assert.equal(await payoutMethodOf("expert_payouts", ids.epPay), null);

  const over = await markPayoutPaidExternally({
    payoutId: ids.eoPay,
    requesterType: "expert",
    actorId: adminId,
    actorRole: "admin",
  });
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.equal(over.status, 409);
    assert.match(over.message, /exceeds the amount owed/);
  }
  assert.equal(await payoutStatusOf("expert_payouts", ids.eoPay), "pending");
  assert.equal(await earningStatus("expert_earnings", ids.eoEarn), "releasable");
  assert.equal(await auditCount("payout_mark_paid", ids.eoPay), 0);

  const missing = await markPayoutPaidExternally({
    payoutId: ids.eePay,
    requesterType: "provider",
    actorId: adminId,
    actorRole: "admin",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 404);
});

test("mark-paid and the status updater never store payout_method stripe", async () => {
  const bank = await markPayoutPaidExternally({
    payoutId: ids.ebPay,
    requesterType: "expert",
    method: "bank_transfer",
    notes: "wire ref gap9",
    actorId: adminId,
    actorRole: "admin",
  });
  assert.equal(bank.ok, true);
  assert.equal(await payoutMethodOf("expert_payouts", ids.ebPay), "bank_transfer");
  assert.notEqual(await payoutMethodOf("expert_payouts", ids.ebPay), "stripe");
  const reason = await db.execute(sql`SELECT failure_reason FROM expert_payouts WHERE id = ${ids.ebPay}`);
  assert.equal((reason.rows[0] as any)?.failure_reason ?? null, null);
  const audit = await db.execute(sql`
    SELECT metadata FROM access_audit_logs
    WHERE action = 'payout_mark_paid' AND resource_id = ${ids.ebPay}
  `);
  const metadata = (audit.rows[0] as any)?.metadata ?? {};
  assert.equal(metadata.payoutMethod, "bank_transfer");
  assert.equal(metadata.emailSent, false);
  assert.equal(metadata.notes, "wire ref gap9");

  const direct = await storage.updateExpertPayoutStatus(ids.edPay, "completed", undefined, undefined, {
    payoutMethod: "stripe",
    onlyFrom: ["pending", "approved"],
  });
  assert.equal(direct.payoutMethod, "external");
  assert.notEqual(direct.payoutMethod, "stripe");
  assert.equal(await earningStatus("expert_earnings", ids.edEarn), "paid_out");

  const stripePath = await storage.updateExpertPayoutStatus(ids.exPay, "completed");
  assert.equal(stripePath.status, "completed");
  assert.equal(stripePath.payoutMethod ?? null, null);
  assert.equal(await earningStatus("expert_earnings", ids.exEarn), "paid_out");
});

test("manual reminders share a 72h cooldown, write one audit row, and send no email", async () => {
  assert.equal(STRIPE_CONNECT_REMINDER_COOLDOWN_MS, 72 * 60 * 60 * 1000);
  const address = `${reminderId}@payout-admin.invalid`;
  const emailsBefore = await emailCount(address);
  const otherBefore = await emailCount(`${reminder71}@payout-admin.invalid`);

  const first = await adminRemindStripeConnect({
    actorId: adminId,
    actorRole: "admin",
    targetUserId: reminderId,
    targetRole: "travel_expert",
    earnerKind: "expert",
  });
  assert.equal(first.ok, true);
  assert.equal(await notificationCount(reminderId), 1);
  assert.equal(await auditCount("stripe_connect_reminder", reminderId), 1);
  const note = await db.execute(sql`
    SELECT title, message, data FROM notifications
    WHERE user_id = ${reminderId} AND type = 'stripe_connect_reminder'
  `);
  assert.equal((note.rows[0] as any)?.title, "Complete Your Payout Setup");
  assert.equal((note.rows[0] as any)?.data?.link, "/expert/money");

  const second = await adminRemindStripeConnect({
    actorId: adminId,
    actorRole: "admin",
    targetUserId: reminderId,
    targetRole: "travel_expert",
    earnerKind: "expert",
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, "cooldown");
  assert.equal(await notificationCount(reminderId), 1);
  assert.equal(await auditCount("stripe_connect_reminder", reminderId), 1);

  await db.execute(sql`
    UPDATE notifications
    SET created_at = now() - interval '73 hours'
    WHERE user_id = ${reminderId} AND type = 'stripe_connect_reminder'
  `);
  const third = await adminRemindStripeConnect({
    actorId: adminId,
    actorRole: "admin",
    targetUserId: reminderId,
    targetRole: "travel_expert",
    earnerKind: "expert",
  });
  assert.equal(third.ok, true);
  assert.equal(await notificationCount(reminderId), 2);
  assert.equal(await auditCount("stripe_connect_reminder", reminderId), 2);

  const blocked = await adminRemindStripeConnect({
    actorId: adminId,
    actorRole: "admin",
    targetUserId: reminder71,
    targetRole: "service_provider",
    earnerKind: "provider",
  });
  assert.equal(blocked.ok, false);
  assert.equal(await notificationCount(reminder71), 1);
  assert.equal(await auditCount("stripe_connect_reminder", reminder71), 0);

  assert.equal(await emailCount(address), emailsBefore);
  assert.equal(await emailCount(`${reminder71}@payout-admin.invalid`), otherBefore);
});

test("scheduler candidates skip Identity-only experts and a stale users Connect column", async () => {
  const candidates = await stripeConnectReminderCandidates();
  const mine = new Set(candidates.filter((row) => row.id.startsWith(P)).map((row) => row.id));
  assert.equal(mine.has(identityOnly), false);
  assert.equal(mine.has(staleUsers), true);
  assert.equal(candidates.find((row) => row.id === staleUsers)?.role, "travel_expert");
  assert.equal(mine.has(providerComplete), false);
  assert.equal(mine.has(providerOpen), true);
});

test("a routable expert and a set-up provider are refused with no notification and no audit", async () => {
  const routable = await adminRemindStripeConnect({
    actorId: adminId,
    actorRole: "admin",
    targetUserId: routableId,
    targetRole: "travel_expert",
    earnerKind: "expert",
  });
  assert.equal(routable.ok, false);
  if (!routable.ok) {
    assert.equal(routable.status, 409);
    assert.equal(routable.reason, "already_set_up");
    assert.equal(routable.message, "This expert is already routable.");
  }
  assert.equal(await notificationCount(routableId), 0);
  assert.equal(await auditCount("stripe_connect_reminder", routableId), 0);

  await db.execute(sql`
    INSERT INTO notifications (id, user_id, type, title, message, created_at)
    VALUES (
      ${crypto.randomUUID()},
      ${routableId},
      'stripe_connect_reminder',
      'Complete Your Payout Setup',
      'An admin has sent you a reminder to complete your Stripe Connect setup so you can receive payouts. Visit your Money page to get started.',
      now()
    )
  `);
  const stillRoutable = await adminRemindStripeConnect({
    actorId: adminId,
    actorRole: "admin",
    targetUserId: routableId,
    targetRole: "travel_expert",
    earnerKind: "expert",
  });
  assert.equal(stillRoutable.ok, false);
  if (!stillRoutable.ok) assert.equal(stillRoutable.status, 409);
  assert.equal(await notificationCount(routableId), 1);
  assert.equal(await auditCount("stripe_connect_reminder", routableId), 0);

  const provider = await adminRemindStripeConnect({
    actorId: adminId,
    actorRole: "admin",
    targetUserId: providerComplete,
    targetRole: "service_provider",
    earnerKind: "provider",
  });
  assert.equal(provider.ok, false);
  if (!provider.ok) {
    assert.equal(provider.status, 409);
    assert.equal(provider.reason, "already_set_up");
    assert.equal(provider.message, "This provider is already set up for payouts.");
  }
  assert.equal(await notificationCount(providerComplete), 0);
  assert.equal(await auditCount("stripe_connect_reminder", providerComplete), 0);

  const identityOnlyRemind = await adminRemindStripeConnect({
    actorId: adminId,
    actorRole: "admin",
    targetUserId: notRoutableId,
    targetRole: "travel_expert",
    earnerKind: "expert",
  });
  assert.equal(identityOnlyRemind.ok, true);
  assert.equal(await notificationCount(notRoutableId), 1);
  assert.equal(await auditCount("stripe_connect_reminder", notRoutableId), 1);

  const openProvider = await adminRemindStripeConnect({
    actorId: adminId,
    actorRole: "admin",
    targetUserId: providerOpen,
    targetRole: "service_provider",
    earnerKind: "provider",
  });
  assert.equal(openProvider.ok, true);
  assert.equal(await notificationCount(providerOpen), 1);
  assert.equal(await auditCount("stripe_connect_reminder", providerOpen), 1);
  assert.equal(await emailCount(`${routableId}@payout-admin.invalid`), 0);
  assert.equal(await emailCount(`${providerComplete}@payout-admin.invalid`), 0);
});

test("not-routable experts are the accounts the routable predicate refuses", async () => {
  const rows = await listNotRoutableExperts();
  const mine = new Set(rows.filter((row) => row.userId.startsWith(P)).map((row) => row.userId));
  assert.equal(mine.has(routableId), false);
  assert.equal(mine.has(notRoutableId), true);
  const shown = rows.find((row) => row.userId === notRoutableId);
  assert.equal(shown?.identityVerificationStatus, "pending");
  assert.equal(shown?.stripeConnectStatus, "complete");
});
