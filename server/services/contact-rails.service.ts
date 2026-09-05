/**
 * contact-rails.service.ts — resolving WHO a message is for, server-side.
 *
 * Ledger `2026-09-05-user-id-is-internal`, CLAUDE.md Locked Decision 40.
 *
 * `users.id` is INTERNAL. A conversation is opened by naming WHAT it is about — a storefront
 * handle, a public service, or a booking the caller is already on — and this module turns that
 * address into a recipient. It is §14's identity rule applied to the OTHER end of the message: the
 * ACTOR already comes from the session and never from `req.body`, and after this ruling neither
 * does the RECIPIENT.
 *
 * EVERY REFUSAL IS THE SAME REFUSAL. `resolveContactTarget` answers `{ ok: false, reason }` where
 * the only externally visible reasons are "not_found" and "self". A service that does not exist, a
 * service that exists but is not approved, a booking that does not exist, and a booking that is
 * somebody else's are ALL `not_found` — so the rail cannot be used to enumerate which ids are real
 * (§13 posture; the custom-venues precedent, ledger `2026-09-05-custom-venues-owner-scope`).
 *
 * THE DECISIONS WORTH PROVING LIVE IN `contact-rails.pure.ts` — who counts as a party to a booking,
 * and what a context row is called on screen — so they keep their proof where `DATABASE_URL` is
 * unset (the `trip-destinations.pure.ts` precedent). This file is the queries around them.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversationContexts,
  insertConversationContextSchema,
  providerServices,
  serviceBookings,
  userAndExpertChats,
  users,
  type ConversationContextKind,
} from "@shared/schema";
import { normalizeHandle } from "@shared/handle";
import { isEarnerRole } from "@shared/roles";
import { addressKindOf, type ContactStartBody } from "@shared/contact-address";
import { getDisplayName } from "../utils/data-sanitizer";
import { isOwnerIdentityVerified } from "../utils/earner-verification";
import {
  contextLabel,
  resolveBookingCounterpart,
  type ConversationContextView,
} from "./contact-rails.pure";

export type ContactRefusal = "not_found" | "self";

export interface ContactTarget {
  recipientId: string;
  context: { kind: ConversationContextKind; id: string };
}

export type ContactTargetResult =
  | { ok: true; target: ContactTarget }
  | { ok: false; reason: ContactRefusal };

/**
 * The recipient card the start rail returns. NO USER ID: the public identity of an earner is the
 * handle (Locked Decision 40). `handle` is nullable because a traveler — the counterpart of a
 * booking thread opened by an earner — has no storefront and no handle to show, and inventing one
 * would be a §13 lie; the client renders the display name in that case.
 */
export interface PublicRecipientCard {
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  verified: boolean;
}

/**
 * Turn a validated address into a recipient. The body has already been proven by
 * `contactStartBodySchema` to carry EXACTLY ONE address kind (§19 allowlist, `.strict()`).
 */
export async function resolveContactTarget(
  sessionUserId: string,
  body: ContactStartBody,
): Promise<ContactTargetResult> {
  const kind = addressKindOf(body);

  if (kind === "handle") {
    const normalized = normalizeHandle(body.handle!);
    // The SAME predicate the public storefront read uses: a handle owned by a live, non-suspended
    // account whose role can earn. A deleted or suspended earner is `not_found`, identical to a
    // handle nobody has claimed — being suspended is not something the rail discloses.
    const [owner] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(eq(users.handle, normalized), eq(users.isDeleted, false), eq(users.isSuspended, false)))
      .limit(1);
    if (!owner || !isEarnerRole(owner.role)) return { ok: false, reason: "not_found" };
    if (owner.id === sessionUserId) return { ok: false, reason: "self" };
    return { ok: true, target: { recipientId: owner.id, context: { kind: "storefront", id: normalized } } };
  }

  if (kind === "serviceId") {
    // PUBLIC listings only — `approval_status = 'approved'` is the same read gate every public
    // provider_services surface applies (F2, migration 111). An unapproved or draft listing is
    // `not_found`, so this rail cannot be used to discover that a listing exists before its owner
    // has published it.
    const [service] = await db
      .select({ id: providerServices.id, ownerId: providerServices.userId })
      .from(providerServices)
      .where(and(eq(providerServices.id, body.serviceId!), eq(providerServices.approvalStatus, "approved")))
      .limit(1);
    if (!service) return { ok: false, reason: "not_found" };
    if (service.ownerId === sessionUserId) return { ok: false, reason: "self" };
    return { ok: true, target: { recipientId: service.ownerId, context: { kind: "service", id: service.id } } };
  }

  // bookingId — the caller must already be a party to it. The ownership rule itself is
  // `resolveBookingCounterpart` (pure, proven without a DB).
  const [booking] = await db
    .select({
      id: serviceBookings.id,
      travelerId: serviceBookings.travelerId,
      providerId: serviceBookings.providerId,
      serviceOwnerId: providerServices.userId,
    })
    .from(serviceBookings)
    .leftJoin(providerServices, eq(providerServices.id, serviceBookings.serviceId))
    .where(eq(serviceBookings.id, body.bookingId!))
    .limit(1);
  if (!booking) return { ok: false, reason: "not_found" };
  const counterpart = resolveBookingCounterpart(booking, sessionUserId);
  // Not a party ⇒ the same answer as "no such booking" (§13).
  if (!counterpart) return { ok: false, reason: "not_found" };
  if (counterpart === sessionUserId) return { ok: false, reason: "self" };
  return { ok: true, target: { recipientId: counterpart, context: { kind: "booking", id: booking.id } } };
}

/** The recipient as the client is allowed to see them — handle, not id. */
export async function loadPublicRecipientCard(userId: string): Promise<PublicRecipientCard | null> {
  const [row] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
      handle: users.handle,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    handle: row.handle ?? null,
    displayName: getDisplayName(row.firstName, row.lastName),
    avatarUrl: row.profileImageUrl ?? null,
    verified: await isOwnerIdentityVerified(userId),
  };
}

/**
 * Record WHAT a conversation is about. Idempotent by construction: the UNIQUE
 * (conversation_id, context_kind, context_id) plus `ON CONFLICT DO NOTHING` makes a repeat write a
 * no-op, so this needs no check-then-insert (§15 — the statement is the guard).
 *
 * Failure here NEVER fails the message it annotates (§15b's "an ancillary effect may not break the
 * operation that authorizes it"): the thread is the product, the context row is bookkeeping.
 */
export async function recordConversationContext(
  internalConversationId: string,
  context: { kind: ConversationContextKind; id: string },
  createdBy: string,
): Promise<void> {
  try {
    // Parsed through the pick-based allowlist even though the values are all server-authored: the
    // schema is the ONE statement of what this table accepts (§19), and routing the internal
    // writer through it is what keeps that statement true.
    const values = insertConversationContextSchema.parse({
      conversationId: internalConversationId,
      contextKind: context.kind,
      contextId: context.id,
      createdBy,
    });
    await db.insert(conversationContexts).values(values).onConflictDoNothing();
  } catch (err: any) {
    console.warn("[contact-rails] conversation context insert failed (non-fatal):", err?.message ?? err);
  }
}

/**
 * Contexts for a batch of INTERNAL conversation ids, labelled server-side.
 *
 * §13: a conversation with no rows here is an OLDER thread — it comes back with an EMPTY array and
 * the client renders no context, never a guessed `storefront`. There is no backfill and there will
 * not be one.
 */
export async function listConversationContexts(
  internalConversationIds: readonly string[],
): Promise<Map<string, ConversationContextView[]>> {
  const out = new Map<string, ConversationContextView[]>();
  if (internalConversationIds.length === 0) return out;
  try {
    return await loadConversationContexts(internalConversationIds, out);
  } catch (err: any) {
    // Context is BOOKKEEPING; the thread list is the product. A failure here degrades to "no
    // recorded context", which is exactly what an older thread already renders (§13) — it must
    // never take the inbox down with it (§15b: an ancillary effect may not break the operation
    // that authorizes it).
    console.warn("[contact-rails] conversation context read failed (non-fatal):", err?.message ?? err);
    return out;
  }
}

async function loadConversationContexts(
  internalConversationIds: readonly string[],
  out: Map<string, ConversationContextView[]>,
): Promise<Map<string, ConversationContextView[]>> {
  const rows = await db
    .select({
      conversationId: conversationContexts.conversationId,
      contextKind: conversationContexts.contextKind,
      contextId: conversationContexts.contextId,
    })
    .from(conversationContexts)
    .where(inArray(conversationContexts.conversationId, [...internalConversationIds]));
  if (rows.length === 0) return out;

  // Resolve the names the labels need, in ONE query per kind. A name that does not resolve stays
  // undefined and `contextLabel` says what KIND of thing the thread is about instead of inventing a
  // title for a row that is gone (§13).
  const serviceIds = rows.filter((r) => r.contextKind === "service").map((r) => r.contextId);
  const bookingIds = rows.filter((r) => r.contextKind === "booking").map((r) => r.contextId);

  const serviceNames = new Map<string, string>();
  if (serviceIds.length > 0) {
    const svc = await db
      .select({ id: providerServices.id, name: providerServices.serviceName })
      .from(providerServices)
      .where(inArray(providerServices.id, serviceIds));
    for (const s of svc) serviceNames.set(s.id, s.name);
  }

  const bookingRefs = new Map<string, string>();
  if (bookingIds.length > 0) {
    const bks = await db
      .select({ id: serviceBookings.id, trackingNumber: serviceBookings.trackingNumber })
      .from(serviceBookings)
      .where(inArray(serviceBookings.id, bookingIds));
    for (const b of bks) if (b.trackingNumber) bookingRefs.set(b.id, b.trackingNumber);
  }

  for (const row of rows) {
    const kind = row.contextKind as ConversationContextKind;
    const name =
      kind === "service"
        ? serviceNames.get(row.contextId)
        : kind === "booking"
          ? bookingRefs.get(row.contextId)
          : row.contextId; // a storefront context IS the handle
    const list = out.get(row.conversationId) ?? [];
    list.push({ kind, id: row.contextId, label: contextLabel(kind, row.contextId, name ?? null) });
    out.set(row.conversationId, list);
  }
  return out;
}

/** One row of the admin context view. Participants by display name + handle; NO message bodies. */
export interface AdminConversationRow {
  conversationId: string;
  contextKind: ConversationContextKind;
  contextId: string;
  createdAt: Date | null;
  participants: { displayName: string; handle: string | null }[];
  messageCount: number;
}

/**
 * Conversations recorded against one context (a booking, a service, a storefront handle).
 *
 * READ-ONLY, and deliberately WITHOUT message bodies: reading what two people actually said to each
 * other is a separate decision nobody has made, and shipping it as a side effect of a context index
 * would be exactly that. Participants are resolved through `parseConversationId` on the INTERNAL id
 * — this is an admin surface under §2's blanket guard, which is the one place a user id legitimately
 * resolves to a person.
 */
export async function listAdminConversationsForContext(
  contextKind: ConversationContextKind,
  contextId: string,
  limit = 50,
): Promise<AdminConversationRow[]> {
  const rows = await db
    .select({
      conversationId: conversationContexts.conversationId,
      contextKind: conversationContexts.contextKind,
      contextId: conversationContexts.contextId,
      createdAt: conversationContexts.createdAt,
    })
    .from(conversationContexts)
    .where(
      and(eq(conversationContexts.contextKind, contextKind), eq(conversationContexts.contextId, contextId)),
    )
    .limit(limit);
  if (rows.length === 0) return [];

  // The internal pair id is `<userIdA>_<userIdB>` sorted — split it back to the two participants.
  const participantIds = new Set<string>();
  const pairs = new Map<string, string[]>();
  for (const row of rows) {
    const parts = splitInternalConversationId(row.conversationId);
    pairs.set(row.conversationId, parts);
    for (const p of parts) if (p) participantIds.add(p);
  }

  const people = new Map<string, { displayName: string; handle: string | null }>();
  if (participantIds.size > 0) {
    const found = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, handle: users.handle })
      .from(users)
      .where(inArray(users.id, Array.from(participantIds)));
    for (const u of found) {
      people.set(u.id, { displayName: getDisplayName(u.firstName, u.lastName), handle: u.handle ?? null });
    }
  }

  const counts = new Map<string, number>();
  for (const [conversationId, parts] of Array.from(pairs.entries())) {
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      counts.set(conversationId, 0);
      continue;
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userAndExpertChats)
      .where(
        sql`(${userAndExpertChats.senderId} = ${parts[0]} AND ${userAndExpertChats.receiverId} = ${parts[1]})
            OR (${userAndExpertChats.senderId} = ${parts[1]} AND ${userAndExpertChats.receiverId} = ${parts[0]})`,
      );
    counts.set(conversationId, count ?? 0);
  }

  return rows.map((row) => ({
    conversationId: row.conversationId,
    contextKind: row.contextKind as ConversationContextKind,
    contextId: row.contextId,
    createdAt: row.createdAt ?? null,
    // A participant the platform can no longer resolve (a deleted account) is OMITTED rather than
    // rendered as "Unknown" — §13: the row says who it could name, not who it guessed.
    participants: (pairs.get(row.conversationId) ?? [])
      .map((id) => people.get(id))
      .filter((p): p is { displayName: string; handle: string | null } => !!p),
    messageCount: counts.get(row.conversationId) ?? 0,
  }));
}

/**
 * Split a `buildConversationId` pair string back into its two user ids.
 *
 * Deliberately NOT `parseConversationId` from messages.service.ts: that helper splits on the FIRST
 * `_`, which is correct for its callers' id shapes but wrong for any id whose first half contains
 * one. Here the halves are compared against real `users.id` rows anyway — an unresolvable half is
 * simply omitted — so a split that produces a wrong pair produces an empty participant list rather
 * than a wrong name.
 */
function splitInternalConversationId(conversationId: string): string[] {
  const sep = conversationId.indexOf("_");
  if (sep === -1) return [conversationId];
  return [conversationId.slice(0, sep), conversationId.slice(sep + 1)];
}
