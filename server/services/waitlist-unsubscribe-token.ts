/**
 * Signed unsubscribe token for one launch_waitlist row (291a).
 *
 * THE KEY. `SESSION_SECRET` — the same secret the session cookie, the concierge
 * claim-token HMAC, and the conversation public id already use. No new required
 * env var. When it is unset the fallback is a process-lifetime random key, never
 * a fixed literal. The domain string keeps this digest distinct from those other
 * uses of the secret.
 *
 * The token is bound to the waitlist id. It does not expire. It carries no email.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAppBaseUrl } from "./email.service";

const DOMAIN = "waitlist-unsubscribe:v1";

let fallbackKey: string | null = null;
let warned = false;

/** `SESSION_SECRET` when set; otherwise a process-lifetime random key. Never a literal. */
export function waitlistUnsubscribeSigningKey(): string {
  const configured = process.env.SESSION_SECRET;
  if (typeof configured === "string" && configured.length > 0) return configured;
  if (!fallbackKey) {
    fallbackKey = randomBytes(32).toString("hex");
    if (!warned) {
      warned = true;
      console.warn(
        "[waitlist-unsubscribe] SESSION_SECRET is unset — unsubscribe tokens use a " +
          "process-lifetime random key and will not verify after a restart.",
      );
    }
  }
  return fallbackKey;
}

function digest(waitlistId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${DOMAIN}:${waitlistId}`).digest("hex");
}

export function signWaitlistUnsubscribeToken(waitlistId: string, secret = waitlistUnsubscribeSigningKey()): string {
  const id = waitlistId.trim();
  return `${id}.${digest(id, secret)}`;
}

/** The waitlist id when the signature matches. A tampered token or a wrong secret returns null. */
export function verifyWaitlistUnsubscribeToken(token: string, secret = waitlistUnsubscribeSigningKey()): string | null {
  const trimmed = typeof token === "string" ? token.trim() : "";
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return null;
  const id = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  if (!/^[0-9a-f-]{1,64}$/i.test(id)) return null;
  if (!/^[0-9a-f]{64}$/i.test(sig)) return null;
  const expected = digest(id, secret);
  const provided = Buffer.from(sig.toLowerCase(), "utf8");
  const actual = Buffer.from(expected, "utf8");
  if (provided.length !== actual.length || !timingSafeEqual(provided, actual)) return null;
  return id;
}

/** Page URL (/unsubscribe?token=). Opening it does not revoke; the confirm page POSTs the same token. */
export function waitlistUnsubscribeUrl(waitlistId: string): string {
  const base = getAppBaseUrl().trim();
  const url = new URL("/unsubscribe", base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("token", signWaitlistUnsubscribeToken(waitlistId));
  return url.href;
}
