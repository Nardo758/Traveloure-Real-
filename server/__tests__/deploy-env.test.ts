/**
 * Ledger `2026-11-09-deploy-env-secrets`: per-deployment values live in each deployment's Secrets, and a deployment
 * missing them refuses to boot. Pure + structural — no database, no server.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deploymentEnvLine, deploymentEnvProblems, isReplitDeployment } from "../utils/deploy-env";

const BUCKET = "replit-objstore-test";
const src = (p: string) => readFileSync(p, "utf8");

test("DE1 outside a Replit deployment nothing is required (workspace, CI, tests)", () => {
  for (const flag of [undefined, "", "0", "false"]) {
    assert.equal(isReplitDeployment({ REPLIT_DEPLOYMENT: flag } as any), false, String(flag));
    assert.deepEqual(deploymentEnvProblems({ REPLIT_DEPLOYMENT: flag, NODE_ENV: "production" } as any), []);
  }
});

test("DE2 a deployment with ENVIRONMENT unset, empty or misspelled refuses — never defaults to non-PROD", () => {
  for (const e of [undefined, "", "  ", "prod", "Prod", "production", "STAGING"]) {
    const p = deploymentEnvProblems({ REPLIT_DEPLOYMENT: "1", ENVIRONMENT: e, REPLIT_OBJECT_STORAGE_BUCKET: BUCKET } as any);
    assert.equal(p.length, 1, String(e));
    assert.match(p[0], /^ENVIRONMENT/);
  }
});

test("DE3 a deployment with no bucket refuses; PROD and staging with a bucket boot", () => {
  assert.match(deploymentEnvProblems({ REPLIT_DEPLOYMENT: "1", ENVIRONMENT: "PROD" } as any).join(), /REPLIT_OBJECT_STORAGE_BUCKET is not set/);
  assert.deepEqual(deploymentEnvProblems({ REPLIT_DEPLOYMENT: "1", ENVIRONMENT: "PROD", REPLIT_OBJECT_STORAGE_BUCKET: BUCKET } as any), []);
  assert.deepEqual(deploymentEnvProblems({ REPLIT_DEPLOYMENT: "1", ENVIRONMENT: "staging", REPLIT_OBJECT_STORAGE_BUCKET: BUCKET } as any), []);
  assert.equal(deploymentEnvProblems({ REPLIT_DEPLOYMENT: "1" } as any).length, 2);
});

test("DE4 the boot line names both values, 'unset' for a missing one", () => {
  assert.equal(deploymentEnvLine({ ENVIRONMENT: "PROD", REPLIT_OBJECT_STORAGE_BUCKET: BUCKET } as any), `environment=PROD bucket=${BUCKET}`);
  assert.equal(deploymentEnvLine({} as any), "environment=unset bucket=unset");
});

test("DE5 wiring: the check runs before any Stripe check; the line logs before 'Server started'", () => {
  const ve = src("server/validate-env.ts");
  assert.ok(ve.indexOf("deploymentEnvProblems()") > 0 && ve.indexOf("deploymentEnvProblems()") < ve.indexOf("getStripeSecretKey()"));
  assert.match(ve, /throw new Error\(`\[validate-env\] Refusing to start this deployment:/);
  const idx = src("server/index.ts");
  assert.match(idx, /logger\.info\(deploymentEnvLine\(\)\);\s*logger\.info\(\{ port \}, "Server started"\);/);
  assert.ok(idx.indexOf('import "./validate-env";') < idx.indexOf('from "./routes"'), "validate-env loads before the app");
});

test("DE6 .replit carries neither per-deployment value; the Stripe prefix policy is untouched", () => {
  const replit = src(".replit");
  assert.doesNotMatch(replit, /^\s*ENVIRONMENT\s*=/m);
  assert.doesNotMatch(replit, /^\s*REPLIT_OBJECT_STORAGE_BUCKET\s*=/m);
  assert.match(replit, /^\s*npm_config_registry = "https:\/\/registry\.npmjs\.org\/"/m, "the rest of [env] stays");
  assert.match(replit, /^PORT = "5000"/m);
  assert.match(src("server/utils/stripe-key.ts"), /if \(env\.STRIPE_SECRET_KEY_TEST\) return env\.STRIPE_SECRET_KEY_TEST;/);
});
