/**
 * 9b-d — `routing-recheck`: one service, two triggers, one guard (9b spec v1.0 §6 9b-d; 9b-0 ruling 4,
 * which retires `legs-dayof-recheck`). Pure: every database read is an injected dep.
 *
 *   RR1  due: the scheduled trigger only in the 06:00 local hour on a trip day; the first-open trigger any
 *        hour from 06:00 on a trip day, never before 06:00, never off the trip; no zone ⇒ never due
 *   RR2  the guard: the day split into `routing_recheck_max_per_plan_day` windows from local midnight —
 *        1 ⇒ the whole day; 2 ⇒ midnight and noon; a bad value reads as 1
 *   RR3  the scheduled run re-checks only the due plan, with the window start as `since`, and tallies
 *   RR4  the first-open run: one plan, due ⇒ the pass; not due, not a candidate, or a throw ⇒ null, no throw
 *   RR5  both triggers share ONE guard: the 06:00 tick asks once; the card's first open after it asks
 *        nothing; a second open asks nothing; with the card opened first, the tick asks nothing
 *   RR6  a failed run keeps the label: an unanswered `no_route` (failed) releases the claim, writes no
 *        status and no finding, and stops the pass; an unsupported mode (OSRM and transit) skips that leg
 *        only; a plain `no_route` (the source's own answer) is still "broken"
 *   RR7  config: ROUTING_RECHECK_MAX_PER_PLAN_DAY — a positive integer, else the default (1)
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { RouteOutcome, RoutingAdapter } from "@shared/routing-engine";

process.env.STRIPE_SECRET_KEY ||= "sk_test_routing_recheck";
const { routingRecheckDue, routingRecheckSince, runRoutingRecheck, runRoutingRecheckOnOpen } = await import("../jobs/routingRecheck");
const { recheckPlanLegs } = await import("../services/routing/leg-recheck.service");
const { routingRecheckMaxPerPlanDay } = await import("../config/routing-recheck.config");
type Candidate = Parameters<typeof routingRecheckDue>[0];
type RecheckLeg = Awaited<ReturnType<Parameters<typeof recheckPlanLegs>[1] extends infer D ? (D extends { legs: (t: string) => infer R } ? () => R : never) : never>>[number];

const KYOTO: Candidate = { id: "plan-1", userId: "u1", destination: "Kyoto", marketSlug: "kyoto", timezone: "Asia/Tokyo", startDate: "2026-11-04", endDate: "2026-11-06" };
/** Tokyo local wall clock on a November day → the UTC instant (Tokyo is UTC+9, no DST). */
const tokyo = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, day, h - 9, m));

test("RR1: due — scheduled at 06:00 local only; first open from 06:00; trip days only; no zone never", () => {
  assert.deepEqual(routingRecheckDue(KYOTO, tokyo(5, 6, 10), "scheduled"), { zone: "Asia/Tokyo", date: "2026-11-05", dayNumber: 2 });
  assert.equal(routingRecheckDue(KYOTO, tokyo(5, 7, 10), "scheduled"), null, "07:10 is not the scheduled hour");
  assert.deepEqual(routingRecheckDue(KYOTO, tokyo(5, 14, 0), "first_open")?.dayNumber, 2, "an afternoon open is due");
  assert.equal(routingRecheckDue(KYOTO, tokyo(5, 5, 59), "first_open"), null, "before 06:00 the tick is still to come");
  assert.equal(routingRecheckDue(KYOTO, tokyo(7, 9, 0), "first_open"), null, "after the trip");
  assert.equal(routingRecheckDue(KYOTO, tokyo(3, 9, 0), "first_open"), null, "before the trip");
  assert.equal(routingRecheckDue({ ...KYOTO, timezone: null, marketSlug: null }, tokyo(5, 9, 0), "first_open"), null, "no zone ⇒ never read in UTC");
  assert.deepEqual(routingRecheckDue(KYOTO, tokyo(5, 6, 10)), routingRecheckDue(KYOTO, tokyo(5, 6, 10), "scheduled"), "scheduled is the default");
});

test("RR2: the guard — windows from local midnight", () => {
  const midnight = tokyo(5, 0);
  assert.equal(routingRecheckSince(midnight, tokyo(5, 15), 1).getTime(), midnight.getTime());
  assert.equal(routingRecheckSince(midnight, tokyo(5, 9), 2).getTime(), midnight.getTime(), "morning window");
  assert.equal(routingRecheckSince(midnight, tokyo(5, 15), 2).getTime(), tokyo(5, 12).getTime(), "afternoon window");
  for (const bad of [0, -1, 1.5, Number.NaN]) assert.equal(routingRecheckSince(midnight, tokyo(5, 15), bad).getTime(), midnight.getTime(), String(bad));
});

function jobDeps(over: Partial<Parameters<typeof runRoutingRecheck>[1]> = {}) {
  const calls: Array<Parameters<typeof recheckPlanLegs>[0]> = [];
  const deps = {
    candidates: async () => [KYOTO, { ...KYOTO, id: "plan-2", startDate: "2026-12-01", endDate: "2026-12-03" }],
    candidate: async (id: string) => (id === KYOTO.id ? KYOTO : null),
    recheck: (async (input: Parameters<typeof recheckPlanLegs>[0]) => {
      calls.push(input);
      return { checked: 2, changed: 1, broken: 0, notified: 1, paused: false };
    }) as typeof recheckPlanLegs,
    maxPerPlanDay: () => 1,
    ...over,
  };
  return { deps, calls };
}

test("RR3: the scheduled run — only the due plan, since = the window start, tallied", async () => {
  const { deps, calls } = jobDeps();
  const r = await runRoutingRecheck(tokyo(5, 6, 10), deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tripId, "plan-1");
  assert.equal(calls[0].dayNumber, 2);
  assert.equal(calls[0].since.getTime(), tokyo(5, 0).getTime());
  assert.equal(calls[0].checkDate, "2026-11-05");
  assert.deepEqual(r, { considered: 2, rechecked: 1, legsChecked: 2, legsChanged: 1, legsNotified: 1, failed: 0 });
  const scanFail = await runRoutingRecheck(tokyo(5, 6, 10), { ...deps, candidates: async () => Promise.reject(new Error("db down")) });
  assert.equal(scanFail.error, "db down", "a failed scan is an error (no success heartbeat)");
});

test("RR4: the first-open run — one plan; not due, unknown or a throw answer null", async () => {
  const { deps, calls } = jobDeps();
  assert.ok(await runRoutingRecheckOnOpen("plan-1", tokyo(5, 9, 30), deps));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].since.getTime(), tokyo(5, 0).getTime());
  assert.equal(await runRoutingRecheckOnOpen("plan-1", tokyo(5, 5, 30), deps), null, "before 06:00");
  assert.equal(await runRoutingRecheckOnOpen("nope", tokyo(5, 9, 30), deps), null, "not a candidate");
  assert.equal(calls.length, 1, "neither asked the pass");
  const boom = jobDeps({ candidate: async () => Promise.reject(new Error("db down")) });
  assert.equal(await runRoutingRecheckOnOpen("plan-1", tokyo(5, 9, 30), boom.deps), null, "never throws into the read");
});

/** An in-memory leg store behind the real `recheckPlanLegs`, so the guard is the real claim rule. */
function memoryPass(outcomes: RouteOutcome[] | ((mode: string) => RouteOutcome)) {
  const legs: RecheckLeg[] = [
    { id: "L1", dayNumber: 2, fromActivityId: "a", toActivityId: "b", toName: "Ginkaku-ji", fromLat: 35, fromLng: 135.78, toLat: 35.02, toLng: 135.79, mode: "drive", wasMin: 18, wallClock: "10:30" },
    { id: "L2", dayNumber: 2, fromActivityId: "b", toActivityId: "c", toName: "Nanzen-ji", fromLat: 35.02, fromLng: 135.79, toLat: 35.01, toLng: 135.79, mode: "walk", wasMin: 12, wallClock: "12:00" },
  ];
  const stamp = new Map<string, Date | null>([["L1", null], ["L2", null]]);
  const status = new Map<string, string>([["L1", "ok"], ["L2", "ok"]]);
  let i = 0;
  const adapter: RoutingAdapter & { calls: number } = {
    source: "stub",
    calls: 0,
    async route(_o, _d, mode) {
      adapter.calls++;
      return typeof outcomes === "function" ? outcomes(mode) : outcomes[Math.min(i++, outcomes.length - 1)];
    },
  };
  const notices: string[] = [];
  const passDeps = {
    adapter: () => adapter,
    qualifies: async () => true,
    legs: async () => legs,
    async claim(id: string, since: Date, at: Date) {
      const prior = stamp.get(id) ?? null;
      if (prior && prior >= since) return { claimed: false as const };
      stamp.set(id, at);
      return { claimed: true as const, prior };
    },
    async release(id: string, at: Date, prior: Date | null) {
      if (stamp.get(id)?.getTime() === at.getTime()) stamp.set(id, prior);
    },
    async writeStatus(id: string, at: Date, s: string) {
      if (stamp.get(id)?.getTime() === at.getTime()) status.set(id, s);
    },
    async notifyOnce(n: { leg: RecheckLeg; status: string }) {
      notices.push(`${n.leg.id}:${n.status}`);
      return true;
    },
  };
  const recheck = ((input: Parameters<typeof recheckPlanLegs>[0]) => recheckPlanLegs(input, passDeps as any)) as typeof recheckPlanLegs;
  return { adapter, stamp, status, notices, recheck };
}

const ok = (min: number): RouteOutcome => ({ kind: "ok", route: { durationMin: min, distanceM: 1000, line: null, fare: null, provenance: { source: "stub", checkedAt: "2026-11-05T00:00:00Z" } } });

test("RR5: both triggers share ONE guard", async () => {
  const m = memoryPass([ok(18)]);
  const { deps } = jobDeps({ recheck: m.recheck });
  await runRoutingRecheck(tokyo(5, 6, 10), deps);
  assert.equal(m.adapter.calls, 2, "the tick asked each leg once");
  await runRoutingRecheckOnOpen("plan-1", tokyo(5, 9, 0), deps);
  await runRoutingRecheckOnOpen("plan-1", tokyo(5, 18, 0), deps);
  assert.equal(m.adapter.calls, 2, "the opens after the tick asked nothing");

  const two = memoryPass([ok(18)]);
  const d3 = jobDeps({ recheck: two.recheck, maxPerPlanDay: () => 2 }).deps;
  await runRoutingRecheck(tokyo(5, 6, 10), d3);
  await runRoutingRecheckOnOpen("plan-1", tokyo(5, 11, 0), d3);
  assert.equal(two.adapter.calls, 2, "max 2: the morning open shares the tick's window");
  await runRoutingRecheckOnOpen("plan-1", tokyo(5, 15, 0), d3);
  await runRoutingRecheckOnOpen("plan-1", tokyo(5, 20, 0), d3);
  assert.equal(two.adapter.calls, 4, "max 2: the afternoon window asks once more, and only once");

  const first = memoryPass([ok(18)]);
  const d2 = jobDeps({ recheck: first.recheck }).deps;
  // The tick was missed on day 2: the first open covers it, and a late tick the next hour… is not the hour.
  await runRoutingRecheckOnOpen("plan-1", tokyo(5, 6, 5), d2);
  await runRoutingRecheck(tokyo(5, 6, 50), d2);
  assert.equal(first.adapter.calls, 2, "the card opened first; the tick in the same window asked nothing");
});

test("RR6: a failed run keeps the label; an unsupported mode skips its leg; a real no-route is broken", async () => {
  const failed = memoryPass([{ kind: "no_route", unanswered: "failed" }]);
  const r = await failed.recheck({ tripId: "plan-1", userId: "u1", destination: "Kyoto", startDate: "2026-11-04", timezone: "Asia/Tokyo", datesConfirmed: true, dayNumber: 2, since: tokyo(5, 0), checkDate: "2026-11-05", now: tokyo(5, 6, 10) });
  assert.equal(r.unavailable, true);
  assert.equal(r.checked, 0);
  assert.equal(failed.adapter.calls, 1, "the pass stopped at the first failure");
  assert.deepEqual([...failed.status.values()], ["ok", "ok"], "labels kept");
  assert.deepEqual([...failed.stamp.values()], [null, null], "claims put back — the next trigger asks again");
  assert.deepEqual(failed.notices, []);

  const mixed = memoryPass((mode) => (mode === "drive" ? { kind: "no_route", unanswered: "unsupported_mode" } : ok(30)));
  const r2 = await mixed.recheck({ tripId: "plan-1", userId: "u1", destination: "Kyoto", startDate: "2026-11-04", timezone: "Asia/Tokyo", datesConfirmed: true, dayNumber: 2, since: tokyo(5, 0), checkDate: "2026-11-05", now: tokyo(5, 6, 10) });
  assert.equal(r2.unsupported, 1);
  assert.equal(r2.checked, 1, "the walk leg was still checked");
  assert.equal(mixed.status.get("L1"), "ok", "the unchecked leg keeps its label");
  assert.equal(mixed.status.get("L2"), "changed");
  assert.equal(mixed.stamp.get("L1"), null);

  const none = memoryPass([{ kind: "no_route" }]);
  const r3 = await none.recheck({ tripId: "plan-1", userId: "u1", destination: "Kyoto", startDate: "2026-11-04", timezone: "Asia/Tokyo", datesConfirmed: true, dayNumber: 2, since: tokyo(5, 0), checkDate: "2026-11-05", now: tokyo(5, 6, 10) });
  assert.equal(r3.broken, 2, "the source's own answer is still a finding");
  assert.deepEqual(none.notices, ["L1:broken", "L2:broken"]);
});

test("RR7: config — a positive integer, else the default", () => {
  const prev = process.env.ROUTING_RECHECK_MAX_PER_PLAN_DAY;
  try {
    delete process.env.ROUTING_RECHECK_MAX_PER_PLAN_DAY;
    assert.equal(routingRecheckMaxPerPlanDay(), 1);
    process.env.ROUTING_RECHECK_MAX_PER_PLAN_DAY = "3";
    assert.equal(routingRecheckMaxPerPlanDay(), 3);
    for (const bad of ["0", "-2", "1.5", "lots"]) {
      process.env.ROUTING_RECHECK_MAX_PER_PLAN_DAY = bad;
      assert.equal(routingRecheckMaxPerPlanDay(), 1, bad);
    }
  } finally {
    if (prev === undefined) delete process.env.ROUTING_RECHECK_MAX_PER_PLAN_DAY;
    else process.env.ROUTING_RECHECK_MAX_PER_PLAN_DAY = prev;
  }
});
