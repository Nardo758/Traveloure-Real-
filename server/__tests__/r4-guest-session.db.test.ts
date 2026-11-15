/**
 * QA round 4 R4-1 (Leon, Nov 13, 2026): "Only POST /api/guest-plans mints a guest session (mintNew: false everywhere
 * else); a cookieless GET /current and saved-refs read answer 200 null/empty with no Set-Cookie."
 *
 * Prod: Continue sent the create POST and a page-load GET /current in parallel, both cookieless. Each minted its own
 * guest and set its own cookie; when the GET's cookie landed last, the browser was named by a guest with no plan.
 *
 *   G1 two cookieless requests in parallel (the create and a read): ONE cookie is set, the create's; the read answers
 *      200 null with no Set-Cookie; the create's cookie then reads the plan
 *   G2 a cookieless read AFTER the create: 200 null, no Set-Cookie — the create's cookie still names the plan
 *   G3 a cookieless write (PATCH /current, POST items, DELETE / PATCH an item): 404 not_found, no Set-Cookie
 *   G4 "A place": a create naming only the city → the plan holds on its cookie
 *   G5 "A date + A trip + 40 adults": a create with confirmed dates, the trip occasion and 40 adults → all held
 *   G6 an existing cookie is still refreshed (rolling lifetime) on a read — that is not a mint
 *   G7 cookies off: the header names the guest, as before, and no cookie is set
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/r4-guest-session.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { experienceTypes, trips } from "@shared/schema";
import guestPlansRoutes from "../routes/guest-plans.routes";
import { GUEST_SESSION_COOKIE, readCookie } from "../services/guest-plan.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tripIds = new Set<string>();
const insertedTypeIds: string[] = [];
let priorMode: string | null = null;
let server: Server;
let base = "";

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = ((r.rows?.[0] as any)?.setting_value as string | undefined) ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', 'waitlist')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'waitlist'`);
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  const rows = await db
    .insert(experienceTypes)
    .values({ name: "trip (r4 guest session)", slug: "trip" } as any)
    .onConflictDoNothing({ target: experienceTypes.slug })
    .returning({ id: experienceTypes.id });
  if (rows[0]) insertedTypeIds.push(rows[0].id);
  // ONE server for the whole file, so two requests can be in flight against it together.
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    next();
  });
  app.use(guestPlansRoutes);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  const t = Array.from(tripIds);
  if (t.length) await db.delete(trips).where(inArray(trips.id, t));
  if (insertedTypeIds.length) await db.delete(experienceTypes).where(inArray(experienceTypes.id, insertedTypeIds));
  if (priorMode === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${priorMode} WHERE setting_key = 'traveler_signup_mode'`);
});

type Reply = { status: number; json: any; setCookie: string | null };
async function call(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { cookie?: string; header?: string; cookiesOff?: boolean; body?: unknown } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cookie) headers.Cookie = `${GUEST_SESSION_COOKIE}=${opts.cookie}`;
  // The client sends its localStorage id on every request (queryClient.ts); the server reads it only with cookies off.
  headers["X-Guest-Session"] = opts.header ?? crypto.randomUUID();
  if (opts.cookiesOff) headers["X-Guest-Cookies"] = "off";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null), setCookie: res.headers.get("set-cookie") };
}
const guestCookie = (r: Reply) => readCookie((r.setCookie ?? "").split(",").map((c) => c.split(";")[0]).join("; "), GUEST_SESSION_COOKIE);
const inFuture = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe("QA round 4 R4-1 — only the create mints a guest session", () => {
  it("G1 a create and a read in parallel, both cookieless: one cookie, the create's", async () => {
    const [created, read] = await Promise.all([
      call("POST", "/api/guest-plans", { body: { destination: "Kyoto, Japan" } }),
      call("GET", "/api/guest-plans/current"),
    ]);
    assert.ok(created.status === 201 || created.status === 200, JSON.stringify(created.json));
    tripIds.add(created.json.plan.id);
    assert.equal(read.status, 200);
    assert.equal(read.json, null, "the read names no guest: no plan");
    assert.equal(read.setCookie, null, "the read set no cookie");
    const id = guestCookie(created);
    assert.ok(id, "the create set the guest cookie");
    const again = await call("GET", "/api/guest-plans/current", { cookie: id! });
    assert.equal(again.json?.plan?.id, created.json.plan.id, "the create's cookie names the plan");
  });

  it("G2 a cookieless read after the create sets nothing; the plan stays on its cookie", async () => {
    const created = await call("POST", "/api/guest-plans", { body: { destination: "Kyoto, Japan" } });
    tripIds.add(created.json.plan.id);
    const late = await call("GET", "/api/guest-plans/current");
    assert.equal(late.status, 200);
    assert.equal(late.json, null);
    assert.equal(late.setCookie, null);
    const read = await call("GET", "/api/guest-plans/current", { cookie: guestCookie(created)! });
    assert.equal(read.json?.plan?.id, created.json.plan.id);
  });

  it("G3 a cookieless write names no guest: 404, no cookie", async () => {
    const someId = crypto.randomUUID();
    const replies = await Promise.all([
      call("PATCH", "/api/guest-plans/current", { body: { adults: 2 } }),
      call("POST", "/api/guest-plans/current/items", { body: { kind: "gem", source_id: someId, city: "Kyoto" } }),
      call("DELETE", `/api/guest-plans/current/items/${someId}`),
      call("PATCH", `/api/guest-plans/current/items/${someId}`, { body: { dayNumber: 1 } }),
    ]);
    for (const r of replies) {
      assert.equal(r.status, 404, JSON.stringify(r.json));
      assert.deepEqual(r.json, { code: "not_found" });
      assert.equal(r.setCookie, null);
    }
  });

  it("G4 'A place': a create naming only the city holds on its cookie", async () => {
    const created = await call("POST", "/api/guest-plans", { body: { destination: "Kyoto, Japan", title: "Kyoto trip" } });
    tripIds.add(created.json.plan.id);
    const read = await call("GET", "/api/guest-plans/current", { cookie: guestCookie(created)! });
    assert.equal(read.json?.plan?.destination, "Kyoto, Japan");
  });

  it("G5 'A date + A trip + 40 adults': dates, occasion and party all held", async () => {
    const startDate = inFuture(30);
    const endDate = inFuture(33);
    const [created, racing] = await Promise.all([
      call("POST", "/api/guest-plans", { body: { destination: "Kyoto, Japan", startDate, endDate, adults: 40, occasionSlug: "trip" } }),
      call("GET", "/api/guest-plans/current"),
    ]);
    assert.ok(created.status === 201 || created.status === 200, JSON.stringify(created.json));
    tripIds.add(created.json.plan.id);
    assert.equal(racing.setCookie, null);
    const read = await call("GET", "/api/guest-plans/current", { cookie: guestCookie(created)! });
    const plan = read.json?.plan;
    assert.equal(plan?.id, created.json.plan.id);
    assert.equal(plan?.startDate, startDate);
    assert.equal(plan?.endDate, endDate);
    assert.equal(plan?.datesConfirmed, true);
    assert.equal(plan?.adults, 40);
  });

  it("G6 an existing cookie is refreshed on a read — not a mint", async () => {
    const created = await call("POST", "/api/guest-plans", { body: { destination: "Kyoto, Japan" } });
    tripIds.add(created.json.plan.id);
    const id = guestCookie(created)!;
    const read = await call("GET", "/api/guest-plans/current", { cookie: id });
    assert.equal(guestCookie(read), id, "the same cookie, refreshed");
  });

  it("G7 cookies off: the header names the guest and no cookie is set", async () => {
    const header = crypto.randomUUID();
    const created = await call("POST", "/api/guest-plans", { header, cookiesOff: true, body: { destination: "Kyoto, Japan" } });
    tripIds.add(created.json.plan.id);
    assert.equal(created.setCookie, null);
    const read = await call("GET", "/api/guest-plans/current", { header, cookiesOff: true });
    assert.equal(read.json?.plan?.id, created.json.plan.id);
    const empty = await call("GET", "/api/guest-plans/current", { header: crypto.randomUUID(), cookiesOff: true });
    assert.equal(empty.json, null, "a header id with no plan: no plan, as before");
  });
});
