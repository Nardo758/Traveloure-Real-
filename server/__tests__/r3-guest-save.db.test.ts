/**
 * Round 3, lane R3-1 — the guest save rail (ledger `2026-11-05-r3-guest-save`).
 *
 *   R1  R3-1: a save answers 200 with the stored item — a new one and one the plan already held — and names where it
 *       spent its time (`Server-Timing`); "no plan yet" is 200 with null, never a 404.
 *   R2  R3-2: an event is named by its Fever event id. A cached row answers; a row the cache does not hold is looked up
 *       at Fever by that same id and saved; an id neither knows is refused (400 unknown_source).
 *   R3  R3-3: an occasion door on an existing guest plan updates THAT plan in place — occasion slug, coarse type through
 *       the slug map, the door's dates and title — and keeps its items. Still one plan; a door with no occasion
 *       answers the plan as it stands.
 *   R4  R3-4: a plan whose party the door did not state starts at two adults; a stated party wins.
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/r3-guest-save.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import guestPlansRoutes from "../routes/guest-plans.routes";
import { setFeverEventLookupForTests } from "../services/guest-item-source.service";
import { eventTypeForSlug } from "@shared/occasions";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tripIds = new Set<string>();
let gemId = "";
let priorMode: string | null = null;

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = ((r as any).rows?.[0]?.setting_value as string | undefined) ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', 'waitlist')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'waitlist'`);
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  const g = await db.execute(sql`SELECT id FROM travel_pulse_hidden_gems WHERE city ILIKE 'kyoto' AND latitude IS NOT NULL LIMIT 1`);
  gemId = String((g as any).rows?.[0]?.id ?? "");
});

after(async () => {
  setFeverEventLookupForTests(null);
  const t = Array.from(tripIds);
  if (t.length) await db.delete(trips).where(inArray(trips.id, t));
  if (priorMode === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${priorMode} WHERE setting_key = 'traveler_signup_mode'`);
});

/** A browser: keeps the guest cookie between calls. */
function guest() {
  let cookie = "";
  return async (method: "GET" | "POST" | "PATCH", path: string, body?: unknown) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => false;
      next();
    });
    app.use(guestPlansRoutes);
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const json = await res.json().catch(() => undefined);
      if ((json as any)?.plan?.id) tripIds.add((json as any).plan.id);
      return { status: res.status, json: json as any, timing: res.headers.get("server-timing") };
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  };
}

describe("Round 3 guest save rail", () => {
  it("R1 a save answers 200 with its item and its timing; no plan yet is 200 null", async () => {
    const call = guest();
    const none = await call("GET", "/api/guest-plans/current");
    assert.equal(none.status, 200);
    assert.equal(none.json, null);
    await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan" });
    assert.ok(gemId, "a located Kyoto gem exists");
    const first = await call("POST", "/api/guest-plans/current/items", { kind: "gem", sourceId: gemId, dayNumber: 1 });
    assert.equal(first.status, 200);
    assert.equal(first.json.existing, false);
    assert.equal(first.json.item.id, first.json.id, "the stored item comes back");
    assert.equal(first.json.item.dayNumber, 1);
    assert.match(first.timing ?? "", /plan;dur=\d+, resolve;dur=\d+, write;dur=\d+, read;dur=\d+/);
    const again = await call("POST", "/api/guest-plans/current/items", { kind: "gem", sourceId: gemId, dayNumber: 1 });
    assert.equal(again.status, 200);
    assert.equal(again.json.existing, true);
    assert.equal(again.json.id, first.json.id);
    const view = await call("GET", "/api/guest-plans/current");
    assert.equal(view.json.items.length, 1);
    const patch = await call("PATCH", "/api/guest-plans/current", { adults: 3 });
    assert.match(patch.timing ?? "", /update;dur=\d+/);
  });

  it("R2 an event saves by its Fever event id, from the cache or from Fever", async () => {
    const call = guest();
    await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan" });
    const liveId = `r3-live-${crypto.randomUUID().slice(0, 8)}`;
    setFeverEventLookupForTests(async (id) =>
      id === liveId ? { title: "Yoga by the river", venue: { name: "Kamo riverbank", coordinates: { lat: 35.01, lng: 135.77 } } } : null,
    );
    const saved = await call("POST", "/api/guest-plans/current/items", { kind: "event", sourceId: liveId, dayNumber: 1 });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.item.title, "Yoga by the river");
    assert.equal(saved.json.located, true);
    const refused = await call("POST", "/api/guest-plans/current/items", { kind: "event", sourceId: "r3-nowhere", dayNumber: 1 });
    assert.equal(refused.status, 400);
    assert.equal(refused.json.code, "unknown_source");
  });

  it("R3 an occasion door updates the existing guest plan in place and keeps its items", async () => {
    const call = guest();
    const made = await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan" });
    const planId = made.json.plan.id;
    await call("POST", "/api/guest-plans/current/items", { kind: "gem", sourceId: gemId, dayNumber: 1 });
    const door = await call("POST", "/api/guest-plans", {
      destination: "Kyoto, Japan",
      title: "Wedding in Kyoto",
      startDate: "2026-12-04",
      endDate: "2026-12-06",
      occasionSlug: "wedding",
    });
    assert.equal(door.status, 200, "no new plan");
    assert.equal(door.json.plan.id, planId);
    assert.equal(door.json.plan.title, "Wedding in Kyoto");
    assert.equal(door.json.plan.startDate, "2026-12-04");
    assert.equal(door.json.plan.endDate, "2026-12-06");
    assert.equal(door.json.items.length, 1, "items kept");
    const row = await db.execute(sql`SELECT occasion_slug, event_type FROM trips WHERE id = ${planId}`);
    assert.equal((row as any).rows[0].occasion_slug, "wedding");
    assert.equal((row as any).rows[0].event_type, eventTypeForSlug("wedding"));
    const plain = await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan", title: "Kyoto" });
    assert.equal(plain.json.plan.title, "Wedding in Kyoto", "a door with no occasion answers the plan as it stands");
  });

  it("R4 a party nobody stated starts at two adults", async () => {
    const call = guest();
    const made = await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan" });
    assert.equal(made.json.plan.adults, 2);
    assert.equal(made.json.plan.numberOfTravelers, 2);
    const call2 = guest();
    const stated = await call2("POST", "/api/guest-plans", { destination: "Kyoto, Japan", adults: 1 });
    assert.equal(stated.json.plan.adults, 1);
  });
});
