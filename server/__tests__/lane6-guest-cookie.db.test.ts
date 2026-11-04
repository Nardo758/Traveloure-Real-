/**
 * Lane 6 — the guest's identity is an httpOnly cookie (ledger `2026-11-05-lane6-guest-cookie`; brief A-10).
 *
 *   C1  The first guest request with no cookie gets an httpOnly guest cookie; that cookie names the same plan after.
 *   C2  A guest whose browser keeps cookies is NOT named by the `X-Guest-Session` header: a request with only the header
 *       is a new guest (a cleared cookie never brings the old plan back — the ruling).
 *   C3  Cookies off (`X-Guest-Cookies: off`): the header id names the guest and no cookie is set.
 *   C4  The claim reads the cookie's guest; with no cookie it reads the body id only when cookies are off; it never mints.
 *   C5  The resolver, pure: cookie, then header-when-cookies-off, then a new id; a malformed cookie is ignored.
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/lane6-guest-cookie.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { tripCollaborators, trips, users } from "@shared/schema";
import guestPlansRoutes from "../routes/guest-plans.routes";
import { GUEST_SESSION_COOKIE, hashGuestSession, readCookie, resolveGuestSessionId } from "../services/guest-plan.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const userId = `lane6-user-${tag}`;
const tripIds = new Set<string>();
let priorMode: string | null = null;

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = ((r.rows?.[0] as any)?.setting_value as string | undefined) ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', 'waitlist')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'waitlist'`);
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  await db.insert(users).values({ id: userId, email: `${userId}@example.test`, role: "user" } as any);
});

after(async () => {
  const t = Array.from(tripIds);
  if (t.length) {
    await db.delete(tripCollaborators).where(inArray(tripCollaborators.tripId, t));
    await db.delete(trips).where(inArray(trips.id, t));
  }
  await db.delete(users).where(eq(users.id, userId));
  if (priorMode === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${priorMode} WHERE setting_key = 'traveler_signup_mode'`);
});

async function call(
  method: "GET" | "POST",
  path: string,
  opts: { cookie?: string; header?: string; cookiesOff?: boolean; body?: unknown; signedIn?: boolean } = {},
): Promise<{ status: number; json: any; setCookie: string | null }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (opts.signedIn) {
      (req as any).user = { claims: { sub: userId } };
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });
  app.use(guestPlansRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.cookie) headers.Cookie = `${GUEST_SESSION_COOKIE}=${opts.cookie}`;
    if (opts.header) headers["X-Guest-Session"] = opts.header;
    if (opts.cookiesOff) headers["X-Guest-Cookies"] = "off";
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    return { status: res.status, json: await res.json().catch(() => null), setCookie: res.headers.get("set-cookie") };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const cookieFrom = (setCookie: string | null) => readCookie((setCookie ?? "").split(";")[0], GUEST_SESSION_COOKIE);

describe("Lane 6 guest cookie", () => {
  it("C1 a new guest gets an httpOnly cookie, and the cookie names the same plan after", async () => {
    const created = await call("POST", "/api/guest-plans", { body: { destination: "Kyoto, Japan" } });
    assert.ok(created.status === 201 || created.status === 200, JSON.stringify(created.json));
    tripIds.add(created.json.plan.id);
    assert.match(created.setCookie ?? "", /HttpOnly/i);
    assert.match(created.setCookie ?? "", /Path=\/api\/guest-plans/);
    const id = cookieFrom(created.setCookie);
    assert.ok(id && hashGuestSession(id));
    const read = await call("GET", "/api/guest-plans/current", { cookie: id! });
    assert.equal(read.status, 200);
    assert.equal(read.json.plan.id, created.json.plan.id);
    assert.equal(cookieFrom(read.setCookie), id, "the same cookie is refreshed, never replaced");
  });

  it("C2 with cookies on, the header alone is a new guest — a cleared cookie does not restore the plan", async () => {
    const header = crypto.randomUUID();
    const off = await call("POST", "/api/guest-plans", { header, cookiesOff: true, body: { destination: "Kyoto, Japan" } });
    tripIds.add(off.json.plan.id);
    const cleared = await call("GET", "/api/guest-plans/current", { header });
    assert.equal(cleared.status, 404, "no cookie, cookies on: a new guest with no plan");
    const minted = cookieFrom(cleared.setCookie);
    assert.ok(minted && minted !== header, "a new cookie, never the header's id");
  });

  it("C3 cookies off: the header names the guest and no cookie is set", async () => {
    const header = crypto.randomUUID();
    const created = await call("POST", "/api/guest-plans", { header, cookiesOff: true, body: { destination: "Kyoto, Japan" } });
    tripIds.add(created.json.plan.id);
    assert.equal(created.setCookie, null);
    const read = await call("GET", "/api/guest-plans/current", { header, cookiesOff: true });
    assert.equal(read.status, 200);
    assert.equal(read.json.plan.id, created.json.plan.id);
  });

  it("C4 the claim reads the cookie's guest, else the body id only with cookies off", async () => {
    const made = await call("POST", "/api/guest-plans", { body: { destination: "Kyoto, Japan" } });
    tripIds.add(made.json.plan.id);
    const id = cookieFrom(made.setCookie)!;
    const claimed = await call("POST", "/api/guest-plans/claim", { cookie: id, body: {}, signedIn: true });
    assert.equal(claimed.status, 200);
    assert.deepEqual(claimed.json.tripIds, [made.json.plan.id]);
    assert.equal(claimed.setCookie, null, "a claim never mints a guest");

    const header = crypto.randomUUID();
    const off = await call("POST", "/api/guest-plans", { header, cookiesOff: true, body: { destination: "Kyoto, Japan" } });
    tripIds.add(off.json.plan.id);
    const refused = await call("POST", "/api/guest-plans/claim", { body: { guestSessionId: header }, signedIn: true });
    assert.equal(refused.status, 400, "cookies on and no cookie: the body id is not the guest");
    const viaBody = await call("POST", "/api/guest-plans/claim", { body: { guestSessionId: header }, cookiesOff: true, signedIn: true });
    assert.deepEqual(viaBody.json.tripIds, [off.json.plan.id]);
  });

  it("C5 the resolver, pure", () => {
    const c = crypto.randomUUID();
    const h = crypto.randomUUID();
    assert.deepEqual(resolveGuestSessionId({ cookie: c, header: h, cookiesOff: true }), { id: c, source: "cookie" });
    assert.deepEqual(resolveGuestSessionId({ cookie: null, header: h, cookiesOff: true }), { id: h, source: "header" });
    assert.deepEqual(resolveGuestSessionId({ cookie: null, header: h, cookiesOff: false }, { mintNew: true, mint: () => "new-guest-id" }), {
      id: "new-guest-id",
      source: "new",
    });
    assert.deepEqual(resolveGuestSessionId({ cookie: "bad!", header: null, cookiesOff: false }, { mintNew: true, mint: () => "n-12345678" }), {
      id: "n-12345678",
      source: "new",
    });
    assert.equal(resolveGuestSessionId({ cookie: null, header: h, cookiesOff: false }, { mintNew: false }), null);
    assert.equal(readCookie(`a=1; ${GUEST_SESSION_COOKIE}=${c}; b=2`, GUEST_SESSION_COOKIE), c);
    assert.equal(readCookie(null, GUEST_SESSION_COOKIE), null);
  });
});
