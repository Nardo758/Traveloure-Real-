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

/**
 * ── THE AI-ASK LIMITS (decision-maker ruling 2026-09-16, punchlist **D-46** = A amended;
 *    ledger `2026-09-16-l16-rulings-d45-d50`; CLAUDE.md Locked Decision 45 (3), §13, §14,
 *    §18 rule 1) ───────────────────────────────────────────────────────────────────────────────
 *
 * WHY THEY LIVE HERE AND NOT IN A MODULE OF THEIR OWN. D-46 rules "one more NAMED limit in that
 * SAME fixed-window module … never a second limiter implementation" (§18 rule 1). Everything below
 * shares THIS file's single `store`, its single `hit()`, its single `cleanup` timer, its single
 * loopback-only `bypassActive()` and its single `__resetMessageRateLimiter()`. A second counter map
 * somewhere else is how one limiter starts throttling traffic the other has already allowed.
 *
 * WHY `checkMessageRateLimit` COULD NOT SIMPLY BE CALLED. It **requires a `recipientId`** and
 * returns `{allowed:true}` outright when one is missing (`:137` above). An AI ask has no recipient:
 * the counterpart is the platform's own model call, not a person. Passing a fabricated one would be
 * an invented identity on an identity key — the class §14 refuses one table over, and the thing
 * D-46 forbids by name. So this is a NAMED SECOND ENTRY POINT over the same machinery, never a
 * fake recipient and never a fork.
 *
 * TWO LIMITS, AND THE SECOND IS NOT BELT-AND-BRACES (D-46 ii):
 *   1. **Per trip** — asks from one sender against ONE plan, per window. This is the shape of the
 *      abuse that actually costs tokens: re-asking the same plan over and over.
 *   2. **Per sender, DAILY** — every ask that account makes, across every plan. **Trips are free to
 *      create**, so a per-trip limit ALONE fans out: mint twenty plans, get twenty buckets. The
 *      daily ceiling is what makes the first limit mean anything.
 *
 * ASKING IS FREE (D-21), so what these protect is TOKENS, not money. Nothing here is a fee, a rate
 * or a band (§8): they are counts and windows.
 *
 * **STATED LIMIT, ACCEPTED BY RULING, NOT CLOSED (D-46 iii).** The store above is in-memory PER
 * PROCESS and `.replit` declares `deploymentTarget = "autoscale"`, so both limits multiply by
 * instance count and a cross-instance double-submit is not seen here at all. That is the same limit
 * this module's own header already states for messaging. It was ACCEPTED for L16 because the
 * exposure is tokens rather than money, and the shared-store lane is filed in `docs/PUNCHLIST.md`
 * §4 with its trigger stated verbatim: *"when observed instance count > 1 or ask volume makes token
 * spend material."* Do not close it quietly by adding a second store here.
 */

// Per trip: a traveler refining one plan asks a handful of questions in a sitting. Eight in ten
// minutes is a generous conversation and a poor script.
export const AI_ASK_PER_TRIP_MAX = 8;
export const AI_ASK_PER_TRIP_WINDOW_MS = 10 * 60 * 1000;

// Per sender, DAILY: the fan-out ceiling. A person planning several trips at once still lands well
// inside this; an account minting plans to farm free model calls does not.
export const AI_ASK_PER_SENDER_DAILY_MAX = 40;
export const AI_ASK_PER_SENDER_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The two named AI-ask scopes. Deliberately distinct strings from `MessageRateScope`'s. */
export type AiAskRateScope = "ai_ask_trip" | "ai_ask_sender_daily";

export interface AiAskRateResult {
  allowed: boolean;
  scope?: AiAskRateScope;
  retryAfterSec?: number;
  message?: string;
}

function denyAiAsk(scope: AiAskRateScope, resetTime: number, message: string): AiAskRateResult {
  return {
    allowed: false,
    scope,
    retryAfterSec: Math.max(1, Math.ceil((resetTime - Date.now()) / 1000)),
    message,
  };
}

/**
 * Check (and, on allow, record) ONE Ask-AI request against both AI-ask limits.
 *
 * Call once per attempted ask, BEFORE the model call — the model call is the expensive half, so a
 * limit checked after it would protect nothing.
 *
 * Strictest-first, and BOTH are recorded when both pass: an ask that trips the per-trip limit does
 * not also consume the sender's daily budget, which is the right way round — the traveler is told
 * to slow down on this plan, not charged a day's allowance for a refusal.
 *
 * @param senderId the AUTHENTICATED asker's user id (§14 — from the session, never a body)
 * @param tripId   the plan being asked about (the route's own path parameter)
 * @param peerIp   socket peer address; scopes the CI bypass to loopback only, exactly as above
 */
export function checkAiAskRateLimit(params: {
  senderId: string;
  tripId: string;
  peerIp?: string | null;
}): AiAskRateResult {
  const { senderId, tripId, peerIp } = params;
  if (bypassActive(peerIp)) return { allowed: true };
  // Fail OPEN on a missing id, exactly as `checkMessageRateLimit` does: a limiter is not an
  // authorization gate, and the route's own §12 gate has already refused an unauthenticated caller
  // before this is ever reached. Inventing a key out of an empty id would throttle every such
  // caller into ONE shared bucket, which is a worse answer than not counting.
  if (!senderId || !tripId) return { allowed: true };

  // 1. Per trip (strictest) — the shape of the abuse that costs tokens.
  const perTrip = hit(`ai-ask:trip:${senderId}:${tripId}`, AI_ASK_PER_TRIP_WINDOW_MS);
  if (perTrip.count > AI_ASK_PER_TRIP_MAX) {
    logger.warn(
      { senderId, tripId, scope: "ai_ask_trip", count: perTrip.count },
      "AI ask rate limit exceeded",
    );
    return denyAiAsk(
      "ai_ask_trip",
      perTrip.resetTime,
      "You've asked about this plan a lot in a short time. Please wait a moment before asking again.",
    );
  }

  // 2. Per sender, DAILY — the fan-out ceiling a per-trip limit alone cannot provide.
  const daily = hit(`ai-ask:sender-daily:${senderId}`, AI_ASK_PER_SENDER_DAILY_WINDOW_MS);
  if (daily.count > AI_ASK_PER_SENDER_DAILY_MAX) {
    logger.warn(
      { senderId, scope: "ai_ask_sender_daily", count: daily.count },
      "AI ask rate limit exceeded",
    );
    return denyAiAsk(
      "ai_ask_sender_daily",
      daily.resetTime,
      "You've reached today's limit for AI questions. Please try again tomorrow.",
    );
  }

  return { allowed: true };
}

/** Test-only: clear all counters so suites don't leak state between cases. */
export function __resetMessageRateLimiter(): void {
  store.clear();
}
