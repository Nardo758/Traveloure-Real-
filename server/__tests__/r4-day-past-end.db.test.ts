/**
 * QA round 4 R4-9 — "Wording approved — Leon (t2011u): 'That day is past your plan's last day.' for the R4-9 refusal
 * when a stop's day is past the plan's end."
 *
 *   D1 guest rail: a stop on Day 9 of a 4-day plan is refused `unplaceable` and names `reason: "day_past_plan_end"`
 *   D2 guest rail: a stop inside the plan is not refused for its day
 *   D3 the signed-in rail sends the same reason through the same rule (`dayPastPlanEnd`); the monolith is not mounted
 *      here, so this is a source pin (§18d)
 *
 * Disposable database only; every trip this file creates is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/r4-day-past-end.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import { createGuestPlan, hashGuestSession, saveGuestPlanItem, updateGuestPlan } from "../services/guest-plan.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
const tripIds = new Set<string>();

before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") {
    const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
    if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
  }
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
});

after(async () => {
  const t = Array.from(tripIds);
  if (t.length) await db.delete(trips).where(inArray(trips.id, t));
});

async function fourDayGuestPlan(): Promise<string> {
  const hash = hashGuestSession(crypto.randomUUID())!;
  const out: any = await createGuestPlan(hash, { destination: "Kyoto, Japan" } as any);
  assert.equal(out.ok, true, JSON.stringify(out));
  tripIds.add(out.view.plan.id);
  const view = await updateGuestPlan(hash, { startDate: "2027-03-01", endDate: "2027-03-04" } as any);
  assert.equal(view?.plan.datesConfirmed, true);
  return hash;
}

describe("QA round 4 R4-9 — a stop's day past the plan's end is named", () => {
  it("D1 guest rail: Day 9 of a 4-day plan → unplaceable, reason day_past_plan_end", async () => {
    const hash = await fourDayGuestPlan();
    const out: any = await saveGuestPlanItem(hash, { kind: "gem", source_id: crypto.randomUUID(), city: "Kyoto", placement: { day_number: 9 } } as any);
    assert.deepEqual(out, { ok: false, code: "unplaceable", reason: "day_past_plan_end" });
  });

  it("D2 guest rail: a day inside the plan is not refused for its day", async () => {
    const hash = await fourDayGuestPlan();
    const out: any = await saveGuestPlanItem(hash, { kind: "gem", source_id: crypto.randomUUID(), city: "Kyoto", placement: { day_number: 4 } } as any);
    assert.equal(out.ok, false, "an unknown gem is still refused");
    assert.equal(out.code, "unknown_source");
    assert.equal(out.reason, undefined, "but not as a day past the end");
  });

  it("D3 the signed-in rail and the guest route send the same reason", () => {
    const routes = fs.readFileSync("server/routes.ts", "utf8");
    assert.match(routes, /const dayPastEnd = resolved\.reason === "unplaceable" && dayPastPlanEnd\(chosenDay, planDays\);/);
    assert.match(routes, /\.\.\.\(dayPastEnd \? \{ reason: DAY_PAST_PLAN_END_REASON \} : \{\}\)/);
    const guestRoute = fs.readFileSync("server/routes/guest-plans.routes.ts", "utf8");
    assert.match(guestRoute, /\.\.\.\(out\.reason \? \{ reason: out\.reason \} : \{\}\)/);
  });
});
