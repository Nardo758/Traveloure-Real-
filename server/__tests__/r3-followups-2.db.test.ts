/**
 * Round 3 follow-ups 2 (ledger `2026-11-05-r3-followups-2`), the event save rail.
 *
 *   F1  R3-17: the events a page LISTED are cached by their exact id (the Impact `CatalogItemId`, the card's
 *       `sourceContentId`), with the venue point and the date — and a later, shorter list never retires them.
 *   F2  R3-17: an event saved from /discover lands on its own day — `scheduled_date` is the event's date in the
 *       market's zone, its day number is that day's place in the plan's window — and with a pin.
 *   F3  An event outside the plan's window keeps its date and lands on the card's day; an unknown id is still
 *       refused (400 unknown_source, never a guessed item).
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/r3-followups-2.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, inArray, like, sql } from "drizzle-orm";
import { db } from "../db";
import { feverEventCache, itineraryItems, trips } from "@shared/schema";
import guestPlansRoutes from "../routes/guest-plans.routes";
import { feverService } from "../services/fever.service";
import { setFeverEventLookupForTests } from "../services/guest-item-source.service";
import { eventPlanPlacement } from "@shared/plan-dates";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tripIds = new Set<string>();
const PREFIX = `r3f2-${crypto.randomUUID().slice(0, 6)}`;
let priorMode: string | null = null;

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = ((r as any).rows?.[0]?.setting_value as string | undefined) ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', 'waitlist')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'waitlist'`);
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
});

after(async () => {
  setFeverEventLookupForTests(null);
  const t = Array.from(tripIds);
  if (t.length) await db.delete(trips).where(inArray(trips.id, t));
  await db.delete(feverEventCache).where(like(feverEventCache.eventId, `${PREFIX}%`));
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


function listedEvent(id: string, startDate: string, point = true) {
  return {
    id,
    title: `Listed ${id}`,
    slug: id,
    category: "experiences",
    venue: { name: "Kamo riverbank", ...(point ? { coordinates: { lat: 35.0116, lng: 135.7681 } } : {}) },
    dates: { startDate, endDate: startDate, sessions: [] },
    pricing: { currency: "JPY" },
    isFree: false,
    isSoldOut: false,
    bookingUrl: "https://example.invalid/e",
  } as any;
}

/** The live catalog is not configured in CI; stand in a Kyoto entry for the one call that needs it. */
async function withKyotoCatalog<T>(fn: () => Promise<T>): Promise<T> {
  const svc = feverService as any;
  const ready = svc.isCatalogReady;
  const find = svc.findCity;
  svc.isCatalogReady = () => true;
  svc.findCity = () => ({ code: "KYO", name: "Kyoto", country: "Japan", countryCode: "JP", timezone: "Asia/Tokyo" });
  try {
    return await fn();
  } finally {
    svc.isCatalogReady = ready;
    svc.findCity = find;
  }
}

describe("Round 3 follow-ups 2 — event save", () => {
  it("F1 listed events are cached by their exact id, and a shorter list never retires them", async () => {
    const a = `${PREFIX}-a`;
    const b = `${PREFIX}-b`;
    const n = await withKyotoCatalog(() =>
      feverService.cacheListedEvents("Kyoto", [listedEvent(a, "2026-11-07T10:00:00Z"), listedEvent(b, "2026-11-08T10:00:00Z")]),
    );
    assert.equal(n, 2);
    await withKyotoCatalog(() => feverService.cacheListedEvents("Kyoto", [listedEvent(b, "2026-11-08T10:00:00Z")]));
    const rows = await db.select().from(feverEventCache).where(like(feverEventCache.eventId, `${PREFIX}%`));
    const ra = rows.find((r) => r.eventId === a);
    assert.ok(ra, "the first listed event is still cached");
    assert.ok(ra!.latitude && ra!.longitude, "with its venue point");
    assert.ok(ra!.startDate, "and its date");
    // Not configured ⇒ nothing is written.
    assert.equal(await feverService.cacheListedEvents("Kyoto", [listedEvent(`${PREFIX}-c`, "2026-11-07T10:00:00Z")]), 0);
  });

  it("F2 an event saved from /discover lands on its own day, with a pin", async () => {
    const id = `${PREFIX}-d`;
    // 2026-11-07 15:00 UTC is 2026-11-08 00:00 in Kyoto — the market's day, not the server's.
    await withKyotoCatalog(() => feverService.cacheListedEvents("Kyoto", [listedEvent(id, "2026-11-07T15:00:00Z")]));
    setFeverEventLookupForTests(async () => null);
    const call = guest();
    await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan", startDate: "2026-11-07", endDate: "2026-11-09" });
    // The card sends what /discover sends: the event's id as `sourceId` and day 1.
    const saved = await call("POST", "/api/guest-plans/current/items", { kind: "event", source_id: id, city: "Kyoto", placement: { day_number: 1 } });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(saved.json.located, true);
    const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, saved.json.id));
    assert.equal(String(row.scheduledDate).slice(0, 10), "2026-11-08");
    assert.equal(row.dayNumber, 2);
    assert.ok(row.latitude != null && row.longitude != null, "the item carries the venue pin");
  });

  it("F3 outside the window the date is kept and the card's day is used; an unknown id is refused", async () => {
    const win = { startDate: "2026-11-07", endDate: "2026-11-09", datesConfirmed: false };
    assert.deepEqual(eventPlanPlacement("2026-12-01", win), { scheduledDate: "2026-12-01", dayNumber: null });
    assert.deepEqual(eventPlanPlacement("2026-11-09", win), { scheduledDate: "2026-11-09", dayNumber: 3 });
    assert.equal(eventPlanPlacement(null, win), null);
    setFeverEventLookupForTests(async () => null);
    const call = guest();
    await call("POST", "/api/guest-plans", { destination: "Kyoto, Japan" });
    const refused = await call("POST", "/api/guest-plans/current/items", { kind: "event", source_id: `${PREFIX}-nowhere`, city: "Kyoto", placement: { day_number: 1 } });
    assert.equal(refused.status, 400);
    assert.equal(refused.json.code, "unknown_source");
  });
});
