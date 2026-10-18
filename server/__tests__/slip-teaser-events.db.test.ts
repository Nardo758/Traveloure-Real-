/**
 * §3.14–3.15 — the free plan's teaser view and its "Add drive and walk times" tap, through the ONE
 * writer `recordSlipEvent` (ledger `2026-10-18-teaser-copy-events`).
 *
 *   T1 the owner's teaser view writes ONE `funnel_events` row at stage SLIP: allowlisted ids/enums, the
 *      server's viewerRole and market
 *   T2 the CTA tap writes its row with surface and viewId only
 *   T3 a stranger is ONE 404 and writes nothing
 *   T4 the client bodies are `.strict()`: an unknown key, a free-text field or a surface off the list fails
 *   T5 past the hourly cap nothing is written
 *   T6 the copy: the free line and the card line read the ruled `LEAVE_BY_COPY.needsRoutedLegDoor`
 *   T7 the client hook counts only days that DRAW a teaser
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/slip-teaser-events.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[slip-teaser] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { recordSlipEvent } = await import("../services/slip-events.service");
const { OptionSetError } = await import("../services/plan-option-sets.service");
const ev = await import("@shared/slip-funnel-events");
const { LEAVE_BY_COPY } = await import("@shared/leave-by");
const { freeFindingsPromptLine } = await import("@shared/optimizer-lead");

const RUN = crypto.randomUUID().slice(0, 8);
const OWNER = `st-${RUN}-owner`;
const STRANGER = `st-${RUN}-stranger`;
const TRIP = `st-${RUN}-trip`;

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES
    (${OWNER}, ${`${OWNER}@traveloure-qa.test`}, 'Teaser', 'Owner'),
    (${STRANGER}, ${`${STRANGER}@traveloure-qa.test`}, 'Teaser', 'Stranger')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, start_date, end_date, destination, market_slug)
    VALUES (${TRIP}, ${OWNER}, 'Teaser plan', '2026-11-11', '2026-11-13', 'Kyoto, Japan', 'kyoto')`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM funnel_events WHERE trip_id = ${TRIP}`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${OWNER}, ${STRANGER})`);
  } finally {
    await pool.end();
  }
});

const rows = async (type: string) =>
  (await db.execute(sql`SELECT user_id, stage, properties FROM funnel_events WHERE trip_id = ${TRIP} AND event_type = ${type}`)).rows as any[];

test("T1 the owner's teaser view writes one SLIP row with allowlisted properties", async () => {
  const out = await recordSlipEvent({
    tripId: TRIP,
    userId: OWNER,
    event: { type: ev.SLIP_LOCAL_TEASER_SHOWN_EVENT, surface: "slip", teaserDays: 2, viewId: "view-1" },
  });
  assert.equal(out.recorded, true);
  const r = await rows(ev.SLIP_LOCAL_TEASER_SHOWN_EVENT);
  assert.equal(r.length, 1);
  assert.equal(r[0].user_id, OWNER);
  assert.equal(r[0].stage, "SLIP");
  const p = typeof r[0].properties === "string" ? JSON.parse(r[0].properties) : r[0].properties;
  assert.deepEqual(
    Object.keys(p).filter((k) => ["surface", "teaserDays", "viewId", "viewerRole", "market"].includes(k)).sort(),
    ["market", "surface", "teaserDays", "viewId", "viewerRole"],
  );
  assert.equal(p.viewerRole, "owner");
  assert.equal(p.market, "kyoto");
  assert.equal(p.teaserDays, 2);
});

test("T2 the CTA tap writes its row with surface and viewId", async () => {
  await recordSlipEvent({ tripId: TRIP, userId: OWNER, event: { type: ev.SLIP_ROUTED_LEGS_CTA_TAPPED_EVENT, surface: "trip_card", viewId: "view-2" } });
  const r = await rows(ev.SLIP_ROUTED_LEGS_CTA_TAPPED_EVENT);
  assert.equal(r.length, 1);
  const p = typeof r[0].properties === "string" ? JSON.parse(r[0].properties) : r[0].properties;
  assert.equal(p.surface, "trip_card");
  assert.equal(p.viewId, "view-2");
  assert.equal(p.teaserDays, undefined);
});

test("T3 a stranger is one 404 and writes nothing", async () => {
  const before = (await rows(ev.SLIP_LOCAL_TEASER_SHOWN_EVENT)).length;
  await assert.rejects(
    recordSlipEvent({ tripId: TRIP, userId: STRANGER, event: { type: ev.SLIP_LOCAL_TEASER_SHOWN_EVENT, surface: "slip", teaserDays: 1, viewId: "v" } }),
    (e: unknown) => e instanceof OptionSetError && e.status === 404,
  );
  assert.equal((await rows(ev.SLIP_LOCAL_TEASER_SHOWN_EVENT)).length, before);
});

test("T4 the bodies are strict: no extra key, no free text, no surface off the list", () => {
  const ok = { type: ev.SLIP_LOCAL_TEASER_SHOWN_EVENT, surface: "slip", teaserDays: 1, viewId: "v" };
  assert.equal(ev.slipLocalTeaserShownBody.safeParse(ok).success, true);
  assert.equal(ev.slipLocalTeaserShownBody.safeParse({ ...ok, title: "Gion walk" }).success, false);
  assert.equal(ev.slipLocalTeaserShownBody.safeParse({ ...ok, surface: "map" }).success, false);
  assert.equal(ev.slipLocalTeaserShownBody.safeParse({ ...ok, teaserDays: 0 }).success, false);
  assert.equal(ev.slipRoutedLegsCtaTappedBody.safeParse({ type: ev.SLIP_ROUTED_LEGS_CTA_TAPPED_EVENT, surface: "trip_card", viewId: "v", userId: OWNER }).success, false);
});

test("T5 past the hourly cap nothing is written", async () => {
  process.env.SLIP_EVENTS_HOURLY_CAP = "1";
  try {
    const out = await recordSlipEvent({ tripId: TRIP, userId: OWNER, event: { type: ev.SLIP_LOCAL_TEASER_SHOWN_EVENT, surface: "trip_card", teaserDays: 1, viewId: "view-3" } });
    assert.equal(out.recorded, false);
    assert.equal((await rows(ev.SLIP_LOCAL_TEASER_SHOWN_EVENT)).length, 1);
  } finally {
    delete process.env.SLIP_EVENTS_HOURLY_CAP;
  }
});

test("T6 the free line reads the ruled 'Add drive and walk times'", async () => {
  assert.equal(LEAVE_BY_COPY.needsRoutedLegDoor, "Add drive and walk times");
  const line = freeFindingsPromptLine([{ kind: "leg_unreachable", count: 2, days: [1], est: true } as any])!;
  assert.match(line, /· Add drive and walk times$/);
  assert.doesNotMatch(line, /Add travel times/);
});

test("T7 the client hook counts only days that draw a teaser", async () => {
  const { teaserDayCount } = await import("../../client/src/lib/slip-funnel-client");
  assert.equal(teaserDayCount([{ localTeaser: { localPicks: 2, localNotes: 0 } }, { localTeaser: null }, {}, { localTeaser: { localPicks: 0, localNotes: 0 } }] as any), 1);
});
