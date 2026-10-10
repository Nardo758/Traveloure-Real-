/**
 * Part 6: read-only eligibility and isolated dispatcher proof.
 * UNKNOWN payment coverage and production transport remain blocked.
 */
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox } from "@shared/schema";
import { readCurrentCartActivity } from "./cart-email-state.service";
import { normalizeCartChangeValues } from "./cart-item-change.service";
import { buildCartItemChangeEmail } from "./cart-item-change-email";
import {
  cartReminderNow, cartReminderVerification, cartReminderVerificationEnabled,
  readTravelerCommerceActivity, assessCartReminder,
} from "./cart-reminder.service";
import {
  lockMarketingTraveler, marketingDayReserved, marketingWindow, nextCartMarketingWindow,
  reserveMarketingDay, type MarketingTx,
} from "./marketing-delivery-policy.service";
import { marketingPreferences } from "./itinerary-followup-email";
import { buildCartReminderEmail, isCartReminder } from "./cart-reminder-email";
import {
  atEmailProviderHandoff, EmailSendCancelled, type SendEmailParams, type SendEmailResult,
} from "./email.service";

type Reader = Pick<typeof db, "execute">;
export interface CommerceIdentity {
  travelerId: string; scope: string | null; sequenceId: string;
  recipient: string; marketing: boolean;
}
export interface CartSendFacts {
  version: 1; digest: string; activityAtMs: number;
  items: { id: string; title: string; price: string; currency: string; quantity: number;
    availability: unknown; capturedAt: string | null }[];
}
export type SendDecision =
  | { eligible: false; reason: string; detail?: string }
  | { eligible: true; facts: CartSendFacts; paymentInstant?: string };

/** Never put recipient addresses or transport credentials in timing evidence. */
export const commerceSendVerification = {
  beforeFinalRead: null as null | (() => Promise<void>),
  afterFinalRead: null as null | (() => Promise<void>),
  timings: [] as { queryAndVerificationMs: number; postReadToInvokeMs: number;
    paymentInstant?: string; marketing: boolean }[],
};

/** JSONB changes object key order. Compare canonical facts, never serialized key order. */
function factsDigest(items: unknown): string | null {
  try {
    if (!Array.isArray(items)) return null;
    const tuples = items.map(item => {
      const normalized = normalizeCartChangeValues(item, item.quantity);
      if (!normalized || typeof item.id !== "string" || typeof item.title !== "string" ||
          !(item.capturedAt === null || typeof item.capturedAt === "string")) throw new Error("Invalid queued facts");
      const available = normalized.availability as any, slot = available.slot;
      return [item.id, item.title, normalized.price, normalized.currency, item.quantity,
        available.status, slot ? [slot.date, slot.start_time, slot.end_time,
          slot.capacity, slot.booked_count, slot.status] : null, item.capturedAt];
    });
    return createHash("sha256").update(JSON.stringify(tuples)).digest("hex");
  } catch { return null; }
}

/** Verify the target and the actual quoted payload, not just the whole-cart hash. */
function itemEnvelopeMatches(
  row: typeof emailOutbox.$inferSelect, metadata: Record<string, any>, facts: CartSendFacts,
): boolean {
  try {
    const target = facts.items.find(item => item.id === metadata.cartItemId);
    if (!target || !target.capturedAt || target.capturedAt !== metadata.capturedAt ||
        target.title !== metadata.cartChangeTitle || !Array.isArray(metadata.reasons) ||
        !metadata.reasons.length || metadata.reasons.some((reason: unknown) =>
          !["price_up", "price_down", "availability_loss"].includes(String(reason)))) return false;
    const current = normalizeCartChangeValues(metadata.cartNotifiedValues, target.quantity);
    const previous = normalizeCartChangeValues(metadata.cartPreviousValues, target.quantity);
    if (!current || !previous ||
        factsDigest([{ ...target, ...current }]) !== factsDigest([target])) return false;
    const message = buildCartItemChangeEmail({
      cartItemId: target.id, travelerId: metadata.travelerId, scope: metadata.cartScopeRaw,
      sequenceId: metadata.sequenceId, capturedAt: target.capturedAt, recipient: row.toEmail,
      title: target.title, key: metadata.commerceKey, previous, current, reasons: metadata.reasons,
    });
    return row.subject === message.subject && row.html === message.html && row.textBody === message.text;
  } catch { return false; }
}

/** One owned cart/catalog read; display-only schedule metadata is deliberately excluded. */
async function readFacts(reader: Reader, identity: CommerceIdentity, now: Date) {
  const rows = (await reader.execute(sql`SELECT c.id, c.quantity, c.content_meta,
    c.trip_id, c.itinerary_item_id, c.service_id, c.slot_id,
    p.service_name AS title, p.price::text, p.price_type, p.status,
    i.id AS matched_item, t.user_id AS trip_owner,
    (SELECT jsonb_build_object('date', s.date, 'start_time', s.start_time, 'end_time', s.end_time,
      'capacity', s.capacity, 'booked_count', s.booked_count, 'status', s.status)
      FROM vendor_availability_slots s WHERE s.id=c.slot_id AND s.service_id=p.id) AS slot
    FROM cart_items c LEFT JOIN provider_services p ON p.id=c.service_id
    LEFT JOIN itinerary_items i ON i.id=c.itinerary_item_id AND i.provider_service_id=p.id
    LEFT JOIN trips t ON t.id=c.trip_id AND t.id=i.trip_id
    WHERE c.user_id=${identity.travelerId} AND c.experience_slug IS NOT DISTINCT FROM ${identity.scope}
    ORDER BY c.id`)).rows;
  if (!rows.length) return { reason: "cart_empty" } as const;
  const clock = readCurrentCartActivity(rows.map(row => ({ contentMeta: row.content_meta })), now.getTime());
  if (!clock.eligible || clock.sequenceId !== identity.sequenceId) {
    return { reason: "superseded", detail: clock.eligible ? "sequence_replaced" : clock.reason } as const;
  }
  const items: CartSendFacts["items"] = [];
  for (const row of rows) {
    if (!row.matched_item || row.trip_owner !== identity.travelerId ||
        !row.service_id || !row.trip_id || !row.itinerary_item_id) {
      return { reason: "payment_correlation_ambiguous" } as const;
    }
    if (!Number.isSafeInteger(row.quantity) || Number(row.quantity) < 1 ||
        !["fixed", "hourly", "per_person", "per_event"].includes(String(row.price_type)) ||
        !/^\d{1,12}(?:\.\d{1,2})?$/.test(String(row.price)) ||
        !["active", "paused", "draft"].includes(String(row.status)) ||
        (row.slot_id && !row.slot)) {
      return { reason: "item_changed", detail: "catalog_state_unknown" } as const;
    }
    const normalized = normalizeCartChangeValues({ price: row.price, currency: "USD",
      availability: { status: row.status, slot: row.slot } }, Number(row.quantity));
    if (!normalized) return { reason: "item_changed", detail: "catalog_state_unknown" } as const;
    items.push({ id: String(row.id), title: String(row.title),
      price: normalized.price, currency: normalized.currency,
      quantity: Number(row.quantity), availability: normalized.availability,
      capturedAt: (row.content_meta as any)?._cart_automation?.snapshot?.captured_at ?? null });
  }
  return { facts: { version: 1, items, activityAtMs: clock.lastActivityMs,
    digest: factsDigest(items)! } as CartSendFacts,
    clock } as const;
}

/**
 * Shared pre-queue/send verifier. Facts originate from live server reads only.
 * No synthetic subset override exists outside a disposable NODE_ENV=test schema.
 */
export async function verifyCommerceSend(
  reader: Reader, identity: CommerceIdentity, expected?: CartSendFacts,
): Promise<SendDecision> {
  if (!cartReminderVerificationEnabled() ||
      (await reader.execute(sql`SELECT current_schema() AS name`)).rows[0].name !== process.env.MESSAGING_VERIFICATION_SCHEMA) {
    return { eligible: false, reason: "commerce_verification_disabled" };
  }
  const account = (await reader.execute(sql`SELECT email, is_deleted, is_suspended, preferences
    FROM users WHERE id=${identity.travelerId}`)).rows[0];
  if (!account || account.is_deleted || account.is_suspended) {
    return { eligible: false, reason: "account_gone", detail: account?.is_suspended ? "account_suspended" : "account_deleted" };
  }
  if (!account.email || account.email !== identity.recipient ||
      !/^[^@\s]+@traveloure-qa\.test$/i.test(String(account.email))) {
    return { eligible: false, reason: "no_email", detail: account.email ? "recipient_changed" : "missing_email" };
  }
  if (identity.marketing && (account.preferences as any)?.itineraryMarketing?.enabled !== true) {
    return { eligible: false, reason: "unsubscribed" };
  }
  const observed = await readFacts(reader, identity, await cartReminderNow(reader));
  if ("reason" in observed) return { eligible: false, reason: observed.reason ?? "item_changed", detail: observed.detail };
  if (expected && expected.activityAtMs !== observed.clock.lastActivityMs) {
    return { eligible: false, reason: "superseded", detail: "activity_replaced" };
  }
  if (expected && (expected.version !== 1 || expected.digest !== observed.facts.digest ||
      factsDigest(expected.items) !== observed.facts.digest)) {
    return { eligible: false, reason: "item_changed", detail: "queued_facts_changed" };
  }
  // LAST database read: no outbox reservation/write is performed after this check before handoff.
  const paid = await readTravelerCommerceActivity(reader, identity.travelerId,
    observed.clock.lastActivityMs, observed.clock.lastActivityMs);
  if (paid.activityRails.length) return { eligible: false, reason: "paid", detail: paid.activityRails.join(",") };
  const subset = process.env.NODE_ENV === "test" && cartReminderVerification.recordedRailsOnly;
  if (!(subset ? paid.recordedClear : paid.allowed)) {
    return { eligible: false, reason: paid.reason ?? "payment_rail_unknown", detail: paid.unknownRails.join(",") };
  }
  return { eligible: true, facts: observed.facts, paymentInstant: paid.eligibilityInstant };
}

export async function deliverVerifiedCommerce(
  outboxId: number, syntheticSender?: (params: SendEmailParams) => Promise<SendEmailResult>,
) {
  const [initial] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId)).limit(1);
  const meta = initial?.metadata as Record<string, any> | undefined;
  return db.transaction(async tx => {
    if (typeof meta?.travelerId === "string") await lockMarketingTraveler(tx, meta.travelerId);
    const [row] = await tx.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId)).limit(1).for("update");
    if (!row || row.status !== "processing") return "skipped";
    const metadata = row.metadata as Record<string, any> | null;
    const cancel = async (reason: string, detail?: string) => {
      await tx.update(emailOutbox).set({ status: "cancelled", lastError: reason, retryAfter: null,
        metadata: { ...metadata, cancelReason: reason, ...(detail ? { cancelDetail: detail } : {}) },
        updatedAt: new Date() }).where(eq(emailOutbox.id, outboxId));
      return "cancelled";
    };
    if (metadata?.cancelReason) return cancel(String(metadata.cancelReason), metadata.cancelDetail);
    if (metadata?.travelerId !== meta?.travelerId || metadata?.sequenceId !== meta?.sequenceId) {
      return cancel("superseded", "outbox_identity_changed");
    }
    const marketing = isCartReminder(row.emailType), item = row.emailType === "cart_item_changed";
    if (!metadata || !cartReminderVerificationEnabled() || (!marketing && !item) ||
        metadata[marketing ? "cartReminderVersion" : "cartItemChangeVersion"] !== 1 ||
        typeof metadata.travelerId !== "string" || typeof metadata.sequenceId !== "string" ||
        !(metadata.cartScopeRaw === null || typeof metadata.cartScopeRaw === "string")) {
      return cancel("unsupported_or_unreleased_commerce_email");
    }
    if (row.sentAt) return cancel("step_already_sent");
    const identity: CommerceIdentity = { travelerId: metadata.travelerId, sequenceId: metadata.sequenceId,
      scope: metadata.cartScopeRaw, recipient: row.toEmail, marketing };
    if (!metadata.cartSendFacts) return cancel("item_changed", "missing_queued_facts");
    const first = await verifyCommerceSend(tx, identity, metadata.cartSendFacts);
    if (!first.eligible) return cancel(first.reason, first.detail);
    if (item && !itemEnvelopeMatches(row, metadata, first.facts)) {
      return cancel("item_changed", "quoted_item_payload_mismatch");
    }
    const now = await cartReminderNow(tx);
    if (marketing) {
      const step = await assessCartReminder(tx as MarketingTx, identity.travelerId, identity.scope, now,
        { kind: row.emailType, sequenceId: identity.sequenceId });
      if (!step.eligible && step.reason !== "outside_marketing_window") return cancel(step.reason);
      const account = (await tx.execute(sql`SELECT preferences FROM users WHERE id=${identity.travelerId}`)).rows[0];
      const preferences = marketingPreferences(account.preferences)!;
      const local = marketingWindow(now, preferences);
      const capped = await marketingDayReserved(tx, identity.travelerId, local.day, outboxId);
      if (!step.eligible || capped || !syntheticSender || process.env.NODE_ENV !== "test") {
        await tx.update(emailOutbox).set({ status: "pending",
          lastError: capped ? "daily_marketing_cap" : !step.eligible ? step.reason : "verification_queue_only",
          retryAfter: nextCartMarketingWindow(now, preferences, capped ? local.day : undefined),
          updatedAt: new Date() }).where(eq(emailOutbox.id, outboxId));
        return "deferred";
      }
      await tx.update(emailOutbox).set({ metadata: reserveMarketingDay(metadata, local.day) })
        .where(eq(emailOutbox.id, outboxId));
    } else {
      // The approved residual payment race applies ONLY to marketing.
      await tx.update(emailOutbox).set({ status: "pending", lastError: "must_have_payment_ordering_unknown",
        retryAfter: new Date(now.getTime() + 15 * 60_000), updatedAt: new Date() })
        .where(eq(emailOutbox.id, outboxId));
      return "deferred";
    }
    let result: SendEmailResult;
    const isolatedTest = process.env.NODE_ENV === "test" && cartReminderVerificationEnabled();
    // Build payload BEFORE the last check; do not widen the gap with rendering.
    const payload: SendEmailParams = { to: row.toEmail, ...buildCartReminderEmail(),
      idempotencyKey: `cart-reminder-${outboxId}` };
    let begin = 0, returned = 0, paymentInstant: string | undefined;
    try {
      result = await atEmailProviderHandoff(async () => {
        if (isolatedTest) await commerceSendVerification.beforeFinalRead?.();
        begin = performance.now();
        const final = await verifyCommerceSend(tx, identity, metadata.cartSendFacts);
        returned = performance.now();
        if (!final.eligible) return { eligible: false, reason: final.reason, detail: final.detail };
        paymentInstant = final.paymentInstant;
        if (isolatedTest) await commerceSendVerification.afterFinalRead?.();
        return { eligible: true };
      }, () => {
        const invoked = performance.now();
        if (isolatedTest) commerceSendVerification.timings.push({
          queryAndVerificationMs: invoked - begin, postReadToInvokeMs: invoked - returned,
          paymentInstant, marketing,
        });
        return syntheticSender!(payload);
      });
    } catch (error) {
      if (error instanceof EmailSendCancelled) return cancel(error.reason, error.detail);
      result = { ok: false, error: "Commerce verification or synthetic provider failed" };
    }
    const attempts = row.attemptCount + 1, dead = attempts >= row.maxAttempts;
    await tx.update(emailOutbox).set({ status: result.ok ? "sent" : dead ? "dead" : "failed",
      attemptCount: attempts, resendId: result.id ?? null, sentAt: result.ok ? now : null,
      lastError: result.ok ? null : "Commerce verification or synthetic provider failed",
      retryAfter: result.ok || dead ? null : new Date(now.getTime() + 5 * 60_000), updatedAt: new Date(),
    }).where(eq(emailOutbox.id, outboxId));
    return result.ok ? "sent" : "failed";
  });
}
