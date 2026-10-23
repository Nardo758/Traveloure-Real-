/**
 * Admin payout reads and the external mark-paid rail.
 *
 * Owed amounts come from getExpertEarningsSummary / getProviderEarningsSummary,
 * so an external completion and a Stripe completion draw the same available balance
 * down. Mark-paid completes through those summaries' status updater and records
 * payout_method on the payout row. It does not send email.
 */
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { expertEarnings, expertPayouts, providerEarnings, providerPayouts, users } from "@shared/schema";
import {
  EXTERNAL_MARK_PAID_FROM,
  externalPayoutMethod,
  type PayoutStatusUpdateOptions,
} from "../config/payout.config";
import { recordAdminDecisionAudit } from "./admin-decision-audit";

export const PAYOUT_MARK_PAID_ACTION = "payout_mark_paid";

export const markPaidBodySchema = z.object({
  requesterType: z.enum(["expert", "provider"]),
  method: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
}).strict();

export type EarnerType = "expert" | "provider";

export type OwedEarner = {
  earnerId: string;
  earnerType: EarnerType;
  /** Payable now. Same number as `available` from the earnings summary. */
  owed: number;
  available: number;
  pending: number;
  paidOut: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function amountOwed(earnerType: EarnerType, earnerId: string): Promise<OwedEarner> {
  const summary = earnerType === "expert"
    ? await storage.getExpertEarningsSummary(earnerId)
    : await storage.getProviderEarningsSummary(earnerId);
  const available = round2(summary.available);
  const pending = round2(summary.pending);
  const paidOut = round2(summary.paidOut);
  return {
    earnerId,
    earnerType,
    owed: available,
    available,
    pending,
    paidOut,
  };
}

/**
 * A row on the admin Owed view (gap 9 screens). Reads only.
 * - `displayName`: first and last name, or null. Never an email.
 * - `canReceiveTransfer`: the payout-request gate's own test (`payments.routes.ts`): a Stripe account id and
 *   `canReceivePayments`, read through the same `storage.getUserStripeAccount`.
 * - `pendingPayoutCount` / `pendingPayoutTotal`: this earner's payout rows still `pending` or `approved`.
 */
export type OwedEarnerRow = OwedEarner & {
  displayName: string | null;
  canReceiveTransfer: boolean;
  pendingPayoutCount: number;
  pendingPayoutTotal: number;
};

export function canReceiveTransfer(account: { stripeAccountId: string | null; canReceivePayments: boolean | null }): boolean {
  return !!account.stripeAccountId && !!account.canReceivePayments;
}

async function pendingPayoutsFor(earnerType: EarnerType, earnerId: string): Promise<{ count: number; total: number }> {
  const table = earnerType === "expert" ? expertPayouts : providerPayouts;
  const owner = earnerType === "expert" ? expertPayouts.expertId : providerPayouts.providerId;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${table.amount}), 0)` })
    .from(table)
    .where(and(eq(owner, earnerId), inArray(table.status, [...EXTERNAL_MARK_PAID_FROM])));
  return { count: Number(row?.n ?? 0), total: round2(parseFloat(String(row?.total ?? "0")) || 0) };
}

export async function listOwedEarners(): Promise<OwedEarnerRow[]> {
  const [experts, providers] = await Promise.all([
    db.selectDistinct({ id: expertEarnings.expertId }).from(expertEarnings),
    db.selectDistinct({ id: providerEarnings.providerId }).from(providerEarnings),
  ]);
  const owedRows: OwedEarner[] = [];
  for (const expert of experts) {
    const owed = await amountOwed("expert", expert.id);
    if (owed.owed > 0 || owed.pending > 0) owedRows.push(owed);
  }
  for (const provider of providers) {
    const owed = await amountOwed("provider", provider.id);
    if (owed.owed > 0 || owed.pending > 0) owedRows.push(owed);
  }
  owedRows.sort((a, b) => a.earnerType.localeCompare(b.earnerType) || a.earnerId.localeCompare(b.earnerId));
  const ids = Array.from(new Set(owedRows.map((r) => r.earnerId)));
  const names = new Map<string, string | null>();
  if (ids.length) {
    const rows = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, ids));
    for (const r of rows) names.set(r.id, [r.firstName, r.lastName].filter(Boolean).join(" ") || null);
  }
  const out: OwedEarnerRow[] = [];
  for (const row of owedRows) {
    const [account, pendingPayouts] = await Promise.all([
      storage.getUserStripeAccount(row.earnerId),
      pendingPayoutsFor(row.earnerType, row.earnerId),
    ]);
    out.push({
      ...row,
      displayName: names.get(row.earnerId) ?? null,
      canReceiveTransfer: canReceiveTransfer(account),
      pendingPayoutCount: pendingPayouts.count,
      pendingPayoutTotal: pendingPayouts.total,
    });
  }
  return out;
}

export type MarkPaidResult =
  | { ok: true; payout: Record<string, unknown>; beforeStatus: string; auditWarning?: string }
  | { ok: false; status: number; message: string };

const MARK_PAID_STATE_MESSAGE = "A payout can be marked paid only when it is pending or approved.";
const MARK_PAID_AMOUNT_MESSAGE = "Payout amount exceeds the amount owed.";

export async function markPayoutPaidExternally(input: {
  payoutId: string;
  requesterType: EarnerType;
  method?: string | null;
  notes?: string | null;
  actorId: string;
  actorRole: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<MarkPaidResult> {
  const payout = input.requesterType === "expert"
    ? (await db.select().from(expertPayouts).where(eq(expertPayouts.id, input.payoutId)).limit(1))[0]
    : (await db.select().from(providerPayouts).where(eq(providerPayouts.id, input.payoutId)).limit(1))[0];
  if (!payout) return { ok: false, status: 404, message: "Payout not found" };

  const beforeStatus = payout.status ?? "";
  if (beforeStatus !== "pending" && beforeStatus !== "approved") {
    return { ok: false, status: 409, message: MARK_PAID_STATE_MESSAGE };
  }

  const earnerId = input.requesterType === "expert"
    ? (payout as { expertId: string }).expertId
    : (payout as { providerId: string }).providerId;
  const owed = await amountOwed(input.requesterType, earnerId);
  const payoutAmount = parseFloat(String(payout.amount ?? "0"));
  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    return { ok: false, status: 400, message: "Payout amount is not payable." };
  }
  if (payoutAmount - owed.owed > 0.01) {
    return { ok: false, status: 409, message: MARK_PAID_AMOUNT_MESSAGE };
  }

  const method = externalPayoutMethod(input.method);
  const applied = { current: false };
  const options: PayoutStatusUpdateOptions = {
    payoutMethod: method,
    onlyFrom: EXTERNAL_MARK_PAID_FROM,
    applied,
  };
  const updated = input.requesterType === "expert"
    ? await storage.updateExpertPayoutStatus(input.payoutId, "completed", undefined, undefined, options)
    : await storage.updateProviderPayoutStatus(input.payoutId, "completed", undefined, undefined, options);
  if (!applied.current || updated?.status !== "completed" || updated.payoutMethod === "stripe" || updated.payoutMethod !== method) {
    return { ok: false, status: 409, message: MARK_PAID_STATE_MESSAGE };
  }

  const auditWarning = await recordAdminDecisionAudit({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: PAYOUT_MARK_PAID_ACTION,
    resourceType: "payout",
    resourceId: input.payoutId,
    targetUserId: earnerId,
    beforeStatus,
    afterStatus: "completed",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: {
      requesterType: input.requesterType,
      payoutMethod: updated.payoutMethod,
      amount: payout.amount,
      emailSent: false,
      ...(input.notes ? { notes: input.notes } : {}),
    },
  });
  return {
    ok: true,
    payout: updated as unknown as Record<string, unknown>,
    beforeStatus,
    ...(auditWarning ? { auditWarning } : {}),
  };
}

/** The pending/approved set the updater guard and this rail both use. */
export const markPaidFromStatuses = EXTERNAL_MARK_PAID_FROM;
