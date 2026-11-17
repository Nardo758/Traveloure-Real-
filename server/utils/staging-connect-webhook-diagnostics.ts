import { createHash, timingSafeEqual } from "node:crypto";
import { getStripeWebhookSecret } from "./stripe-key";

// One-way reference to the Connect destination created for the staging sandbox.
// This is NOT a signing secret and cannot authenticate a webhook. If that
// destination's signing secret is rotated, replace this digest before using the
// comparison again. Never put the signing secret itself in source or logs.
const EXPECTED_STAGING_CONNECT_DIGEST =
  "6ae8edc130ac3404fecd40b08d992a4b42d37f7319718d1983a663643a479daf";

export interface StagingConnectWebhookDiagnostic {
  secretVariable:
    | "STRIPE_CONNECT_WEBHOOK_SECRET"
    | "STRIPE_CONNECT_WEBHOOK_SECRET_TEST";
  secretMatchesExpected: boolean;
  rawBodyIsBuffer: boolean;
  rawBodyBytes: number | null;
}

/**
 * An allowlisted record only: never return credentials, digests, payloads,
 * signatures, identifiers, request headers, or arbitrary caller properties.
 * Outside staging, return before resolving or hashing any credential.
 */
export function getStagingConnectWebhookDiagnostic(
  rawBody: unknown,
  env: NodeJS.ProcessEnv = process.env,
  expectedDigest: string = EXPECTED_STAGING_CONNECT_DIGEST,
): StagingConnectWebhookDiagnostic | null {
  if ((env.ENVIRONMENT ?? "").trim().toLowerCase() !== "staging") {
    return null;
  }

  const prodStrict =
    (env.NODE_ENV === "production" || env.ENVIRONMENT === "PROD") &&
    env.ALLOW_TEST_ACCOUNTS !== "1";
  const secret = getStripeWebhookSecret("connect", env);
  const validDigest = /^[a-f0-9]{64}$/i.test(expectedDigest);
  const secretMatchesExpected = Boolean(
    secret &&
      validDigest &&
      timingSafeEqual(
        createHash("sha256").update(secret).digest(),
        Buffer.from(expectedDigest, "hex"),
      ),
  );
  const rawBodyIsBuffer = Buffer.isBuffer(rawBody);

  return {
    secretVariable: prodStrict
      ? "STRIPE_CONNECT_WEBHOOK_SECRET"
      : "STRIPE_CONNECT_WEBHOOK_SECRET_TEST",
    secretMatchesExpected,
    rawBodyIsBuffer,
    rawBodyBytes: rawBodyIsBuffer ? (rawBody as Buffer).byteLength : null,
  };
}
