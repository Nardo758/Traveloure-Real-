/**
 * GATE-1B — the server-side guest plan (ledger `2026-11-04-gate1b-guest-plan`; migration 433).
 *
 *   G1  hashGuestSession: a well-formed id hashes to 64 hex chars; malformed / short / long / odd ids are refused.
 *   G2  create → read: the row is owner-less, carries the hash (never the raw id), dates confirmed only when given,
 *       and another session reads nothing.
 *   G3  save: an allowlisted item lands on the plan and moves `updated_at`; a gem save takes the gem row's own name;
 *       an unknown gem is refused; a session with no plan is refused.
 *   G4  update: dates stamp `dates_confirmed_at`; the party total is derived.
 *   G5  claim: user_id set, guest_claimed_at stamped, hash cleared, owner collaborator row written; a second claim
 *       claims nothing; the claimed plan is no longer the guest's.
 *   G6  retention: unset ⇒ disabled, deletes nothing; set ⇒ only unclaimed guest plans idle past N days are deleted
 *       (items cascade); a claimed plan and a fresh plan stay.
 *   G7  the market gate refuses a destination outside the open markets, with no account bypass.
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/guest-plan.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, tripCollaborators, trips, users } from "@shared/schema";
import {
  claimGuestPlans,
  createGuestPlan,
  hashGuestSession,
  readGuestPlan,
  runGuestPlanRetention,
  saveGuestPlanItem,
  updateGuestPlan,
} from "../services/guest-plan.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tripIds = new Set<string>();
const userIds: string[] = [];
const sid = () => crypto.randomUUID();
let kyotoGemId: string | null = null;

async function seedUser(): Promise<string> {
  const id = `gate1b-user-${crypto.randomUUID()}`;
  await db.insert(users).values({ id, email: `${id}@example.test`, role: "user" } as any);
  userIds.push(id);
  return id;
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  const gem = await db.execute(sql`SELECT id FROM travel_pulse_hidden_gems WHERE hidden_at IS NULL LIMIT 1`);
  kyotoGemId = ((gem as any).rows?.[0]?.id as string | undefined) ?? null;
});

after(async () => {
  const ids = Array.from(tripIds);
  if (ids.length) {
    await db.delete(tripCollaborators).where(inArray(tripCollaborators.tripId, ids));
    await db.delete(trips).where(inArray(trips.id, ids));
  }
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  delete process.env.GUEST_PLAN_RETENTION_DAYS;
});

async function newPlan(session: string, extra: Record<string, unknown> = {}) {
  const out = await createGuestPlan(hashGuestSession(session)!, { destination: "Kyoto, Japan", ...extra } as any);
  assert.equal(out.ok, true, JSON.stringify(out));
  const id = (out as any).view.plan.id as string;
  tripIds.add(id);
  return id;
}

describe("GATE-1B guest plan", () => {
  it("G1 hashes only a well-formed guest id", () => {
    const h = hashGuestSession(sid());
    assert.match(h ?? "", /^[0-9a-f]{64}$/);
    assert.equal(hashGuestSession(undefined), null);
    assert.equal(hashGuestSession("short"), null);
    assert.equal(hashGuestSession("x".repeat(200)), null);
    assert.equal(hashGuestSession("abc def ghi jkl"), null);
  });

  it("G2 creates an owner-less plan readable only by its own session", async () => {
    const s = sid();
    const id = await newPlan(s, { startDate: "2027-04-09", endDate: "2027-04-12", adults: 2 });
    const [row] = await db.select().from(trips).where(eq(trips.id, id));
    assert.equal(row.userId, null);
    assert.equal(row.guestSessionHash, hashGuestSession(s));
    assert.notEqual(row.guestSessionHash, s);
    assert.ok(row.datesConfirmedAt);
    assert.equal(row.numberOfTravelers, 2);
    const view = await readGuestPlan(hashGuestSession(s)!);
    assert.equal(view?.plan.id, id);
    assert.equal(await readGuestPlan(hashGuestSession(sid())!), null);

    const undated = await newPlan(sid());
    const [u] = await db.select().from(trips).where(eq(trips.id, undated));
    assert.equal(u.datesConfirmedAt, null);
  });

  it("G3 saves allowlisted items and moves updated_at", async () => {
    const s = sid();
    const id = await newPlan(s);
    await db.update(trips).set({ updatedAt: new Date("2020-01-01T00:00:00Z") }).where(eq(trips.id, id));
    const out = await saveGuestPlanItem(hashGuestSession(s)!, { title: "Philosopher's Path", latitude: "35.02", longitude: "135.79" } as any);
    assert.equal(out.ok, true);
    const [row] = await db.select().from(trips).where(eq(trips.id, id));
    assert.ok(new Date(row.updatedAt!).getFullYear() > 2020);
    const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, id));
    assert.equal(items.length, 1);
    assert.equal(items[0].origin, "traveler");
    if (kyotoGemId) {
      const g = await saveGuestPlanItem(hashGuestSession(s)!, { title: "typed by the client", gemId: kyotoGemId } as any);
      assert.equal(g.ok, true);
      const after = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, id));
      assert.equal(after.length, 2);
      assert.ok(!after.some((i) => i.title === "typed by the client"), "a gem save takes the gem row's name");
    }
    assert.deepEqual(await saveGuestPlanItem(hashGuestSession(s)!, { title: "x", gemId: "no-such-gem" } as any), { ok: false, code: "unknown_gem" });
    assert.deepEqual(await saveGuestPlanItem(hashGuestSession(sid())!, { title: "x" } as any), { ok: false, code: "no_plan" });
  });

  it("G4 updates dates and party", async () => {
    const s = sid();
    const id = await newPlan(s);
    const view = await updateGuestPlan(hashGuestSession(s)!, { startDate: "2027-04-09", endDate: "2027-04-12", adults: 2, kids: 1 } as any);
    assert.equal(view?.plan.datesConfirmed, true);
    const [row] = await db.select().from(trips).where(eq(trips.id, id));
    assert.equal(String(row.startDate), "2027-04-09");
    assert.equal(row.numberOfTravelers, 3);
  });

  it("G5 claims a guest plan once, as-is", async () => {
    const s = sid();
    const id = await newPlan(s);
    await saveGuestPlanItem(hashGuestSession(s)!, { title: "Nishiki Market" } as any);
    const userId = await seedUser();
    assert.deepEqual(await claimGuestPlans(hashGuestSession(s)!, userId), [id]);
    const [row] = await db.select().from(trips).where(eq(trips.id, id));
    assert.equal(row.userId, userId);
    assert.ok(row.guestClaimedAt);
    assert.equal(row.guestSessionHash, null);
    const collab = await db.select().from(tripCollaborators).where(eq(tripCollaborators.tripId, id));
    assert.equal(collab[0]?.role, "owner");
    assert.equal((await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, id))).length, 1);
    assert.deepEqual(await claimGuestPlans(hashGuestSession(s)!, userId), []);
    assert.equal(await readGuestPlan(hashGuestSession(s)!), null);
  });

  it("G6 retention: disabled when unset; deletes only idle unclaimed guest plans when set", async () => {
    delete process.env.GUEST_PLAN_RETENTION_DAYS;
    const stale = await newPlan(sid());
    await saveGuestPlanItem((await db.select().from(trips).where(eq(trips.id, stale)))[0].guestSessionHash!, { title: "x" } as any);
    await db.update(trips).set({ updatedAt: new Date("2020-01-01T00:00:00Z") }).where(eq(trips.id, stale));
    const off = await runGuestPlanRetention();
    assert.equal(off.status, "disabled");
    assert.equal((await db.select().from(trips).where(eq(trips.id, stale))).length, 1);

    const fresh = await newPlan(sid());
    const claimedSession = sid();
    const claimed = await newPlan(claimedSession);
    await claimGuestPlans(hashGuestSession(claimedSession)!, await seedUser());
    await db.update(trips).set({ updatedAt: new Date("2020-01-01T00:00:00Z") }).where(eq(trips.id, claimed));

    process.env.GUEST_PLAN_RETENTION_DAYS = "30";
    const on = await runGuestPlanRetention();
    assert.equal(on.status, "ok");
    assert.equal((await db.select().from(trips).where(eq(trips.id, stale))).length, 0);
    assert.equal((await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, stale))).length, 0);
    assert.equal((await db.select().from(trips).where(eq(trips.id, fresh))).length, 1);
    assert.equal((await db.select().from(trips).where(eq(trips.id, claimed))).length, 1);
    delete process.env.GUEST_PLAN_RETENTION_DAYS;
  });

  it("G7 refuses a market that is not open", async () => {
    const out = await createGuestPlan(hashGuestSession(sid())!, { destination: "Porto, Portugal" } as any);
    assert.equal(out.ok, false);
    assert.equal((out as any).code, "market_not_open");
  });
});
