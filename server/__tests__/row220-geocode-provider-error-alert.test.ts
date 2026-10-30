/**
 * Row 220 (ledger `2026-10-30-row220-geocode-provider-error-alert`): a made geocode call that fails alerts staff once
 * per UTC day, through the same digest-plus-staff path as the cap alert. Cap-refused lookups are not counted.
 *
 *   E1  a made call that fails fires the provider-error hook; two failures on one UTC day write one digest
 *       and one staff row per admin, with the approved sentence
 *   E2  a gate refusal (paused under or at the cap, disabled, no key) makes no call and fires no provider-error
 *       hook; an unreadable or zero count sends nothing
 *   E3  the default count is mapsSpendToday's `failed` for `geocode` (api_usage_logs, success = false), and a
 *       logged failed geocode row moves it by exactly one (needs DATABASE_URL)
 *   E4  the cap alert is unchanged: same sentence, same type, same dedupe key
 *   E5  the client keeps no copy of the alert
 *
 * Run: npx tsx --test --test-force-exit server/__tests__/row220-geocode-provider-error-alert.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { geocodeAddressDetailed, type GeocodeDetailedDeps } from "../utils/geocode";
import {
  GEOCODE_CAP_DIGEST_TYPE,
  GEOCODE_CAP_STAFF_TYPE,
  GEOCODE_PROVIDER_ERROR_DIGEST_TYPE,
  GEOCODE_PROVIDER_ERROR_STAFF_TYPE,
  geocodeCapAlertMessage,
  geocodeProviderErrorAlertMessage,
  recordGeocodeCapAlert,
  recordGeocodeProviderErrorAlert,
  type GeocodeCapDigestRow,
  type GeocodeCapStaffRow,
  type GeocodeProviderErrorAlertDeps,
} from "../services/geocode-cap-alert.service";

function harness(opts: { refused?: "disabled" | "no_api_key" | "paused"; cap?: number; used?: number | null; fail?: boolean }) {
  let fetchCalls = 0;
  let providerErrors = 0;
  let capAlerts = 0;
  const deps: GeocodeDetailedDeps = {
    gate: async (call) => (opts.refused ? { refused: opts.refused } : call("test-key")),
    fetchImpl: (async () => {
      fetchCalls += 1;
      if (opts.fail) throw new Error("network down");
      return { ok: true, status: 200, json: async () => ({ status: "ZERO_RESULTS", results: [] }) } as Response;
    }) as typeof fetch,
    dailyCap: () => opts.cap ?? 10,
    countToday: async () => (opts.used === undefined ? 0 : opts.used),
    onCapReached: async () => { capAlerts += 1; },
    onProviderError: async () => { providerErrors += 1; },
  };
  return { deps, fetchCalls: () => fetchCalls, providerErrors: () => providerErrors, capAlerts: () => capAlerts };
}

function alertDeps(failed: number | null, admins = ["admin-a", "admin-b"]) {
  const digests: GeocodeCapDigestRow[] = [];
  const staff: GeocodeCapStaffRow[] = [];
  const deps: GeocodeProviderErrorAlertDeps = {
    alreadyRecordedToday: async () => digests.length > 0,
    writeDigest: async (row) => { digests.push(row); },
    adminUserIds: async () => admins,
    writeStaff: async (row) => { staff.push(row); },
    failedToday: async () => failed,
  };
  return { deps, digests, staff };
}

const NOW = new Date("2026-10-30T15:00:00Z");

describe("row 220 geocode provider-error alert", () => {
  it("E1 a made call that fails alerts once per UTC day", async () => {
    const h = harness({ fail: true });
    const out = await geocodeAddressDetailed("Kyoto Station", h.deps);
    assert.deepEqual(out, { ok: false, reason: "provider_error", results: [] });
    assert.equal(h.fetchCalls(), 1);
    assert.equal(h.providerErrors(), 1);
    assert.equal(h.capAlerts(), 0);

    const a = alertDeps(2);
    await recordGeocodeProviderErrorAlert({ now: NOW }, a.deps);
    await recordGeocodeProviderErrorAlert({ now: NOW }, a.deps);
    assert.equal(a.digests.length, 1);
    assert.equal(a.digests[0].type, GEOCODE_PROVIDER_ERROR_DIGEST_TYPE);
    assert.equal(a.digests[0].reason, "provider_error");
    assert.equal(a.digests[0].message, "Map lookups failed today: 2 provider errors.");
    assert.equal(geocodeProviderErrorAlertMessage(2), "Map lookups failed today: 2 provider errors.");
    assert.equal(a.staff.length, 2);
    assert.deepEqual(a.staff.map((r) => r.dedupeKey), [
      "maps-geocode-provider-error:2026-10-30:admin-a",
      "maps-geocode-provider-error:2026-10-30:admin-b",
    ]);
    for (const r of a.staff) assert.equal(r.type, GEOCODE_PROVIDER_ERROR_STAFF_TYPE);
  });

  it("E2 a gate refusal makes no call and fires no provider-error alert", async () => {
    for (const opts of [
      { refused: "paused" as const, cap: 10, used: 3 },
      { refused: "paused" as const, cap: 10, used: 10 },
      { refused: "paused" as const, cap: 10, used: null },
      { refused: "disabled" as const },
      { refused: "no_api_key" as const },
    ]) {
      const h = harness(opts);
      await geocodeAddressDetailed("Kyoto Station", h.deps);
      assert.equal(h.fetchCalls(), 0, JSON.stringify(opts));
      assert.equal(h.providerErrors(), 0, JSON.stringify(opts));
    }
    for (const failed of [null, 0]) {
      const a = alertDeps(failed);
      await recordGeocodeProviderErrorAlert({ now: NOW }, a.deps);
      assert.equal(a.digests.length + a.staff.length, 0, String(failed));
    }
  });

  it("E3 the count is the failed geocode rows logged today", { skip: !process.env.DATABASE_URL }, async () => {
    const { mapsSpendToday } = await import("../services/maps-billing/maps-billing.service");
    const { db, pool } = await import("../db");
    const { apiUsageLogs } = await import("@shared/schema");
    const { MAPS_USAGE_PROVIDER } = await import("@shared/maps-billing");
    const { eq } = await import("drizzle-orm");
    const failedNow = async () => (await mapsSpendToday())!.find((r) => r.caller === "geocode")!.failed;
    const before = await failedNow();
    const [row] = await db.insert(apiUsageLogs).values({
      provider: MAPS_USAGE_PROVIDER,
      endpoint: "geocode",
      operation: "geocoding",
      requestCount: 1,
      estimatedCostCents: 0,
      costPerCallCents: 0,
      success: false,
      errorMessage: "row220 synthetic failure",
      resultCount: 0,
    } as any).returning({ id: apiUsageLogs.id });
    try {
      assert.equal(await failedNow(), before + 1);
    } finally {
      await db.delete(apiUsageLogs).where(eq(apiUsageLogs.id, row.id));
      await pool.end().catch(() => undefined);
    }
  });

  it("E4 the cap alert is unchanged", async () => {
    assert.equal(
      geocodeCapAlertMessage(10, 10),
      "Google geocode daily cap reached (10 of 10 calls, MAPS_GEOCODE_DAILY_CAP). Custom-location placement is refusing with cap_reached until the next UTC day.",
    );
    const digests: GeocodeCapDigestRow[] = [];
    const staff: GeocodeCapStaffRow[] = [];
    await recordGeocodeCapAlert({ used: 10, cap: 10, now: NOW }, {
      alreadyRecordedToday: async () => false,
      writeDigest: async (r) => { digests.push(r); },
      adminUserIds: async () => ["admin-a"],
      writeStaff: async (r) => { staff.push(r); },
    });
    assert.equal(digests[0].type, GEOCODE_CAP_DIGEST_TYPE);
    assert.equal(staff[0].type, GEOCODE_CAP_STAFF_TYPE);
    assert.equal(staff[0].title, "Geocode daily cap reached");
    assert.equal(staff[0].dedupeKey, "maps-geocode-cap:2026-10-30:admin-a");
    const h = harness({ refused: "paused", cap: 10, used: 10 });
    await geocodeAddressDetailed("Kyoto Station", h.deps);
    assert.equal(h.capAlerts(), 1);
    assert.equal(h.providerErrors(), 0);
  });

  it("E5 the client keeps no copy of the alert", () => {
    assert.equal(fs.readFileSync("client/src/lib/custom-pin-refusal.ts", "utf8").includes("Map lookups failed"), false);
  });
});
