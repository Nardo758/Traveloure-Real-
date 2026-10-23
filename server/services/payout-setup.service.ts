/**
 * Payout setup reads and the earner's own write (ledger `2026-10-23-payout-setup-server`).
 *
 * The users row is the only writer of payout_method_type and payout_handle, and only for the
 * session user. The handle is never written to a log or an audit row. A bank-like stored
 * value is not returned.
 *
 * Experts: Connect status is read from local_expert_forms.stripe_connect_status.
 * Providers: Connect is the users Stripe columns. Retiring the expert form's duplicate
 * Connect columns is a follow-up and is not done here.
 */
import { desc, eq, inArray, sql } from "drizzle-orm";
import { localExpertForms, users } from "@shared/schema";
import { isEarnerRole, isExpertRole } from "@shared/roles";
import { db } from "../db";
import {
  ADMIN_PAYOUT_NOT_CREATED_MESSAGE,
  buildPayoutSetup,
  decidePayoutRequest,
  decideStripeTransfer,
  toAdminPayoutSetup,
  validatePayoutSetupWrite,
  type AdminPayoutSetup,
  type EarnerType,
  type OwnPayoutSetup,
  type PayoutFacts,
  type PayoutRequestDecision,
  type StripeTransferDecision,
} from "./payout-setup";

type FactConn = Pick<typeof db, "select">;

export async function loadPayoutFacts(conn: FactConn, userId: string): Promise<PayoutFacts | null> {
  const [user] = await conn.select({
    role: users.role,
    stripeAccountId: users.stripeAccountId,
    stripeAccountStatus: users.stripeAccountStatus,
    canReceivePayments: users.canReceivePayments,
    payoutMethodType: users.payoutMethodType,
    payoutHandle: users.payoutHandle,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [form] = await conn.select({
    stripeConnectStatus: localExpertForms.stripeConnectStatus,
  }).from(localExpertForms)
    .where(eq(localExpertForms.userId, userId))
    .orderBy(desc(localExpertForms.createdAt))
    .limit(1);
  return {
    role: user.role ?? null,
    stripeAccountId: user.stripeAccountId ?? null,
    stripeAccountStatus: user.stripeAccountStatus ?? null,
    canReceivePayments: user.canReceivePayments ?? null,
    payoutMethodType: user.payoutMethodType ?? null,
    payoutHandle: user.payoutHandle ?? null,
    formStripeConnectStatus: form?.stripeConnectStatus ?? null,
  };
}

export async function readPayoutFacts(userId: string): Promise<PayoutFacts | null> {
  return loadPayoutFacts(db, userId);
}

export async function readOwnPayoutSetup(userId: string): Promise<
  | { ok: true; setup: OwnPayoutSetup }
  | { ok: false; status: 401 | 403; error: string; message: string }
> {
  const facts = await readPayoutFacts(userId);
  if (!facts) return { ok: false, status: 401, error: "not_authenticated", message: "Not authenticated" };
  if (!isEarnerRole(facts.role)) {
    return { ok: false, status: 403, error: "not_an_earner", message: "Only providers and experts can set up payouts" };
  }
  const earnerType: EarnerType = isExpertRole(facts.role) ? "expert" : "provider";
  return { ok: true, setup: buildPayoutSetup(facts, earnerType) };
}

export type SavePayoutSetupResult =
  | { ok: true; setup: OwnPayoutSetup }
  | { ok: false; status: number; error: string; message: string };

/**
 * Writes payout_method_type and payout_handle on the session user's row only.
 * One UPDATE. The handle is not logged and is not copied into audit metadata.
 */
export async function saveOwnPayoutSetup(userId: string, body: unknown): Promise<SavePayoutSetupResult> {
  const facts = await readPayoutFacts(userId);
  if (!facts) return { ok: false, status: 401, error: "not_authenticated", message: "Not authenticated" };
  if (!isEarnerRole(facts.role)) {
    return { ok: false, status: 403, error: "not_an_earner", message: "Only providers and experts can set up payouts" };
  }
  const write = validatePayoutSetupWrite(body);
  if (!write.ok) return { ok: false, status: 400, error: write.error, message: write.message };
  const updated = await db.update(users).set({
    payoutMethodType: write.payoutMethodType,
    payoutHandle: write.payoutHandle,
    updatedAt: new Date(),
  }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!updated.length) return { ok: false, status: 401, error: "not_authenticated", message: "Not authenticated" };
  const saved = await readOwnPayoutSetup(userId);
  if (!saved.ok) return saved;
  return { ok: true, setup: saved.setup };
}

type LockConn = Pick<typeof db, "execute" | "select">;

async function lockUserRow(tx: LockConn, userId: string): Promise<void> {
  await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
}

/** Re-reads setup under a row lock so a payout insert cannot race a cleared handle. */
export async function lockPayoutRequestDecision(
  tx: LockConn,
  userId: string,
): Promise<PayoutRequestDecision> {
  await lockUserRow(tx, userId);
  const facts = await loadPayoutFacts(tx, userId);
  return decidePayoutRequest(facts);
}

/** Same lock for an admin-created payout row. The insert belongs in this transaction. */
export async function lockAdminCreateAllowed(
  tx: LockConn,
  userId: string,
  earnerType: EarnerType,
): Promise<{ ok: true } | { ok: false; error: "payout_setup_incomplete"; message: string }> {
  await lockUserRow(tx, userId);
  const facts = await loadPayoutFacts(tx, userId);
  const setup = facts ? buildPayoutSetup(facts, earnerType) : null;
  if (!setup?.setupComplete) {
    return { ok: false, error: "payout_setup_incomplete", message: ADMIN_PAYOUT_NOT_CREATED_MESSAGE };
  }
  return { ok: true };
}

/** Re-reads setup under a row lock before any Stripe transfer. External methods never transfer. */
export async function lockStripeTransferDecision(
  tx: LockConn,
  userId: string,
  earnerType: EarnerType,
): Promise<StripeTransferDecision> {
  await lockUserRow(tx, userId);
  const facts = await loadPayoutFacts(tx, userId);
  return decideStripeTransfer(facts, earnerType);
}

export async function readAdminPayoutSetups(
  rows: { earnerId: string; earnerType: EarnerType }[],
): Promise<Map<string, AdminPayoutSetup>> {
  const out = new Map<string, AdminPayoutSetup>();
  const ids = Array.from(new Set(rows.map((row) => row.earnerId)));
  if (!ids.length) return out;
  const userRows = await db.select({
    id: users.id,
    role: users.role,
    stripeAccountId: users.stripeAccountId,
    stripeAccountStatus: users.stripeAccountStatus,
    canReceivePayments: users.canReceivePayments,
    payoutMethodType: users.payoutMethodType,
    payoutHandle: users.payoutHandle,
  }).from(users).where(inArray(users.id, ids));
  const byId = new Map(userRows.map((row) => [row.id, row]));
  const expertIds = Array.from(new Set(rows.filter((row) => row.earnerType === "expert").map((row) => row.earnerId)));
  const formRows = expertIds.length
    ? await db.select({
      userId: localExpertForms.userId,
      stripeConnectStatus: localExpertForms.stripeConnectStatus,
      createdAt: localExpertForms.createdAt,
    }).from(localExpertForms).where(inArray(localExpertForms.userId, expertIds))
    : [];
  const formByUser = new Map<string, { stripeConnectStatus: string | null; createdAt: Date | null }>();
  for (const form of formRows) {
    const prev = formByUser.get(form.userId);
    const prevAt = prev?.createdAt?.getTime() ?? -1;
    const nextAt = form.createdAt?.getTime() ?? -1;
    if (!prev || nextAt >= prevAt) {
      formByUser.set(form.userId, {
        stripeConnectStatus: form.stripeConnectStatus ?? null,
        createdAt: form.createdAt ?? null,
      });
    }
  }
  for (const row of rows) {
    const user = byId.get(row.earnerId);
    const facts: PayoutFacts = {
      role: user?.role ?? null,
      stripeAccountId: user?.stripeAccountId ?? null,
      stripeAccountStatus: user?.stripeAccountStatus ?? null,
      canReceivePayments: user?.canReceivePayments ?? null,
      payoutMethodType: user?.payoutMethodType ?? null,
      payoutHandle: user?.payoutHandle ?? null,
      formStripeConnectStatus: formByUser.get(row.earnerId)?.stripeConnectStatus ?? null,
    };
    const key = `${row.earnerType}:${row.earnerId}`;
    out.set(key, toAdminPayoutSetup(buildPayoutSetup(facts, row.earnerType)));
  }
  return out;
}
