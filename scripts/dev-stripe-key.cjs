#!/usr/bin/env node
/**
 * Dev-only helper: prints the Stripe TEST secret key from the Replit Stripe
 * connector to stdout, so the dev workflow can map it into STRIPE_SECRET_KEY
 * without storing it anywhere. Production keeps using the STRIPE_SECRET_KEY
 * Replit Secret (sk_live_), per server/validate-env.ts.
 *
 * Usage (workflow): STRIPE_SECRET_KEY="$(node scripts/dev-stripe-key.cjs)" npm run dev
 */
async function main() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!hostname || !xReplitToken) {
    console.error("[dev-stripe-key] connector env not available");
    process.exit(1);
  }
  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) {
    console.error(`[dev-stripe-key] connector API ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();
  const secret = data.items?.[0]?.settings?.secret;
  if (!secret || !secret.startsWith("sk_test_")) {
    console.error("[dev-stripe-key] no sk_test_ secret found on the Stripe connection");
    process.exit(1);
  }
  process.stdout.write(secret);
}
main().catch((e) => {
  console.error("[dev-stripe-key] " + e.message);
  process.exit(1);
});
