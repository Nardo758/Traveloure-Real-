/**
 * provider-health.service.ts — behavioral proof.
 *
 * Covers: reportProviderResult never throws (even with garbage input); getProviderHealth reflects
 * ok/error/quota/auth/empty outcomes; retired providers always read 'retired' regardless of runtime
 * reports; unreported providers read 'not_called' (never a fabricated 'ok'); `configured` derives from
 * the real env var each provider's own service reads.
 *
 * Run with: npx tsx server/services/__tests__/provider-health.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  reportProviderResult,
  getProviderHealth,
  outcomeFromHttpStatus,
  __resetProviderHealthForTests,
} from "../provider-health.service";

describe("provider-health.service", () => {
  beforeEach(() => {
    __resetProviderHealthForTests();
  });

  it("getProviderHealth lists every known provider even before any report ('not_called', never fabricated 'ok')", () => {
    const entries = getProviderHealth();
    const viator = entries.find((e) => e.provider === "viator");
    assert.ok(viator, "viator should be a known provider");
    assert.equal(viator!.status, "not_called");
    assert.equal(viator!.lastSuccessAt, null);
    assert.equal(viator!.lastErrorAt, null);
  });

  it("reportProviderResult('ok') is reflected by getProviderHealth", () => {
    reportProviderResult("viator", "ok");
    const entry = getProviderHealth().find((e) => e.provider === "viator");
    assert.equal(entry!.status, "ok");
    assert.ok(entry!.lastSuccessAt, "lastSuccessAt should be set on ok");
    assert.equal(entry!.lastErrorAt, null);
  });

  it("reportProviderResult('empty') counts as a success (not an error) for lastSuccessAt", () => {
    reportProviderResult("tiqets", "empty");
    const entry = getProviderHealth().find((e) => e.provider === "tiqets");
    assert.equal(entry!.status, "empty");
    assert.ok(entry!.lastSuccessAt);
    assert.equal(entry!.lastErrorAt, null);
  });

  it("reportProviderResult('error'/'quota'/'auth') sets lastErrorAt, not lastSuccessAt", () => {
    reportProviderResult("serpapi", "quota", "429 rate limited");
    const entry = getProviderHealth().find((e) => e.provider === "serpapi");
    assert.equal(entry!.status, "quota");
    assert.equal(entry!.lastDetail, "429 rate limited");
    assert.ok(entry!.lastErrorAt);
    assert.equal(entry!.lastSuccessAt, null);
  });

  it("a later success does not erase an earlier lastErrorAt, and vice versa", () => {
    reportProviderResult("gettransfer", "error", "ENOTFOUND");
    reportProviderResult("gettransfer", "ok");
    const entry = getProviderHealth().find((e) => e.provider === "gettransfer");
    assert.equal(entry!.status, "ok"); // status reflects the LATEST outcome
    assert.ok(entry!.lastErrorAt, "earlier error timestamp should persist");
    assert.ok(entry!.lastSuccessAt, "the new success timestamp should be set");
  });

  it("retired providers (kiwi, hotellook) always read 'retired' — a runtime 'ok' report cannot override it", () => {
    // Simulates a bug where a live call somehow still fires against a retired service.
    reportProviderResult("kiwi", "ok");
    reportProviderResult("hotellook", "ok");
    const entries = getProviderHealth();
    assert.equal(entries.find((e) => e.provider === "kiwi")!.status, "retired");
    assert.equal(entries.find((e) => e.provider === "hotellook")!.status, "retired");
  });

  it("kiwi is retired with a documented reason and configured=false without KIWI_TEQUILA_API_KEY", () => {
    const entry = getProviderHealth().find((e) => e.provider === "kiwi")!;
    assert.equal(entry.retired, true);
    assert.match(entry.retiredReason || "", /Tequila/);
    if (!process.env.KIWI_TEQUILA_API_KEY) {
      assert.equal(entry.configured, false);
    }
  });

  it("outcomeFromHttpStatus maps 401/403 to auth, 429 to quota, and anything else to error", () => {
    assert.equal(outcomeFromHttpStatus(401), "auth");
    assert.equal(outcomeFromHttpStatus(403), "auth");
    assert.equal(outcomeFromHttpStatus(429), "quota");
    assert.equal(outcomeFromHttpStatus(404), "error");
    assert.equal(outcomeFromHttpStatus(500), "error");
  });

  it("reportProviderResult never throws, even with an empty/garbage provider key", () => {
    assert.doesNotThrow(() => reportProviderResult("", "ok"));
    assert.doesNotThrow(() => reportProviderResult("some-unknown-provider-xyz", "error", "x".repeat(10_000)));
    assert.doesNotThrow(() => reportProviderResult("unknown", "ok" as any));
  });

  it("getProviderHealth surfaces an unreported-but-runtime-only provider defensively (should not happen in practice)", () => {
    reportProviderResult("totally-unknown-provider", "ok");
    const entry = getProviderHealth().find((e) => e.provider === "totally-unknown-provider");
    assert.ok(entry, "an unknown provider that reported should still show up");
    assert.equal(entry!.status, "ok");
    assert.equal(entry!.configured, true); // no static entry to derive `configured` from — defaults true
  });

  it("configured() reflects the real env var, matching the service's own gate", () => {
    const prevKey = process.env.PEXELS_API_KEY;
    try {
      delete process.env.PEXELS_API_KEY;
      assert.equal(getProviderHealth().find((e) => e.provider === "pexels")!.configured, false);
      process.env.PEXELS_API_KEY = "test-key";
      assert.equal(getProviderHealth().find((e) => e.provider === "pexels")!.configured, true);
    } finally {
      if (prevKey === undefined) delete process.env.PEXELS_API_KEY;
      else process.env.PEXELS_API_KEY = prevKey;
    }
  });

  it("wegotrip is always configured (public API, no key gate)", () => {
    assert.equal(getProviderHealth().find((e) => e.provider === "wegotrip")!.configured, true);
  });

  it("results are sorted by provider key for a stable admin panel", () => {
    const entries = getProviderHealth();
    const keys = entries.map((e) => e.provider);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(keys, sorted);
  });
});
