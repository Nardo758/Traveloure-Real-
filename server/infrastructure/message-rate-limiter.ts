/**
 * Messaging-specific rate limiting.
 *
 * The generic IP-based limiters in ./rate-limiter.ts cannot express the rules that
 * matter for user-to-user messaging abuse, because they key on req.ip and run as
 * Express middleware. Messaging needs limits keyed on the authenticated SENDER's
 * user id and the RECIPIENT's user id, and one write path (the /ws "chat" handler)
 * has no Express middleware at all. So this is a small self-contained fixed-window
 * counter that every message write path calls directly:
 *   - POST /api/messages
 *   - POST /api/chats            (both the canonical and the shadowed handler)
 *   - POST /api/chat/start
 *   - the /ws "chat" socket handler
 *
 * Three limits, checked strictest-first:
 *   1. Cold-contact  — starting NEW conversations (no prior message between the pair).
 *      Spam risk is highest here (mass-spraying strangers), so it gets its own tight
 *      guard, deliberately lighter than ordinary sending: COLD_CONTACT_MAX new
 *      conversations per COLD_CONTACT_WINDOW.
 *   2. Per-recipient — messages from one sender to the SAME recipient per minute.
 *      Stops flooding/harassing a single targeted person.
 *   3. Per-sender    — total messages one account sends per minute across everyone.
 *      Backstop against scripted blasting.
 *
 * Defaults (see rationale on each constant) are tuned so a lively human back-and-forth
 * is never throttled while scripted floods are.
 *
 * Storage is in-memory (per process), matching the existing limiter. That is adequate
 * for single-instance abuse throttling; a multi-instance deployment would want a shared
 * store (e.g. Redis) — noted for future scaling, not required today.
 */
import { logger } from "./logger";

// Per-sender: an engaged human rarely sends more than ~10-15 messages a minute even
// across several open threads; 30/min leaves generous headroom for a fast typer while
// stopping a script that fires dozens per second.
export const PER_SENDER_MAX = 30;
export const PER_SENDER_WINDOW_MS = 60 * 1000;

// Per-recipient: a real conversation with one person is bursty but seldom exceeds a
// handful of messages a minute; 10/min to the same recipient blocks targeted flooding
// without disrupting normal chat.
export const PER_RECIPIENT_MAX = 10;
export const PER_RECIPIENT_WINDOW_MS = 60 * 1000;

// Cold-contact: opening 5 brand-new conversations in 5 minutes covers any legitimate
// "reach out to a few experts" burst (~1/min sustained) while throttling the mass
// cold-spray pattern (verified: 20 strangers in 0.5s before this guard existed).
export const COLD_CONTACT_MAX = 5;
export const COLD_CONTACT_WINDOW_MS = 5 * 60 * 1000;

interface Entry {
  count: number;
  resetTime: number;
}

const store = new Map<string, Entry>();

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(store.entries())) {
    if (entry.resetTime < now) store.delete(key);
  }
}, 60 * 1000);
// Never let this housekeeping timer hold the event loop open (mirrors rate-limiter.ts).
cleanup.unref?.();

function hit(key: string, windowMs: number): Entry {
  const now = Date.now();
  const existing = store.get(key);
  if (!existing || existing.resetTime < now) {
    const entry = { count: 1, resetTime: now + windowMs };
    store.set(key, entry);
    return entry;
  }
  existing.count += 1;
  return existing;
}

/**
 * Loopback peer detection — the real socket peer address, not a spoofable header
 * (mirrors isLoopback in ./rate-limiter.ts). Used to scope the CI escape hatch to
 * on-box traffic only.
 */
export function isLoopbackPeer(ip?: string | null): boolean {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip.endsWith(":127.0.0.1");
}

/**
 * The same CI escape hatch every other limiter honours, with the SAME loopback-only
 * boundary. Playwright / journey gates drive many message writes from loopback under
 * RATE_LIMIT_LOOPBACK_SKIP=1; without this they would trip these caps mid-suite.
 * NEVER set this in production — and even if it is, bypass is granted ONLY to a
 * loopback peer, so external HTTP/WebSocket traffic stays limited regardless. An
 * env-only check would silently disable all anti-spam for public traffic.
 */
function bypassActive(peerIp?: string | null): boolean {
  return process.env.RATE_LIMIT_LOOPBACK_SKIP === "1" && isLoopbackPeer(peerIp);
}

export type MessageRateScope = "cold_contact" | "recipient" | "sender";

export interface MessageRateResult {
  allowed: boolean;
  scope?: MessageRateScope;
  retryAfterSec?: number;
  message?: string;
}

function deny(scope: MessageRateScope, resetTime: number, message: string): MessageRateResult {
  return {
    allowed: false,
    scope,
    retryAfterSec: Math.max(1, Math.ceil((resetTime - Date.now()) / 1000)),
    message,
  };
}

/**
 * Check (and, on allow, record) a single message send against all messaging limits.
 * Call once per attempted send, before persisting the message.
 *
 * @param senderId          authenticated sender's user id (never client-supplied)
 * @param recipientId       the recipient's user id
 * @param isNewConversation true if no prior message exists between the pair
 */
export function checkMessageRateLimit(params: {
  senderId: string;
  recipientId: string;
  isNewConversation: boolean;
  /** Socket peer address of the sender; scopes the CI bypass to loopback only. */
  peerIp?: string | null;
}): MessageRateResult {
  const { senderId, recipientId, isNewConversation, peerIp } = params;
  if (bypassActive(peerIp)) return { allowed: true };
  if (!senderId || !recipientId) return { allowed: true };

  // 1. Cold-contact (strictest) — only counts when this is a genuinely new pair.
  if (isNewConversation) {
    const cold = hit(`msg:cold:${senderId}`, COLD_CONTACT_WINDOW_MS);
    if (cold.count > COLD_CONTACT_MAX) {
      logger.warn({ senderId, scope: "cold_contact", count: cold.count }, "Messaging rate limit exceeded");
      return deny(
        "cold_contact",
        cold.resetTime,
        "You're starting new conversations too quickly. Please wait a bit before contacting more people.",
      );
    }
  }

  // 2. Per-recipient flood protection.
  const recip = hit(`msg:recip:${senderId}:${recipientId}`, PER_RECIPIENT_WINDOW_MS);
  if (recip.count > PER_RECIPIENT_MAX) {
    logger.warn({ senderId, recipientId, scope: "recipient", count: recip.count }, "Messaging rate limit exceeded");
    return deny(
      "recipient",
      recip.resetTime,
      "You're sending messages to this person too quickly. Please slow down.",
    );
  }

  // 3. Per-sender overall backstop.
  const sender = hit(`msg:sender:${senderId}`, PER_SENDER_WINDOW_MS);
  if (sender.count > PER_SENDER_MAX) {
    logger.warn({ senderId, scope: "sender", count: sender.count }, "Messaging rate limit exceeded");
    return deny(
      "sender",
      sender.resetTime,
      "You're sending messages too quickly. Please slow down.",
    );
  }

  return { allowed: true };
}

/** Test-only: clear all counters so suites don't leak state between cases. */
export function __resetMessageRateLimiter(): void {
  store.clear();
}
