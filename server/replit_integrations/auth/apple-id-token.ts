/**
 * Apple identity-token checks (fix-queue row 282).
 *
 * Pure aside from the caller's key set. The signature is RSA-SHA256 against a
 * JWK the caller supplies (Apple's JWKS in production, a test key in tests).
 * Issuer, audience, expiry, and nonce are checked after the signature, so a
 * bad signature never becomes a more specific reason.
 */
import crypto from "crypto";
import { isValidOAuthNonce } from "../../utils/oauth-state";

export const APPLE_ISSUER = "https://appleid.apple.com";
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

const MAX_TOKEN_CHARS = 16_000;

export type AppleIdTokenClaims = {
  iss: string;
  aud: string | string[];
  exp: number;
  sub: string;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
};

export type AppleIdTokenFailure =
  | "malformed"
  | "bad_signature"
  | "wrong_issuer"
  | "wrong_audience"
  | "expired"
  | "bad_nonce"
  | "missing_subject";

export type AppleIdTokenResult =
  | { ok: true; claims: AppleIdTokenClaims }
  | { ok: false; reason: AppleIdTokenFailure };

/**
 * Apple documents `email_verified` as either boolean true or the string "true".
 * Anything else, including a missing claim, is not a verified signal. This is
 * Apple's claim shape only; `oidcEmailVerified` still requires boolean true.
 */
export function appleEmailVerified(claims: { email_verified?: unknown } | null | undefined): boolean {
  const value = claims?.email_verified;
  return value === true || value === "true";
}

export function appleEmail(claims: { email?: unknown } | null | undefined): string | null {
  const value = claims?.email;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254 || !trimmed.includes("@")) return null;
  return trimmed;
}

function decodeJson(segment: string): unknown {
  const json = Buffer.from(segment, "base64url").toString("utf8");
  return JSON.parse(json);
}

function audienceMatches(aud: unknown, expected: string): boolean {
  if (!expected) return false;
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.some((item) => item === expected);
  return false;
}

function publicKeyFromJwk(jwk: crypto.JsonWebKey): crypto.KeyObject {
  const { kty, n, e } = jwk;
  return crypto.createPublicKey({ key: { kty, n, e }, format: "jwk" });
}

/**
 * Verify an Apple `id_token`. `keys` is the JWKS `keys` array (mocked in tests).
 * `nonce` is the value this session issued through `oauth-state.ts`.
 */
export function verifyAppleIdToken(
  token: string,
  opts: { audience: string; nonce: string; keys: crypto.JsonWebKey[]; now?: number },
): AppleIdTokenResult {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_CHARS) {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return { ok: false, reason: "malformed" };
  }
  let header: { alg?: unknown; kid?: unknown };
  let payload: Record<string, unknown>;
  try {
    const headerJson = decodeJson(parts[0]);
    const payloadJson = decodeJson(parts[1]);
    if (!headerJson || typeof headerJson !== "object" || Array.isArray(headerJson)) {
      return { ok: false, reason: "malformed" };
    }
    if (!payloadJson || typeof payloadJson !== "object" || Array.isArray(payloadJson)) {
      return { ok: false, reason: "malformed" };
    }
    header = headerJson as { alg?: unknown; kid?: unknown };
    payload = payloadJson as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    return { ok: false, reason: "bad_signature" };
  }
  const jwk = opts.keys.find((key) => key && key.kid === header.kid && key.kty === "RSA");
  if (!jwk) return { ok: false, reason: "bad_signature" };
  let signatureOk = false;
  try {
    const key = publicKeyFromJwk(jwk);
    signatureOk = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (!signatureOk) return { ok: false, reason: "bad_signature" };

  if (payload.iss !== APPLE_ISSUER) return { ok: false, reason: "wrong_issuer" };
  if (!audienceMatches(payload.aud, opts.audience)) return { ok: false, reason: "wrong_audience" };
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return { ok: false, reason: "malformed" };
  }
  const now = opts.now ?? Date.now();
  if (payload.exp * 1000 <= now) return { ok: false, reason: "expired" };
  if (!isValidOAuthNonce(opts.nonce, payload.nonce)) return { ok: false, reason: "bad_nonce" };
  if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 255) {
    return { ok: false, reason: "missing_subject" };
  }
  return { ok: true, claims: payload as unknown as AppleIdTokenClaims };
}
