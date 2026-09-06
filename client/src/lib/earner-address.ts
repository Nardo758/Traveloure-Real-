/**
 * earner-address.ts — how a CLIENT addresses an earner.
 *
 * CLAUDE.md Locked Decision 40 (ledger `2026-09-05-user-id-is-internal`), LANE 3.
 *
 * `users.id` is INTERNAL. Lane 1 added the server rails: a conversation is opened by naming WHAT
 * it is about — a storefront `handle`, a public `serviceId`, a `bookingId` the caller is on, or
 * (D22) a `tripId` whose plan they share with an advisor — and the server resolves the counterpart
 * and answers with an OPAQUE conversation id and a recipient card that carries no user id at all. This module is the client half: ONE place that
 * decides which address a surface holds, and ONE place that calls the rail (§18 rule 1). A second
 * copy of either decision is how a surface ends up quietly posting a user id again.
 *
 * NEGATIVE SPACE, stated so the guard-registry habit holds for a client module too:
 *  - this decides SHAPE only. Whether the handle exists, whether the listing is approved, whether
 *    the caller is on the booking — all of that is answered server-side by
 *    `server/services/contact-rails.service.ts`, and none of it can be answered here.
 *  - it says nothing about WebSocket delivery, blocking, reporting or read receipts. Those rails
 *    are still addressed by user id and are annotated at their call sites for lane 2.
 *
 * EXACTLY ONE ADDRESS, and ambiguity is refused rather than ranked. The server refuses a body
 * carrying two addresses because a caller who sends both has not said which conversation they
 * mean (§13); picking one here would hide that from the server that refuses it, so the client
 * refuses it first and identically.
 */
// §18 rule 1: the handle's normalization is stated ONCE, in `shared/handle.ts`, and every rail
// that compares or builds a handle reads it from there — the storefront routes, the contact start
// rail and this module. A second `toLowerCase()` here would be the drift that rule names.
import { normalizeHandle } from "@shared/handle";

/**
 * The address kinds, and they are the whole set (Locked Decision 40, amended by its D22 addendum,
 * ledger `2026-09-05-slip-decisions-d18-d22`).
 */
export type ContactAddress =
  | { handle: string }
  | { serviceId: string }
  | { bookingId: string }
  | { tripId: string };

/** What a calling surface holds. Every field optional; exactly one must be non-empty. */
export interface ContactAddressInput {
  /** A claimed storefront handle (`users.handle`) — "I am writing because of their storefront". */
  handle?: string | null;
  /** A public, approved `provider_services` listing — resolves server-side to its owner. */
  serviceId?: string | null;
  /** A booking the caller is already on — resolves server-side to the OTHER party. */
  bookingId?: string | null;
  /**
   * D22 — a PLAN the caller is on, which resolves server-side to the OTHER person on it (owner ⇒
   * the plan's advisor, advisor ⇒ the owner). It names a PLAN and never a person, which is why it
   * is an address and not the `receiverId` this whole module exists to refuse: the counterpart of
   * this one kind depends on who is asking, so only the server can resolve it.
   */
  tripId?: string | null;
}

export type ContactAddressResult =
  | { ok: true; address: ContactAddress }
  | { ok: false; reason: "none" | "ambiguous" };

function present(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Pure: turn what a surface holds into the ONE address the start rail accepts.
 *
 * Returns a refusal rather than a guess. `none` is the honest answer for a surface that holds no
 * address at all (an expert row with no claimed handle, for example) — the caller then keeps its
 * own legacy behaviour rather than inventing an address; `ambiguous` mirrors the server's refusal.
 *
 * A user id is not an address here and has no field to arrive in — which is the point.
 */
export function resolveContactAddress(input: ContactAddressInput): ContactAddressResult {
  const handle = present(input.handle);
  const serviceId = present(input.serviceId);
  const bookingId = present(input.bookingId);
  const tripId = present(input.tripId);
  const given = [handle, serviceId, bookingId, tripId].filter((v) => v !== null);

  if (given.length === 0) return { ok: false, reason: "none" };
  if (given.length > 1) return { ok: false, reason: "ambiguous" };

  if (handle) return { ok: true, address: { handle: normalizeHandle(handle.replace(/^@/, "")) } };
  if (serviceId) return { ok: true, address: { serviceId } };
  if (bookingId) return { ok: true, address: { bookingId } };
  return { ok: true, address: { tripId: tripId! } };
}

/** The recipient card the start rail answers with. NO USER ID — the handle is the public name. */
export interface StartedConversationRecipient {
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  verified: boolean;
}

export interface StartedConversation {
  /** The OPAQUE conversation id (HMAC, 32 hex). Carries no user ids; this is the send address. */
  conversationId: string;
  recipient: StartedConversationRecipient;
}

/**
 * Call `POST /api/conversations/start` (lane 1's rail) with one address.
 *
 * `about` is deliberately NOT sent. The server would deliver it as the thread's FIRST MESSAGE, and
 * every caller here is a "Message"/"Contact" button, which has always opened a composer rather
 * than sending something the traveler never typed. The subject still reaches the chat page as the
 * existing `?about=` prefill param — the composer text, not a sent message.
 */
export async function startConversation(address: ContactAddress): Promise<StartedConversation | null> {
  try {
    const res = await fetch("/api/conversations/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(address),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const conversationId = typeof data?.conversationId === "string" ? data.conversationId : null;
    if (!conversationId) return null;
    return {
      conversationId,
      recipient: {
        handle: typeof data?.recipient?.handle === "string" ? data.recipient.handle : null,
        displayName: typeof data?.recipient?.displayName === "string" ? data.recipient.displayName : "",
        avatarUrl: typeof data?.recipient?.avatarUrl === "string" ? data.recipient.avatarUrl : null,
        verified: data?.recipient?.verified === true,
      },
    };
  } catch {
    return null;
  }
}

/**
 * The chat URL for an opaque conversation id. `name`/`avatar` are the display fallback the page
 * already accepts: a conversation started with no message yet has no row in the thread list, so
 * without them the header would have nothing true to render (§13 — it must not invent a name).
 */
export function conversationChatPath(
  conversationId: string,
  opts: { about?: string | null; name?: string | null; avatar?: string | null } = {},
): string {
  const q = new URLSearchParams({ conversation: conversationId });
  if (opts.about) q.set("about", opts.about);
  if (opts.name) q.set("name", opts.name);
  if (opts.avatar) q.set("avatar", opts.avatar);
  return `/chat?${q.toString()}`;
}

/**
 * The public profile path for an earner row.
 *
 * `/s/:handle` IS the canonical public page for a handled earner — `/experts/:id` already
 * redirects there (`expert-detail.tsx`'s S2 redirect), so linking by handle is today's
 * destination with the internal id taken out of the address bar rather than a new page.
 *
 * FALLBACK, and it is honest about what it is: an earner who has claimed no handle has no
 * handle-keyed page, so the id route is still the only way to reach them. Lane 2 removes the id
 * route and the id from the public projection; this fallback is the list of rows that will need a
 * handle by then.
 */
export function earnerProfilePath(row: { handle?: string | null; id?: string | number | null }): string | null {
  const handle = present(typeof row.handle === "string" ? row.handle : null);
  if (handle) return `/s/${normalizeHandle(handle.replace(/^@/, ""))}`;
  // LD 40 lane 2: still id-addressed — no claimed handle, so no handle-keyed page exists.
  const id = row.id == null ? null : String(row.id).trim();
  return id ? `/experts/${id}` : null;
}

/**
 * Which thread a `/chat` URL names.
 *
 * CANONICAL: `?conversation=<opaque id>` (Locked Decision 40, lane 3).
 * LEGACY, kept for one release: `?expertId=<users.id>` and its `?provider=` alias — links already
 * out in the world (a bookmark, a shared URL, a chat history). Removed after LD 40 lane 2.
 *
 * PRECEDENCE, stated rather than guessed: the opaque id wins when both are present, because the
 * only way a URL carries both is a legacy link that a newer caller has upgraded in place. This is
 * a deterministic upgrade rule, not a tie-break between two equal claims.
 */
export type ChatUrlTarget =
  | { kind: "conversation"; conversationId: string }
  | { kind: "expert"; expertId: string }
  | null;

export function resolveChatUrlTarget(search: string): ChatUrlTarget {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const conversationId = present(params.get("conversation"));
  if (conversationId) return { kind: "conversation", conversationId };
  // LD 40 lane 2: still id-addressed — legacy links only.
  const expertId = present(params.get("expertId")) ?? present(params.get("provider"));
  if (expertId) return { kind: "expert", expertId };
  return null;
}
