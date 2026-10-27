/**
 * Row 248 (ledger `2026-10-26-daylegs-routed-flag`): PlanCard's `dayLegs` carries the routed fact and the two
 * stop ids, so the Trip Card hero's leave-by and planned travel read a checked leg. shared/leave-by.ts stays the
 * only minute gate. Behaviour runs on the stored smoke-6 payload (`server/__tests__/fixtures/smoke6-plancard.json`,
 * day 1, Wed 11 Nov 2026, Kyoto), with test-only legs built in the dayLegs shape.
 *
 *   DL1  PlanCardLegData declares the three fields; PlanCardTransport and InlineTransportLegData are unchanged
 *   DL2  the dayLegs mapping carries the three keys, once each, and nothing else new
 *   DL3  a routed leg gives the hero its leave-by
 *   DL4  a routed leg gives the hero its planned travel
 *   DL5  an unrouted leg prints no minutes (new shape and old shape)
 *   DL6  a mixed day: unrouted minutes never enter the sum
 *   DL7  straight-line, zero-minute and transit legs never print a leave-by
 *   DL8  parity with the connector's checked rule
 *   DL9  the one gate is untouched
 *   DL10 no visible string, no new minute reader
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/daylegs-routed-flag.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUpNextInfo, leaveByLegOf } from "../plancard-temporal";
import { LEAVE_BY_COPY, travelPlanned } from "@shared/leave-by";
import { isCheckedTransport } from "@/lib/transport-section-minutes";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const payload = JSON.parse(read("server/__tests__/fixtures/smoke6-plancard.json"));
const TZ = payload.trip.timezone as string;
const stored = payload.days[0];
const DATE = stored.dateIso as string;
const byName = (n: string) => stored.activities.find((a: any) => a.name === n);
const SANNENZAKA = byName("Sannenzaka Street");
const KODAIJI = byName("Kodai-ji Temple");
const GION = byName("Gion District Walking Tour");
const YASAKA = byName("Yasaka Pagoda (Hokanji Temple)");

const ROUTED = { line: null, fare: null, provenance: { source: "osrm", checkedAt: "2026-11-10T00:00:00Z" } };
const day = () => ({
  ...stored,
  activities: stored.activities.map((a: any) =>
    a.id === SANNENZAKA.id ? { ...a, endTime: "11:00" } : a.id === KODAIJI.id ? { ...a, endTime: "13:30" } : a.id === YASAKA.id ? { ...a, endTime: "18:00" } : a,
  ),
});
const morning = new Date(`${DATE}T00:30:00Z`); // 09:30 in Kyoto

/** The dayLegs shape: the keys PlanCard's mapping produces that the leave-by core reads. */
function leg(id: string, from: any, to: any, minutes: number, extra: Record<string, unknown> = {}) {
  return {
    id, legOrder: 1, fromName: from.name, toName: to.name, recommendedMode: "walk", userSelectedMode: null,
    estimatedDurationMinutes: minutes, fromActivityId: from.id, toActivityId: to.id, routed: ROUTED, ...extra,
  };
}
const withoutRouted = (l: Record<string, unknown>) => {
  const { routed: _r, ...rest } = l;
  return rest;
};
const oldShape = (l: Record<string, unknown>) => {
  const { routed: _r, fromActivityId: _f, toActivityId: _t, ...rest } = l;
  return rest;
};
const info = (legs: any[]) => getUpNextInfo(day() as any, legs as any, morning, new Set(), TZ, {} as any);
const rowFor = (legs: any[], stopId: string) => info(legs).leaveByRows.find((r) => r.stopId === stopId)!;
const planned = (legs: any[]) => travelPlanned(legs.map((l) => leaveByLegOf(l, TZ)));

/** PlanCard's dayLegs mapping for the keys this row carries, as it now reads (DL2 pins the source). */
const dayLegsShape = (tr: any) => ({
  id: tr.id,
  legOrder: tr.legOrder ?? 0,
  recommendedMode: tr.recommendedMode ?? tr.mode,
  userSelectedMode: tr.userSelectedMode ?? null,
  estimatedDurationMinutes: tr.estimatedDurationMinutes ?? tr.duration ?? 0,
  mode: tr.mode,
  fromActivityId: tr.fromActivityId ?? null,
  toActivityId: tr.toActivityId ?? null,
  routed: tr.routed,
});

const PLANCARD = read("client/src/components/plancard/PlanCard.tsx");
const TYPES = read("client/src/components/plancard/plancard-types.tsx");
const mappingSlice = () => {
  const start = PLANCARD.indexOf("const dayLegs: PlanCardLegData[]");
  const end = PLANCARD.indexOf(".sort((a, b) => a.legOrder - b.legOrder)", start);
  assert.ok(start > 0 && end > start);
  return PLANCARD.slice(start, end);
};
const interfaceBody = (name: string) => {
  const start = TYPES.indexOf(`export interface ${name}`);
  const end = TYPES.indexOf("\n}\n", start);
  return stripComments(TYPES.slice(start, end));
};
const keysOf = (body: string) => [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);

describe("row 248: dayLegs carries the routed flag and the stop ids", () => {
  it("DL1 PlanCardLegData declares the three fields; PlanCardTransport and InlineTransportLegData are unchanged", () => {
    const body = interfaceBody("PlanCardLegData");
    assert.match(body, /fromActivityId\?: string \| null;/);
    assert.match(body, /toActivityId\?: string \| null;/);
    assert.match(body, /routed\?: PlanCardTransport\["routed"\];/);
    assert.deepEqual(keysOf(body), ["mode", "pickupPoint", "pickupTime", "driverPhone", "rideDetails", "bookingToken", "fromActivityId", "toActivityId", "routed"]);
    assert.match(interfaceBody("PlanCardTransport"), /^\s{2}routed\?: \{ line: string \| null; fare:/m);
    assert.equal(keysOf(interfaceBody("InlineTransportLegData")).includes("routed"), false);
  });

  it("DL2 the dayLegs mapping carries the three keys, once each, and nothing else new", () => {
    const slice = mappingSlice();
    for (const line of ["fromActivityId: tr.fromActivityId ?? null,", "toActivityId: tr.toActivityId ?? null,", "routed: tr.routed,"]) {
      assert.equal(slice.split(line).length - 1, 1, line);
    }
    assert.doesNotMatch(slice, /!!|isCheckedTransport|routedLegBetween|liveTier|authorTip/);
    const keys = [...slice.matchAll(/^ {6}(\w+):/gm)].map((m) => m[1]);
    assert.deepEqual(keys, [
      "id", "legOrder", "fromName", "toName", "recommendedMode", "userSelectedMode", "distanceDisplay", "estimatedDurationMinutes",
      "estimatedCostUsd", "alternativeModes", "fromLat", "fromLng", "toLat", "toLng", "mapsUrl", "mode", "pickupPoint", "pickupTime",
      "driverPhone", "rideDetails", "bookingToken", "fromActivityId", "toActivityId", "routed",
    ]);
  });

  const routedLeg = leg("L-kodaiji", SANNENZAKA, KODAIJI, 12);

  it("DL3 a routed leg gives the hero its leave-by", () => {
    const i = info([routedLeg]);
    const row = i.leaveByRows.find((r) => r.stopId === KODAIJI.id)!;
    assert.equal(row.kind, "leave_by");
    assert.ok(i.heroLeaveBy, "the hero has a leave-by while now is before it");
    assert.equal(i.heroLeaveBy!.stopId, KODAIJI.id);
    assert.equal(leaveByLegOf(routedLeg, TZ)!.routed, true);
  });

  it("DL4 a routed leg gives the hero its planned travel", () => {
    assert.deepEqual(planned([routedLeg]), { minutes: 12, routedOnly: false });
  });

  it("DL5 an unrouted leg prints no minutes (new shape and old shape)", () => {
    for (const l of [withoutRouted(routedLeg), oldShape(routedLeg)]) {
      const row = rowFor([l], KODAIJI.id);
      assert.equal(row.kind, "none");
      if (row.kind === "none") assert.equal(row.reason, "needs_routed_leg");
      assert.equal(info([l]).heroLeaveBy, null);
      assert.equal(planned([l]), null);
    }
    // The old shape, routed or not, is never found by its pair.
    assert.equal(rowFor([oldShape(routedLeg)], KODAIJI.id).kind, "none");
  });

  it("DL6 a mixed day: unrouted minutes never enter the sum", () => {
    const unrouted = withoutRouted(leg("L-gion", KODAIJI, GION, 30));
    assert.deepEqual(planned([routedLeg, unrouted]), { minutes: 12, routedOnly: true });
    const row = rowFor([routedLeg, unrouted], GION.id);
    assert.equal(row.kind, "none");
    if (row.kind === "none") assert.equal(row.reason, "needs_routed_leg");
  });

  it("DL7 straight-line, zero-minute and transit legs never print a leave-by", () => {
    const estimate = withoutRouted(
      leg("L-est", SANNENZAKA, KODAIJI, 9, { alternativeModes: [{ mode: "walk", durationMinutes: 9, costUsd: null, energyCost: 1, reason: "straight_line_est" }] }),
    );
    assert.equal(rowFor([estimate], KODAIJI.id).kind, "none");
    assert.equal(planned([estimate]), null);
    const zero = leg("L-zero", SANNENZAKA, KODAIJI, 0);
    assert.equal(leaveByLegOf(zero, TZ)!.routed, false);
    assert.equal(rowFor([zero], KODAIJI.id).kind, "none");
    assert.equal(planned([zero]), null);
    const transit = leg("L-transit", SANNENZAKA, KODAIJI, 14, { recommendedMode: "transit" });
    assert.deepEqual(rowFor([transit], KODAIJI.id), { kind: "none", stopId: KODAIJI.id, reason: "transit", line: LEAVE_BY_COPY.transit });
  });

  it("DL8 parity with the connector's checked rule", () => {
    const raw = (extra: Record<string, unknown>) => ({
      id: "T", legOrder: 0, from: "a", to: "b", mode: "walk", recommendedMode: "walk", userSelectedMode: null,
      fromActivityId: "a", toActivityId: "b", estimatedDurationMinutes: 12, ...extra,
    });
    const fixtures = [
      raw({ routed: ROUTED }),
      raw({}),
      raw({ fromActivityId: undefined, toActivityId: undefined, from: undefined, to: undefined }),
      raw({ routed: ROUTED, estimatedDurationMinutes: 0 }),
      raw({ routed: ROUTED, recommendedMode: "driving", mode: "driving" }),
    ];
    for (const f of fixtures) {
      assert.equal(isCheckedTransport(f as any), leaveByLegOf(dayLegsShape(f), TZ)!.routed, JSON.stringify(f));
    }
  });

  it("DL9 the one gate is untouched", () => {
    const leaveBy = read("shared/leave-by.ts");
    assert.equal(leaveBy.split("!leg.routed").length - 1, 1);
    assert.match(leaveBy, /present\.filter\(\(l\) => l\.routed &&/);
    assert.deepEqual({ ...LEAVE_BY_COPY }, {
      needsRoutedLeg: "Leave-by needs a routed leg",
      needsRoutedLegDoor: "Add drive and walk times",
      transit: "Transit times in Google Maps",
      notOnMap: "Not on the map yet — no travel time for this stop",
      heroLabel: "LEAVE BY · NEXT",
      travelPlannedLabel: "TRAVEL · PLANNED",
      routedOnly: "routed legs only",
    });
    const hero = read("client/src/components/plancard/UpNextHero.tsx");
    assert.equal(hero.split("{planned.minutes} min").length - 1, 1);
    assert.equal((hero.match(/\} min\b/g) ?? []).length, 1);
    const acts = read("client/src/components/plancard/ActivitiesSection.tsx");
    assert.equal(acts.split("isCheckedTransport(").length - 1, 1);
    assert.equal((acts.match(/\{displayDuration\}m|\{m\.durationMinutes\}m/g) ?? []).length, 2);
  });

  it("DL10 no visible string, no new minute reader", () => {
    const slice = stripComments(mappingSlice());
    // main's two literals (distanceDisplay's and reason's fallback); the three new keys add none.
    assert.deepEqual(slice.match(/"[^"]*"/g) ?? [], ['""', '""']);
    const hero = stripComments(read("client/src/components/plancard/UpNextHero.tsx"));
    assert.equal((hero.match(/estimatedDurationMinutes|\.duration\b/g) ?? []).length, 0);
    const acts = read("client/src/components/plancard/ActivitiesSection.tsx");
    assert.equal((acts.match(/estimatedDurationMinutes|\.duration\b/g) ?? []).length, 2);
    for (const label of [LEAVE_BY_COPY.heroLabel, LEAVE_BY_COPY.travelPlannedLabel, LEAVE_BY_COPY.routedOnly]) {
      assert.ok(!PLANCARD.includes(label), "PlanCard prints none of the hero's labels itself");
    }
  });
});
