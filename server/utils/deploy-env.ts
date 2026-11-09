/**
 * DEPLOYMENT ENVIRONMENT — one rule, read at boot (ledger `2026-11-09-deploy-env-secrets`).
 *
 * WHY: on 2026-11-09 `.replit`'s `[userenv.production] ENVIRONMENT = "PROD"` beat the staging deployment's own
 * ENVIRONMENT Secret, and the staging boot refused its test Stripe key in `stripe.service.ts`. A shared `.replit`
 * cannot carry per-deployment values, so both now live ONLY in each deployment's Secrets:
 *   · production — ENVIRONMENT=PROD,    REPLIT_OBJECT_STORAGE_BUCKET=<production's bucket>
 *   · staging    — ENVIRONMENT=staging, REPLIT_OBJECT_STORAGE_BUCKET=<staging's bucket>
 *
 * FAIL CLOSED: inside a Replit deployment (`REPLIT_DEPLOYMENT` truthy — the flag Replit sets on every deployed
 * process, absent in the workspace, CI and tests) the boot is REFUSED unless ENVIRONMENT is exactly `PROD` or
 * `staging` and REPLIT_OBJECT_STORAGE_BUCKET is set. A missing ENVIRONMENT never defaults to anything: the code
 * compares `=== "PROD"` exactly, so an unset or misspelled value ("prod") would silently run production as
 * non-PROD. A refused boot fails the publish and the previous deployment stays live.
 *
 * Not changed here: the Stripe prefix rules (`stripe-key-policy.ts`). Note `getStripeSecretKey` prefers
 * STRIPE_SECRET_KEY_TEST outside prod-strict (staging: NODE_ENV=production + ALLOW_TEST_ACCOUNTS=1).
 *
 * Pure: reads only the env object it is given.
 */

/** The two values a deployment may carry. Exact — the code elsewhere compares `=== "PROD"`. */
export const DEPLOYMENT_ENVIRONMENTS = ["PROD", "staging"] as const;

export function isReplitDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  const f = env.REPLIT_DEPLOYMENT;
  return typeof f === "string" && f !== "" && f !== "0" && f.toLowerCase() !== "false";
}

/** Every reason this process may not boot as a deployment; empty ⇒ fine (or not a deployment at all). */
export function deploymentEnvProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!isReplitDeployment(env)) return [];
  const problems: string[] = [];
  const e = env.ENVIRONMENT;
  if (e === undefined || e.trim() === "") {
    problems.push("ENVIRONMENT is not set — set it as this deployment's Secret (production: PROD; staging: staging)");
  } else if (!(DEPLOYMENT_ENVIRONMENTS as readonly string[]).includes(e)) {
    problems.push(`ENVIRONMENT=${JSON.stringify(e)} is not one of ${DEPLOYMENT_ENVIRONMENTS.join(" | ")} (exact spelling)`);
  }
  const bucket = env.REPLIT_OBJECT_STORAGE_BUCKET;
  if (bucket === undefined || bucket.trim() === "") {
    problems.push("REPLIT_OBJECT_STORAGE_BUCKET is not set — set it as this deployment's Secret (its App Storage bucket id)");
  }
  return problems;
}

/** The one boot line: `environment=<ENVIRONMENT> bucket=<name>`, "unset" for a missing value. */
export function deploymentEnvLine(env: NodeJS.ProcessEnv = process.env): string {
  const v = (s: string | undefined) => (s && s.trim() ? s.trim() : "unset");
  return `environment=${v(env.ENVIRONMENT)} bucket=${v(env.REPLIT_OBJECT_STORAGE_BUCKET)}`;
}
