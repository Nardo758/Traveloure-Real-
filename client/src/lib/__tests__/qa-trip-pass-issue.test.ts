/**
 * QA FREE OPTIMIZE RUNS = AN ADMIN-ISSUED, ZERO-CHARGE TRIP PASS (ledger `2026-10-08-qa-trip-pass-issue`).
 *
 *   Q1  env unset (or blank) ⇒ refused, and nothing is read or granted
 *   Q2  an account off the QA domain ⇒ refused (exact match — a suffix or a lookalike is not the domain)
 *   Q3  a plan the account does not own ⇒ refused, nothing granted
 *   Q4  happy path: grant with source 'qa', no payment id, zero paid, the reason + admin in the snapshot
 *   Q5  unknown account / unknown plan ⇒ 404; every other refusal ⇒ 403
 *   Q6  source pins: the service writes no ledger row and touches no Stripe; the route is admin-only, a
 *       `.strict()` body, the domain read by NAME from the environment; 'qa' is an allowed pass source
 *
 * Run: npx tsx --test client/src/lib/__tests__/qa-trip-pass-issue.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  issueQaTripPass,
  isQaDomainAccount,
  qaIssueRefusalStatus,
  type QaIssueDeps,
} from "../../../../server/services/qa-trip-pass.service";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const QA = "qa.example.test";

function deps(over: Partial<QaIssueDeps> = {}) {
  const grants: any[] = [];
  const d: QaIssueDeps = {
    qaDomain: () => QA,
    getUser: async (id) => (id === "u1" ? { id: "u1", email: "tester@qa.example.test" } : id === "u2" ? { id: "u2", email: "someone@elsewhere.test" } : null),
    getTrip: async (id) => (id === "t1" ? { id: "t1", userId: "u1" } : id === "t2" ? { id: "t2", userId: "u9" } : null),
    passAllowances: async () => ({ allowances: { optimizerRuns: 5 }, name: "Trip Pass" }),
    grant: async (input) => {
      grants.push(input);
      return { created: true };
    },
    now: () => new Date("2026-10-08T12:00:00Z"),
    ...over,
  };
  return { d, grants };
}

const input = { userId: "u1", tripId: "t1", reason: "smoke run on staging", issuedBy: "admin1" };

describe("QA trip pass issue", () => {
  it("Q1 env unset or blank ⇒ refused, nothing granted", async () => {
    for (const v of [undefined, null, "", "   "]) {
      const { d, grants } = deps({ qaDomain: () => v as any });
      const out = await issueQaTripPass(input, d);
      assert.deepEqual(out, { ok: false, refusal: "qa_domain_unset" });
      assert.equal(grants.length, 0);
    }
  });

  it("Q2 wrong domain ⇒ refused; exact match only", async () => {
    const { d, grants } = deps();
    assert.deepEqual(await issueQaTripPass({ ...input, userId: "u2" }, d), { ok: false, refusal: "not_qa_domain" });
    assert.equal(grants.length, 0);
    assert.equal(isQaDomainAccount("a@qa.example.test", QA), true);
    assert.equal(isQaDomainAccount("A@QA.Example.Test", "@qa.example.test"), true);
    assert.equal(isQaDomainAccount("a@sub.qa.example.test", QA), false);
    assert.equal(isQaDomainAccount("a@qa.example.test.evil", QA), false);
    assert.equal(isQaDomainAccount("qa.example.test", QA), false);
    assert.equal(isQaDomainAccount(null, QA), false);
    assert.equal(isQaDomainAccount("a@qa.example.test", ""), false);
  });

  it("Q3 wrong owner ⇒ refused, nothing granted", async () => {
    const { d, grants } = deps();
    assert.deepEqual(await issueQaTripPass({ ...input, tripId: "t2" }, d), { ok: false, refusal: "not_trip_owner" });
    assert.equal(grants.length, 0);
  });

  it("Q4 happy path: source 'qa', no payment id, zero paid, reason recorded", async () => {
    const { d, grants } = deps();
    const out = await issueQaTripPass(input, d);
    assert.deepEqual(out, { ok: true, created: true, tripId: "t1", source: "qa" });
    assert.equal(grants.length, 1);
    const g = grants[0];
    assert.equal(g.tripId, "t1");
    assert.equal(g.source, "qa");
    assert.equal("stripePaymentIntentId" in g, false);
    assert.equal(g.allowancesSnapshot.priceCentsPaid, 0);
    assert.equal(g.allowancesSnapshot.issuedReason, "smoke run on staging");
    assert.equal(g.allowancesSnapshot.issuedBy, "admin1");
    assert.equal(g.allowancesSnapshot.optimizerRuns, 5);
    assert.equal(g.allowancesSnapshot.issuedAt, "2026-10-08T12:00:00.000Z");
  });

  it("Q5 refusal statuses", async () => {
    const { d } = deps();
    const u = await issueQaTripPass({ ...input, userId: "nope" }, d);
    const t = await issueQaTripPass({ ...input, tripId: "nope" }, d);
    assert.deepEqual(u, { ok: false, refusal: "user_not_found" });
    assert.deepEqual(t, { ok: false, refusal: "trip_not_found" });
    assert.equal(qaIssueRefusalStatus("user_not_found"), 404);
    assert.equal(qaIssueRefusalStatus("trip_not_found"), 404);
    for (const r of ["qa_domain_unset", "not_qa_domain", "not_trip_owner"] as const) assert.equal(qaIssueRefusalStatus(r), 403);
  });

  it("Q6 source pins", () => {
    const svc = read("server/services/qa-trip-pass.service.ts");
    assert.doesNotMatch(svc, /fee-ledger\.service|recordFee|paymentIntents|stripePaymentService/);
    assert.doesNotMatch(svc, /^import /m, "the service is pure — its reads and the grant arrive injected");
    const route = read("server/routes/admin.routes.ts");
    const i = route.indexOf('"/api/admin/trip-pass/issue"');
    assert.ok(i > 0, "route registered");
    const block = route.slice(i - 800, i + 2500);
    assert.match(block, /qaTripPassIssueBody[\s\S]*\.strict\(\)/);
    assert.match(block, /process\.env\.QA_ACCOUNT_EMAIL_DOMAIN/);
    assert.match(block, /getFullAdminUser/);
    assert.match(block, /recordAdminAudit/);
    assert.doesNotMatch(route, /traveloure-qa\.test/, "no domain literal in code");
    const ent = read("server/services/trip-entitlement.service.ts");
    assert.match(ent, /TripPassSource[^;]*"qa"/);
  });
});
