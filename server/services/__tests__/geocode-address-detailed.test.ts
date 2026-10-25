/**
 * geocodeAddressDetailed — five typed refusals and a single precise success.
 * The gate and fetch are injected, so this file does not open a database pool.
 *
 * Run: npx tsx --test --test-force-exit server/services/__tests__/geocode-address-detailed.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { geocodeAddressDetailed, type GeocodeDetailedDeps } from "../../utils/geocode";

const geocodeSrc = fs.readFileSync(path.resolve(process.cwd(), "server/utils/geocode.ts"), "utf8");

function googleBody(status: string, results: Array<Record<string, unknown>>) {
  return { status, results };
}

function resultRow(h: { lat: number; lng: number; locationType?: string | null; formattedAddress?: string }) {
  return {
    formatted_address: h.formattedAddress ?? "Somewhere",
    types: ["street_address"],
    geometry: {
      location: { lat: h.lat, lng: h.lng },
      ...(h.locationType === undefined ? {} : { location_type: h.locationType }),
    },
  };
}

function deps(options: {
  payload?: unknown;
  throwFetch?: boolean;
  refused?: "disabled" | "no_api_key" | "paused";
  cap?: number;
  used?: number | null;
  onCapReached?: (info: { used: number | null; cap: number }) => Promise<void>;
}): { deps: GeocodeDetailedDeps; gateCalls: () => number; fetchCalls: () => number } {
  let gateCalls = 0;
  let fetchCalls = 0;
  const fetchImpl = (async () => {
    fetchCalls += 1;
    if (options.throwFetch) throw new Error("network down");
    return { ok: true, status: 200, json: async () => options.payload } as Response;
  }) as typeof fetch;
  const gate: GeocodeDetailedDeps["gate"] = async (call) => {
    gateCalls += 1;
    if (options.refused) return { refused: options.refused };
    return call("test-key");
  };
  return {
    deps: {
      gate,
      fetchImpl,
      dailyCap: () => options.cap ?? 10,
      countToday: async () => (options.used === undefined ? 0 : options.used),
      onCapReached: options.onCapReached ?? (async () => {}),
    },
    gateCalls: () => gateCalls,
    fetchCalls: () => fetchCalls,
  };
}

describe("geocodeAddressDetailed", () => {
  it("returns zero_results for a blank address without calling the gate", async () => {
    const harness = deps({ payload: googleBody("OK", []) });
    const out = await geocodeAddressDetailed("   ", harness.deps);
    assert.deepEqual(out, { ok: false, reason: "zero_results", results: [] });
    assert.equal(harness.gateCalls(), 0);
    assert.equal(harness.fetchCalls(), 0);
  });

  it("returns zero_results when Google reports ZERO_RESULTS", async () => {
    const harness = deps({ payload: googleBody("ZERO_RESULTS", []) });
    const out = await geocodeAddressDetailed("no such place", harness.deps);
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.reason, "zero_results");
    assert.equal(harness.fetchCalls(), 1);
  });

  it("returns zero_results when OK carries no finite coordinates", async () => {
    const harness = deps({
      payload: googleBody("OK", [{ formatted_address: "x", geometry: { location: { lat: "nope", lng: 1 } } }]),
    });
    const out = await geocodeAddressDetailed("bad point", harness.deps);
    assert.deepEqual(out, { ok: false, reason: "zero_results", results: [] });
  });

  it("succeeds for a single ROOFTOP hit and returns that hit", async () => {
    const row = resultRow({ lat: 35.01, lng: 135.77, locationType: "ROOFTOP", formattedAddress: "1 Gion" });
    const harness = deps({ payload: googleBody("OK", [row]) });
    const out = await geocodeAddressDetailed("1 Gion", harness.deps);
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.results.length, 1);
      assert.equal(out.chosen.locationType, "ROOFTOP");
      assert.equal(out.chosen.lat, 35.01);
      assert.equal(out.chosen.lng, 135.77);
      assert.equal(out.chosen.formattedAddress, "1 Gion");
      assert.deepEqual(out.chosen, out.results[0]);
    }
  });

  it("succeeds for a single GEOMETRIC_CENTER hit", async () => {
    const row = resultRow({ lat: 35.02, lng: 135.78, locationType: "GEOMETRIC_CENTER" });
    const harness = deps({ payload: googleBody("OK", [row]) });
    const out = await geocodeAddressDetailed("center", harness.deps);
    assert.equal(out.ok, true);
    if (out.ok) assert.equal(out.chosen.locationType, "GEOMETRIC_CENTER");
  });

  it("returns ambiguous when more than one hit exists, even if one is ROOFTOP", async () => {
    const harness = deps({
      payload: googleBody("OK", [
        resultRow({ lat: 35.01, lng: 135.77, locationType: "ROOFTOP" }),
        resultRow({ lat: 35.02, lng: 135.78, locationType: "APPROXIMATE" }),
      ]),
    });
    const out = await geocodeAddressDetailed("Gion", harness.deps);
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.reason, "ambiguous");
      assert.equal(out.results.length, 2);
    }
  });

  it("returns imprecise when the only hit is not rooftop or geometric center", async () => {
    for (const locationType of ["RANGE_INTERPOLATED", "APPROXIMATE", null] as const) {
      const harness = deps({
        payload: googleBody("OK", [resultRow({ lat: 1, lng: 2, locationType })]),
      });
      const out = await geocodeAddressDetailed("interpolated", harness.deps);
      assert.equal(out.ok, false, String(locationType));
      if (!out.ok) {
        assert.equal(out.reason, "imprecise");
        assert.equal(out.results.length, 1);
        assert.equal(out.results[0].locationType, locationType);
      }
    }
  });

  it("returns cap_reached without calling fetch, and alerts, when the paused gate is the cap", async () => {
    const alerts: Array<{ used: number | null; cap: number }> = [];
    const harness = deps({
      refused: "paused",
      cap: 4,
      used: 4,
      onCapReached: async (info) => {
        alerts.push(info);
      },
    });
    const out = await geocodeAddressDetailed("Kyoto", harness.deps);
    assert.deepEqual(out, { ok: false, reason: "cap_reached", results: [] });
    assert.equal(harness.fetchCalls(), 0);
    assert.deepEqual(alerts, [{ used: 4, cap: 4 }]);
  });

  it("treats cap <= 0 as cap_reached", async () => {
    let alerted = 0;
    const harness = deps({
      refused: "paused",
      cap: 0,
      used: null,
      onCapReached: async () => {
        alerted += 1;
      },
    });
    const out = await geocodeAddressDetailed("Kyoto", harness.deps);
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.reason, "cap_reached");
    assert.equal(alerted, 1);
    assert.equal(harness.fetchCalls(), 0);
  });

  it("returns provider_error and does not alert when paused is an unreadable counter", async () => {
    let alerted = 0;
    const harness = deps({
      refused: "paused",
      cap: 10,
      used: null,
      onCapReached: async () => {
        alerted += 1;
      },
    });
    const out = await geocodeAddressDetailed("Kyoto", harness.deps);
    assert.deepEqual(out, { ok: false, reason: "provider_error", results: [] });
    assert.equal(alerted, 0);
  });

  it("returns provider_error for disabled and no_api_key without alerting", async () => {
    for (const refused of ["disabled", "no_api_key"] as const) {
      let alerted = 0;
      const harness = deps({
        refused,
        onCapReached: async () => {
          alerted += 1;
        },
      });
      const out = await geocodeAddressDetailed("Kyoto", harness.deps);
      assert.equal(out.ok, false);
      if (!out.ok) assert.equal(out.reason, "provider_error");
      assert.equal(alerted, 0);
      assert.equal(harness.fetchCalls(), 0);
    }
  });

  it("returns provider_error when fetch throws or Google status is not OK", async () => {
    const thrown = deps({ throwFetch: true });
    const out = await geocodeAddressDetailed("Kyoto", thrown.deps);
    assert.deepEqual(out, { ok: false, reason: "provider_error", results: [] });

    const denied = deps({ payload: { status: "REQUEST_DENIED", results: [] } });
    const deniedOut = await geocodeAddressDetailed("Kyoto", denied.deps);
    assert.equal(deniedOut.ok, false);
    if (!deniedOut.ok) assert.equal(deniedOut.reason, "provider_error");
  });

  it("keeps a cap refusal when the alert itself throws", async () => {
    const harness = deps({
      refused: "paused",
      cap: 1,
      used: 1,
      onCapReached: async () => {
        throw new Error("alert down");
      },
    });
    const out = await geocodeAddressDetailed("Kyoto", harness.deps);
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.reason, "cap_reached");
  });

  it("leaves geocodeAddress on results[0] with no precision or cap reason of its own", () => {
    const start = geocodeSrc.indexOf("export async function geocodeAddress(");
    const end = geocodeSrc.indexOf("function hitsFromPayload");
    const body = geocodeSrc.slice(start, end);
    assert.match(body, /results\?\.\[0\]/);
    assert.match(body, /return "refused" in out \? null : out\.value/);
    assert.doesNotMatch(body, /ROOFTOP/);
    assert.doesNotMatch(body, /GEOMETRIC_CENTER/);
    assert.doesNotMatch(body, /cap_reached/);
    assert.doesNotMatch(geocodeSrc, /\b1000\b/);
    assert.match(geocodeSrc, /mapsCallerDailyCap\("geocode"\)/);
    const detailedStart = geocodeSrc.indexOf("export async function geocodeAddressDetailed");
    const detailed = geocodeSrc.slice(detailedStart);
    assert.doesNotMatch(detailed, /"ROOFTOP"/);
    assert.doesNotMatch(detailed, /"GEOMETRIC_CENTER"/);
    assert.match(detailed, /isPreciseGeocodeLocationType/);
  });
});
