/**
 * Sign in with Apple id_token checks (row 282). A local RSA key stands in for
 * Apple's JWKS. No Apple secret value is embedded here.
 *
 *   npx tsx --test server/__tests__/apple-id-token.test.ts
 */
import crypto from "crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  APPLE_ISSUER,
  appleEmailVerified,
  verifyAppleIdToken,
} from "../replit_integrations/auth/apple-id-token";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as crypto.JsonWebKey;
jwk.kid = "test-kid";
const keys = [jwk];
const audience = `aud-${crypto.randomBytes(8).toString("hex")}`;
const nonce = crypto.randomBytes(16).toString("hex");
const now = 1_700_000_000_000;

function sign(payload: Record<string, unknown>, kid = "test-kid"): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url");
  return `${data}.${sig}`;
}

function claims(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: APPLE_ISSUER,
    aud: audience,
    exp: Math.floor(now / 1000) + 600,
    sub: "subject-1",
    nonce,
    ...over,
  };
}

test("a signed token with the right issuer, audience, expiry, and nonce verifies", () => {
  const result = verifyAppleIdToken(sign(claims()), { audience, nonce, keys, now });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.claims.sub, "subject-1");
});

test("the wrong audience is refused", () => {
  const result = verifyAppleIdToken(sign(claims({ aud: "someone-else" })), { audience, nonce, keys, now });
  assert.deepEqual(result, { ok: false, reason: "wrong_audience" });
});

test("the wrong issuer is refused", () => {
  const result = verifyAppleIdToken(sign(claims({ iss: "https://evil.example" })), { audience, nonce, keys, now });
  assert.deepEqual(result, { ok: false, reason: "wrong_issuer" });
});

test("a bad nonce is refused", () => {
  const result = verifyAppleIdToken(sign(claims({ nonce: "not-the-issued-nonce" })), { audience, nonce, keys, now });
  assert.deepEqual(result, { ok: false, reason: "bad_nonce" });
});

test("an expired token is refused", () => {
  const result = verifyAppleIdToken(sign(claims({ exp: Math.floor(now / 1000) - 10 })), { audience, nonce, keys, now });
  assert.deepEqual(result, { ok: false, reason: "expired" });
});

test("a token signed by a different key is refused", () => {
  const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-kid" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims())).toString("base64url");
  const data = `${header}.${body}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(data), other).toString("base64url");
  const result = verifyAppleIdToken(`${data}.${sig}`, { audience, nonce, keys, now });
  assert.deepEqual(result, { ok: false, reason: "bad_signature" });
});

test("Apple's string and boolean verified-email forms", () => {
  assert.equal(appleEmailVerified({ email_verified: true }), true);
  assert.equal(appleEmailVerified({ email_verified: "true" }), true);
  assert.equal(appleEmailVerified({ email_verified: false }), false);
  assert.equal(appleEmailVerified({ email_verified: "false" }), false);
  assert.equal(appleEmailVerified({ email_verified: "TRUE" }), false);
  assert.equal(appleEmailVerified({}), false);
  assert.equal(appleEmailVerified(undefined), false);
});

test("the Apple modules do not log env values", () => {
  for (const rel of [
    "../replit_integrations/auth/appleAuth.ts",
    "../replit_integrations/auth/apple-env.ts",
    "../replit_integrations/auth/apple-id-token.ts",
  ]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.equal(src.includes("console.log(process.env"), false, rel);
    assert.equal(src.includes("console.warn(process.env"), false, rel);
    assert.equal(src.includes("console.error(process.env"), false, rel);
  }
});
