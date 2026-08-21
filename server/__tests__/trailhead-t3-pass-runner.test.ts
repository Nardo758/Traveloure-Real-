/**
 * Operation Trailhead LANE T3.5 — pass-runner PURE-CORE proofs (DB-free, no network).
 *
 * The DB-bound runResolutionPass() waits on the T2.4 verdict + T0 and is NOT run here (no DATABASE).
 * These proofs exercise the pure core the runner composes: the waterfall (resolveStub, R-T3-a rung
 * order) and the transition planner (planTransition, R-T3-c upgrade/downgrade/no-op semantics).
 *
 * Run with:  npx tsx --test server/__tests__/trailhead-t3-pass-runner.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveStub, planTransition, type ResolutionDecision } from "../services/stub-resolution.service";
import { defaultResolutionState, type StubResolutionState } from "../../shared/trailhead-resolution";
import type { ProviderServiceCandidate } from "../services/stub-provider-matcher";

const stub = {
  id: "stub-1",
  name: "Camellia Tea Ceremony Kyoto",
  contentType: "attraction",
  latitude: "35.003500",
  longitude: "135.778000",
};

const providerHit: ProviderServiceCandidate = {
  id: "svc-1",
  serviceName: "Camellia Kyoto Tea Ceremony",
  latitude: "35.003520",
  longitude: "135.778050",
  categoryKey: "activity_provider",
  approvalStatus: "approved",
};

describe("T3.5 waterfall — rung order (R-T3-a)", () => {
  it("provider wins when it matches (never competed with)", () => {
    const d = resolveStub(stub, [providerHit]);
    assert.equal(d.resolutionClass, "provider");
    assert.equal(d.resolutionRef, "svc-1");
    assert.equal(d.rung, "provider");
    assert.equal(d.resolutionSubclass, null);
  });

  it("falls to external when provider misses and every affiliate program is disabled (shipped config)", () => {
    const d = resolveStub(stub, []); // no provider candidates; default (disabled) affiliate registry
    assert.equal(d.resolutionClass, "external");
    assert.equal(d.resolutionRef, null);
    assert.equal(d.matchConfidence, null);
    assert.equal(d.rung, "external");
  });

  it("provider is preferred over an enabled affiliate (rung order holds)", () => {
    const d = resolveStub(stub, [providerHit], {
      programs: {
        viator: { key: "viator", displayName: "Viator", rung: "affiliate_ota", enabled: true, hasCatalog: true, linkBuilderKey: "viator" },
      },
      catalogs: { viator: [{ productId: "v-1", name: "Camellia Tea Ceremony Kyoto" }] },
    });
    assert.equal(d.resolutionClass, "provider", "provider must beat an eligible affiliate");
  });
});

describe("T3.5 transition planner — R-T3-c upgrade/downgrade/no-op", () => {
  it("first resolution off the born floor is 'initial', no fromClass", () => {
    const born = defaultResolutionState();
    const decision = resolveStub(stub, [providerHit]);
    const plan = planTransition(born, decision);
    assert.equal(plan.changed, true);
    assert.equal(plan.kind, "initial");
    assert.equal(plan.event?.fromClass, null);
    assert.equal(plan.event?.toClass, "provider");
    assert.equal(plan.event?.ref, "svc-1");
  });

  it("re-running the same inputs on an already-resolved stub is a NO-OP (no event)", () => {
    const decision = resolveStub(stub, [providerHit]);
    const resolved: StubResolutionState = {
      resolutionClass: "provider",
      resolutionSubclass: null,
      resolutionRef: "svc-1",
      matchConfidence: decision.matchConfidence,
      resolvedAt: new Date("2026-08-21T00:00:00Z"),
    };
    const plan = planTransition(resolved, decision);
    assert.equal(plan.changed, false);
    assert.equal(plan.event, undefined);
  });

  it("a DOWNGRADE (provider un-approved ⇒ now external) is applied WITH an audit event (R-T3-c)", () => {
    const resolved: StubResolutionState = {
      resolutionClass: "provider",
      resolutionSubclass: null,
      resolutionRef: "svc-1",
      matchConfidence: 0.98,
      resolvedAt: new Date("2026-08-21T00:00:00Z"),
    };
    const nowExternal = resolveStub(stub, []); // provider listing gone
    const plan = planTransition(resolved, nowExternal);
    assert.equal(plan.changed, true);
    assert.equal(plan.kind, "downgrade");
    assert.equal(plan.event?.fromClass, "provider");
    assert.equal(plan.event?.toClass, "external");
  });

  it("an UPGRADE (external ⇒ provider on a re-run) logs an 'upgrade' event", () => {
    const prevExternal: StubResolutionState = {
      resolutionClass: "external",
      resolutionSubclass: null,
      resolutionRef: null,
      matchConfidence: null,
      resolvedAt: new Date("2026-08-20T00:00:00Z"), // already touched by a prior pass (not the born floor)
    };
    const decision = resolveStub(stub, [providerHit]);
    const plan = planTransition(prevExternal, decision);
    assert.equal(plan.kind, "upgrade");
    assert.equal(plan.event?.fromClass, "external");
    assert.equal(plan.event?.toClass, "provider");
  });
});

describe("T3.5 determinism — same stubs + same catalogs + same config ⇒ same resolutions", () => {
  it("resolveStub is a pure function of its inputs (repeated calls identical)", () => {
    const runs: ResolutionDecision[] = Array.from({ length: 5 }, () => resolveStub(stub, [providerHit]));
    for (const r of runs) {
      assert.deepEqual(r, runs[0]);
    }
  });

  it("a batch of stubs resolves identically across two independent passes", () => {
    const batch = [
      { s: stub, c: [providerHit] },
      { s: { ...stub, id: "stub-2", name: "Totally Unrelated Ramen Bar" }, c: [providerHit] }, // → external
      { s: { ...stub, id: "stub-3" }, c: [] }, // no candidates → external
    ];
    const passA = batch.map((b) => resolveStub(b.s, b.c));
    const passB = batch.map((b) => resolveStub(b.s, b.c));
    assert.deepEqual(passA, passB);
    assert.equal(passA[0].resolutionClass, "provider");
    assert.equal(passA[1].resolutionClass, "external");
    assert.equal(passA[2].resolutionClass, "external");
  });
});
