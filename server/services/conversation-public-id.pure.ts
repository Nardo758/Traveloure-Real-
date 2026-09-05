/**
 * conversation-public-id.pure.ts — the client-visible conversation identifier.
 *
 * Ledger `2026-09-05-user-id-is-internal`, CLAUDE.md Locked Decision 40.
 *
 * THE DEFECT THIS CLOSES. `buildConversationId(a, b)` is the two user ids sorted and joined with
 * `_`. That string is returned to clients on every message and every conversation summary — so the
 * THREAD KEY ITSELF is a copy of the counterpart's `users.id`. No projection over a participant
 * object would ever have caught it: strip `otherUserId` from every payload and the id is still
 * sitting in `conversationId`.
 *
 * THE SHAPE. The public id is a keyed HMAC-SHA256 over the internal id, truncated to 32 hex
 * characters. It is deliberately NOT reversible and there is no `fromPublicConversationId` — the
 * resolver re-computes the projection over the SESSION USER'S OWN conversation list and matches, so
 * a public id can only ever be resolved by one of the two people in the thread. A non-participant
 * holding a valid-looking id resolves nothing, because their own list contains no internal id that
 * maps to it.
 *
 * THE KEY. `SESSION_SECRET` — the secret the session cookie and the concierge claim-token HMAC
 * (`server/routes/concierge.routes.ts`) already use. NO NEW REQUIRED ENV VAR. When it is unset the
 * fallback is a PROCESS-LIFETIME RANDOM key, never a fixed literal: an unconfigured environment
 * then produces ids that stop resolving after a restart, which is a liveness cost, instead of ids
 * anybody can compute, which is the security cost. That is the fail-closed direction.
 *
 * WHY 32 HEX CHARS. 128 bits of the digest — far past collision relevance for a per-user list that
 * is bounded by how many people someone has messaged, while staying short enough to sit in a URL.
 * The resolver compares against the caller's own list, so a collision could at worst match two of
 * the caller's own threads; it never crosses an account boundary.
 *
 * NEGATIVE SPACE: this module is a NAME projection and nothing else. It carries no authorization —
 * holding a public id proves nothing on its own, which is exactly why `resolvePublicConversationId`
 * (in messages.service.ts, where the DB lives) does the participant walk rather than trusting the
 * id's shape. It also says nothing about whether the underlying thread still exists.
 */
import { createHmac, randomBytes } from "node:crypto";

/** Length in hex characters of a public conversation id. */
export const PUBLIC_CONVERSATION_ID_LENGTH = 32;

const PUBLIC_CONVERSATION_ID_RE = /^[0-9a-f]{32}$/;

/** HMAC domain separator, so this key never produces the same digest as another use of the secret. */
const HMAC_DOMAIN = "conversation-public-id:v1";

let fallbackKey: string | null = null;
let warned = false;

/**
 * The HMAC key. `SESSION_SECRET` when set; otherwise a process-lifetime random key, generated once
 * and warned about once. Never a fixed literal — a shared default secret would make every public id
 * computable by anyone who read this file.
 */
export function conversationIdKey(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (!fallbackKey) {
    fallbackKey = randomBytes(32).toString("hex");
    if (!warned) {
      warned = true;
      console.warn(
        "[conversation-id] SESSION_SECRET is unset — public conversation ids are keyed with a " +
          "process-lifetime random secret and will stop resolving after a restart.",
      );
    }
  }
  return fallbackKey;
}

/** True iff `value` has the public-id SHAPE. Proves nothing about whether it resolves. */
export function isPublicConversationIdShape(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_CONVERSATION_ID_RE.test(value);
}

/**
 * Project an INTERNAL conversation id (the `buildConversationId` pair string) to the client-visible
 * one. `secret` is injectable so this stays a pure function under test.
 */
export function toPublicConversationId(internalId: string, secret: string = conversationIdKey()): string {
  return createHmac("sha256", secret)
    .update(`${HMAC_DOMAIN}:${internalId}`)
    .digest("hex")
    .slice(0, PUBLIC_CONVERSATION_ID_LENGTH);
}

/**
 * Find which of `internalIds` — the CALLER'S OWN conversations — projects to `publicId`.
 * Returns null when none does, which is the same answer for "no such thread", "not yours" and
 * "malformed id" (§13 posture: the rail must not distinguish them, or it becomes a probe).
 */
export function matchPublicConversationId(
  publicId: unknown,
  internalIds: readonly string[],
  secret: string = conversationIdKey(),
): string | null {
  if (!isPublicConversationIdShape(publicId)) return null;
  for (const internalId of internalIds) {
    if (toPublicConversationId(internalId, secret) === publicId) return internalId;
  }
  return null;
}
