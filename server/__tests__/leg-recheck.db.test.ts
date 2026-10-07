/**
 * Step 9b — the leg re-check (L8 / D5 / D6 / D9) and the routed flag's leg rule (D4). Ledger
 * `2026-10-07-step9b-optimizer-and-rechecks`.
 *
 *   K1  classify: within 10 min ⇒ ok; more ⇒ changed; no_route ⇒ broken; paused ⇒ nothing learned
 *   K2  the banner words: "Travel to X now 31 min (was 18)" / "no transit route now (was 18 min)"
 *   K3  ONE changed leg ⇒ ONE finding and the leg's status — and NO plan rewrite (same row, same minutes)
 *   K4  two runs the same day ⇒ one finding; the second run asks nothing (the claim)
 *   K5  paused ⇒ no status, the claim is put back, no finding; the next run asks again
 *   K6  dates not chosen ⇒ skipped (D9); a free plan ⇒ skipped (R-e) — no adapter call either way
 *   K7  day-of timing: due only in the 06:00 local hour of a trip day; the plan's zone, else its market's
 *   K8  the T-3 job runs the leg pass for each plan and reports its counts
 *   K9  legIsRouted: engine leg; confirmed non-est leg; confirmed straight-line leg is not; no minutes is not
 *   K10 registration: `legs-dayof-recheck` is hourly on the roster, its route runs through `runJob`, and
 *       the cron script's hourly bucket posts it
 *
 * NEGATIVE SPACE (§18d): the adapter is injected (no Maps call); the `/recheck` read and the card's
 * banner are exercised by the Kyoto spec, not here.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/leg-recheck.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { RoutingAdapter } from "@shared/routing-engine";

process.env.STRIPE_SECRET_KEY ||= "sk_test_leg_recheck";
const { db } = await import("../db");
const { classifyLegRecheck, legRecheckLine, LEG_RECHECK_CHANGED_MINUTES } = await import("@shared/leg-recheck");
const { recheckPlanLegs, defaultLegRecheckDeps } = await import("../services/routing/leg-recheck.service");
const { dayofDue } = await import("../jobs/legsDayofRecheck");
const { runFactsRecheck } = await import("../jobs/factsRecheck");
const { legIsRouted } = await import("../services/routing/plan-legs");

const RUN = crypto.randomUUID().slice(0, 8);
const owner = `lrc-${RUN}-owner`;
const plan = `lrc-${RUN}-plan`;
const free = `lrc-${RUN}-free`;
const legId = `lrc-${RUN}-leg`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[leg-recheck] REFUSING to write fixtures to '${host}'.`);
}

/** An adapter answering a fixed outcome, counting its calls. */
function fixedAdapter(answer: { kind: "ok"; min: number } | { kind: "no_route" } | { kind: "paused" }): RoutingAdapter & { calls: number } {
  const a = {
    source: "stub",
    calls: 0,
    async route() {
      a.calls++;
      if (answer.kind === "paused") return { kind: "paused" as const };
      if (answer.kind === "no_route") return { kind: "no_route" as const };
      return { kind: "ok" as const, route: { durationMin: answer.min, distanceM: 3700, line: null, fare: null, provenance: { source: "stub", checkedAt: new Date().toISOString() } } };
    },
  };
  return a;
}

const deps = (adapter: RoutingAdapter) => ({ ...defaultLegRecheckDeps, adapter: () => adapter });
const leg = async () => ((await db.execute(sql`SELECT * FROM transport_legs WHERE id = ${legId}`)) as any).rows[0];
const findings = async () =>
  (((await db.execute(sql`SELECT * FROM notifications WHERE dedupe_key LIKE ${`facts-recheck-leg:${plan}:%`}`)) as any).rows ?? []) as any[];

const input = (over: Partial<Parameters<typeof recheckPlanLegs>[0]> = {}) => ({
  tripId: plan,
  userId: owner,
  destination: "Kyoto, Japan",
  startDate: "2026-11-04",
  timezone: "Asia/Tokyo",
  datesConfirmed: true,
  since: new Date(Date.UTC(2026, 10, 1)),
  checkDate: "2026-11-01",
  now: new Date(Date.UTC(2026, 10, 1, 9)),
  ...over,
});

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'LRC', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, dates_confirmed_at) VALUES
    (${plan}, ${owner}, 'LRC', 'Kyoto, Japan', '2026-11-04', '2026-11-06', 'draft', now()),
    (${free}, ${owner}, 'LRC free', 'Kyoto, Japan', '2026-11-04', '2026-11-06', 'draft', now())`);
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${plan}-pass`}, ${plan}, 'trip_pass', 'active', 'manual')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin) VALUES
    (${`${plan}-a`}, ${plan}, 'Kiyomizu-dera', 'activity', 1, 0, 34.9949, 135.7850, '09:00', '10:30', 'traveler'),
    (${`${plan}-b`}, ${plan}, 'Ginkaku-ji', 'activity', 1, 1, 35.0270, 135.7982, '12:00', NULL, 'traveler')`);
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
      estimated_duration_minutes, proposal_status, source)
    VALUES (${legId}, ${plan}, 1, 1, ${`${plan}-a`}, 'Kiyomizu-dera', 34.9949, 135.7850, ${`${plan}-b`}, 'Ginkaku-ji', 35.0270, 135.7982,
      3700, '3.7 km', 'transit', 18, 'proposed', 'stub')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM notifications WHERE user_id = ${owner}`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${plan}, ${free})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${plan}, ${free})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

test("K1: classify — the 10-minute threshold, no_route, paused", () => {
  assert.equal(LEG_RECHECK_CHANGED_MINUTES, 10);
  assert.equal(classifyLegRecheck(18, { kind: "ok", durationMin: 28 }), "ok");
  assert.equal(classifyLegRecheck(18, { kind: "ok", durationMin: 29 }), "changed");
  assert.equal(classifyLegRecheck(18, { kind: "ok", durationMin: 7 }), "changed");
  assert.equal(classifyLegRecheck(18, { kind: "no_route" }), "broken");
  assert.equal(classifyLegRecheck(18, { kind: "paused" }), null);
});

test("K2: the banner words", () => {
  assert.equal(legRecheckLine({ toName: "Ginkaku-ji", mode: "transit", wasMin: 18, nowMin: 31, status: "changed" }, "8 Nov"), "Travel to Ginkaku-ji now 31 min (was 18) · re-checked 8 Nov");
  assert.equal(legRecheckLine({ toName: "Ginkaku-ji", mode: "transit", wasMin: 18, nowMin: null, status: "broken" }, null), "Travel to Ginkaku-ji: no transit route now (was 18 min)");
});

test("K6: dates not chosen, or a free plan — skipped with no adapter call", async () => {
  const a = fixedAdapter({ kind: "ok", min: 40 });
  assert.equal((await recheckPlanLegs(input({ datesConfirmed: false }), deps(a))).skipped, "dates_not_confirmed");
  assert.equal((await recheckPlanLegs(input({ tripId: free }), deps(a))).skipped, "not_routed");
  assert.equal(a.calls, 0);
});

test("K5: paused — no status, the claim put back, no finding", async () => {
  const a = fixedAdapter({ kind: "paused" });
  const r = await recheckPlanLegs(input(), deps(a));
  assert.equal(r.paused, true);
  assert.equal(r.checked, 0);
  const l = await leg();
  assert.equal(l.leg_check_status, null);
  assert.equal(l.leg_checked_at, null, "the claim was released");
  assert.equal((await findings()).length, 0);
});

test("K3: one changed leg ⇒ one finding and its status; the leg itself is not rewritten", async () => {
  const a = fixedAdapter({ kind: "ok", min: 31 });
  const r = await recheckPlanLegs(input(), deps(a));
  assert.deepEqual({ checked: r.checked, changed: r.changed, broken: r.broken, notified: r.notified }, { checked: 1, changed: 1, broken: 0, notified: 1 });
  const l = await leg();
  assert.equal(l.leg_check_status, "changed");
  assert.ok(l.leg_checked_at);
  assert.equal(Number(l.estimated_duration_minutes), 18, "the plan's minutes are untouched");
  assert.equal(l.recommended_mode, "transit");
  const f = await findings();
  assert.equal(f.length, 1);
  assert.equal(f[0].message, "Travel to Ginkaku-ji now 31 min (was 18)");
  assert.equal(f[0].data.kind, "leg");
  assert.equal(f[0].data.nowMin, 31);
  assert.equal(f[0].data.wasMin, 18);
});

test("K4: a second run the same day asks nothing and writes one finding in all", async () => {
  const a = fixedAdapter({ kind: "ok", min: 31 });
  const r = await recheckPlanLegs(input({ now: new Date(Date.UTC(2026, 10, 1, 10)) }), deps(a));
  assert.equal(a.calls, 0, "the leg was already checked today");
  assert.equal(r.checked, 0);
  assert.equal((await findings()).length, 1);
});

test("K7: day-of — 06:00 local on a trip day only; the plan's zone, else its market's", () => {
  const c = { id: "t", userId: "u", destination: "Kyoto", marketSlug: "kyoto", timezone: "Asia/Tokyo", startDate: "2026-11-04", endDate: "2026-11-06" };
  // 06:10 in Tokyo on 5 Nov = 21:10 UTC on 4 Nov.
  assert.deepEqual(dayofDue(c, new Date(Date.UTC(2026, 10, 4, 21, 10))), { zone: "Asia/Tokyo", date: "2026-11-05", dayNumber: 2 });
  assert.equal(dayofDue(c, new Date(Date.UTC(2026, 10, 4, 22, 10))), null, "07:10 local is not the hour");
  assert.equal(dayofDue(c, new Date(Date.UTC(2026, 10, 6, 21, 10))), null, "7 Nov is after the trip");
  assert.deepEqual(dayofDue({ ...c, timezone: null }, new Date(Date.UTC(2026, 10, 4, 21, 10)))?.zone, "Asia/Tokyo", "the market's zone");
  assert.equal(dayofDue({ ...c, timezone: null, marketSlug: null }, new Date(Date.UTC(2026, 10, 4, 21, 10))), null, "no zone ⇒ never read in UTC");
});

test("K8: the T-3 job runs the leg pass per plan and reports it", async () => {
  const seen: string[] = [];
  const r = await runFactsRecheck(new Date(), {
    candidates: async () => [{ id: plan, userId: owner, destination: "Kyoto", marketSlug: "kyoto", startDate: "2026-11-04", timezone: "Asia/Tokyo", datesConfirmed: true }],
    relookup: async () => undefined,
    findings: async () => [],
    notifyOnce: async () => false,
    legRecheck: async (trip) => {
      seen.push(trip.id);
      return { checked: 2, changed: 1, broken: 0, notified: 1, paused: false };
    },
  });
  assert.deepEqual(seen, [plan]);
  assert.deepEqual(r, { checked: 1, conflicts: 0, notified: 0, failed: 0, legsChecked: 2, legsChanged: 1, legsNotified: 1 });
});

test("K9: legIsRouted — the D4 rule", () => {
  assert.equal(legIsRouted({ source: "google_routes", estimatedDurationMinutes: 20 }), true);
  assert.equal(legIsRouted({ source: null, proposalStatus: "confirmed", estimatedDurationMinutes: 20, recommendedMode: "walking", alternativeModes: [] }), true, "an expert's own minutes");
  assert.equal(
    legIsRouted({ source: null, proposalStatus: "confirmed", estimatedDurationMinutes: 20, recommendedMode: "walking", alternativeModes: [{ mode: "walking", reason: "est." }] }),
    false,
    "a straight-line estimate is not routed",
  );
  assert.equal(legIsRouted({ source: "stub", estimatedDurationMinutes: 0 }), false);
  assert.equal(legIsRouted({ source: null, proposalStatus: "proposed", estimatedDurationMinutes: 20 }), false);
});

test("K10: `legs-dayof-recheck` is registered hourly — roster, route and cron bucket", async () => {
  const { JOB_CADENCE } = await import("../routes/internal.routes");
  assert.deepEqual(JOB_CADENCE.filter((j) => j.job === "legs-dayof-recheck"), [{ job: "legs-dayof-recheck", expectedIntervalSec: 3_600, bucket: "hourly" }]);
  const routes = fs.readFileSync(path.resolve(import.meta.dirname, "../routes/internal.routes.ts"), "utf8");
  assert.match(routes, /router\.post\("\/internal\/jobs\/legs-dayof-recheck", requireInternalSecret,[\s\S]{0,120}runJob\("legs-dayof-recheck", \(\) => runLegsDayofRecheck\(\), \(r\) => !!r\?\.error\)/);
  const cron = fs.readFileSync(path.resolve(import.meta.dirname, "../../scripts/ci/post-internal-jobs.sh"), "utf8");
  assert.match(cron, /\["hourly"\]="[^"]*\blegs-dayof-recheck\b/);
});
