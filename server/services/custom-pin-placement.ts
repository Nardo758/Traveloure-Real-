/**
 * Signed placement for a custom optimize pin (architect round 4, 2026-10-25).
 *
 * The client echoes `placement` opaquely. The server accepts those coordinates only when
 * this HMAC verifies, `at` is not in the future, and `at` is at most 24 hours old.
 * Anything else is re-geocoded. A bare lat/lng is not a placement.
 *
 * THE KEY. `SESSION_SECRET` — the same secret the session cookie, the concierge claim-token
 * HMAC, and the conversation public id already use. No new required env var. When it is
 * unset the fallback is a process-lifetime random key, never a fixed literal, so an
 * unconfigured environment cannot be signed for by anyone who read this file. The domain
 * string keeps this digest distinct from those other uses of the secret.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CUSTOM_PIN_PLACEMENT_MAX_AGE_MS,
  CUSTOM_PIN_PLACEMENT_SOURCE,
  readCustomPinPlacement,
  type CustomPinPlacement,
} from "@shared/custom-location-pin";

const HMAC_DOMAIN = "custom-pin-placement:v1";

let fallbackKey: string | null = null;
let warned = false;

/** `SESSION_SECRET` when set; otherwise a process-lifetime random key. Never a literal. */
export function placementSigningKey(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (!fallbackKey) {
    fallbackKey = randomBytes(32).toString("hex");
    if (!warned) {
      warned = true;
      console.warn(
        "[custom-pin-placement] SESSION_SECRET is unset — placement signatures use a " +
          "process-lifetime random key and will not verify after a restart.",
      );
    }
  }
  return fallbackKey;
}

function canonicalCoord(value: number): string {
  return Object.is(value, -0) ? "0" : value.toString();
}

/** Fixed key order. Lat/lng are decimal strings so the digest does not depend on JSON number formatting. */
export function placementCanonical(input: {
  name: string;
  lat: number;
  lng: number;
  source: string;
  at: string;
}): string {
  return JSON.stringify({
    v: HMAC_DOMAIN,
    name: input.name.trim(),
    lat: canonicalCoord(input.lat),
    lng: canonicalCoord(input.lng),
    source: input.source,
    at: input.at,
  });
}

function signHex(canonical: string, secret: string): string {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

function signaturesMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signCustomPinPlacement(
  input: { name: string; lat: number; lng: number; at?: string; now?: number; secret?: string },
): CustomPinPlacement {
  const at = input.at ?? new Date(input.now ?? Date.now()).toISOString();
  const placement = {
    lat: input.lat,
    lng: input.lng,
    source: CUSTOM_PIN_PLACEMENT_SOURCE,
    at,
    sig: "",
  };
  placement.sig = signHex(
    placementCanonical({ name: input.name, lat: input.lat, lng: input.lng, source: placement.source, at }),
    input.secret ?? placementSigningKey(),
  );
  return placement;
}

/**
 * The echoed placement, when its signature matches this name and its timestamp is inside
 * the window. Null means "do not trust these coordinates".
 */
export function verifyCustomPinPlacement(input: {
  name: string;
  placement: unknown;
  now: number;
  secret?: string;
}): CustomPinPlacement | null {
  const placement = readCustomPinPlacement(input.placement);
  if (!placement) return null;
  if (!input.name.trim()) return null;
  const atMs = Date.parse(placement.at);
  if (!Number.isFinite(atMs)) return null;
  if (atMs > input.now) return null;
  if (input.now - atMs > CUSTOM_PIN_PLACEMENT_MAX_AGE_MS) return null;
  const expected = signHex(
    placementCanonical({
      name: input.name,
      lat: placement.lat,
      lng: placement.lng,
      source: placement.source,
      at: placement.at,
    }),
    input.secret ?? placementSigningKey(),
  );
  if (!signaturesMatch(placement.sig, expected)) return null;
  return placement;
}
