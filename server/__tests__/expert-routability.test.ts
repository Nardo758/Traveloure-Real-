/**
 * Smoke 13 #3 — the routable rule and the seed rule, pure (no DB).
 *
 *   R1  routable = application approved AND Identity verified AND Stripe Connect complete AND not seed
 *   R2  EVERY email a seed file under server/ creates is classified seed — so a new seed persona on
 *       the real domain fails CI here instead of becoming routable in production
 *   R3  SHOW_DEMO_EXPERTS=1 is the only switch that relaxes the public directory
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isRoutableExpert, isSeedExpertEmail, showDemoExperts } from "../services/expert-routability";

test("R1 routable = approved + verified + payable + not seed", () => {
  const ok = { applicationStatus: "approved", identityVerificationStatus: "verified", stripeConnectStatus: "complete", email: "a@real.invalid" };
  assert.equal(isRoutableExpert(ok), true);
  assert.equal(isRoutableExpert({ ...ok, applicationStatus: "pending" }), false, "a Pending application is never routable");
  assert.equal(isRoutableExpert({ ...ok, identityVerificationStatus: "pending" }), false);
  assert.equal(isRoutableExpert({ ...ok, identityVerificationStatus: null }), false);
  assert.equal(isRoutableExpert({ ...ok, stripeConnectStatus: "pending" }), false);
  assert.equal(isRoutableExpert({ ...ok, stripeConnectStatus: null }), false);
  assert.equal(isRoutableExpert({ ...ok, email: "kenji.tanaka@example.com" }), false);
  assert.equal(isRoutableExpert({ ...ok, email: "kyoto-local@traveloure.test" }), false);
  assert.equal(isRoutableExpert({ ...ok, email: "Yuki.Tanaka@Traveloure.com" }), false);
  assert.equal(isSeedExpertEmail(null), false);
  assert.equal(isSeedExpertEmail("someone@traveloure.com"), false, "the real domain is not seed by itself");
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|js|json|sql)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("R2 every email a seed file creates is classified seed", () => {
  const server = path.resolve(import.meta.dirname, "..");
  const files = [
    ...walk(path.join(server, "seeds")),
    ...fs.readdirSync(server).filter((f) => /^seed[-.].*\.ts$/.test(f)).map((f) => path.join(server, f)),
  ];
  assert.ok(files.length > 5, "the seed files were found");
  const unclassified = new Set<string>();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/["'`]([a-z0-9._+-]+@(?:traveloure\.(?:com|test)|example\.(?:com|org)))["'`]/gi)) {
      if (!isSeedExpertEmail(m[1])) unclassified.add(`${m[1]} (${path.relative(server, f)})`);
    }
  }
  assert.deepEqual(
    [...unclassified],
    [],
    "a seed file creates an account the seed rule does not recognise — add it to SEED_EXPERT_EMAILS in server/services/expert-routability.ts",
  );
});

test("R3 SHOW_DEMO_EXPERTS=1 is the only switch", () => {
  const prev = process.env.SHOW_DEMO_EXPERTS;
  try {
    delete process.env.SHOW_DEMO_EXPERTS;
    assert.equal(showDemoExperts(), false);
    process.env.SHOW_DEMO_EXPERTS = "true";
    assert.equal(showDemoExperts(), false);
    process.env.SHOW_DEMO_EXPERTS = "1";
    assert.equal(showDemoExperts(), true);
  } finally {
    if (prev === undefined) delete process.env.SHOW_DEMO_EXPERTS;
    else process.env.SHOW_DEMO_EXPERTS = prev;
  }
});
