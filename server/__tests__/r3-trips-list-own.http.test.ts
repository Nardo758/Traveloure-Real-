/**
 * R3 U5 prerequisite: the no-plan landing decides "does this traveller have a plan?" from the EXISTING
 * `GET /api/trips` (trips.routes.ts:387). This pins that read's contract where the landing depends on it.
 *
 * The self-boot block is copied verbatim from `email-verification-gate.http.test.ts` (same env defaults, same
 * disposable-DB refusal, same request helper): the app is mounted in-process, so the file needs no dev server.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "ci-test-secret-not-for-production";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.NODE_ENV ??= "test";
delete process.env.RESEND_API_KEY;
delete process.env.RATE_LIMIT_LOOPBACK_SKIP;

const { pool } = await import("../db");
const { setupAuth } = await import("../replit_integrations/auth/replitAuth");
const { registerAuthRoutes } = await import("../replit_integrations/auth/routes");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { storage } = await import("../storage");
const tripsRouter = (await import("../routes/trips.routes")).default;

const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
const dbHost = new URL(process.env.DATABASE_URL ?? "postgres://localhost/traveloure").hostname;
if (!DISPOSABLE.has(dbHost)) {
  throw new Error(`[r3-trips-list-own] refusing to write fixtures on non-local host ${dbHost}`);
}

interface Hit {
  status: number;
  data: any;
  setCookie?: string;
}

function request(server: http.Server, method: string, path: string, opts: { body?: object; cookie?: string } = {}): Promise<Hit> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string | number> = {};
    if (bodyStr) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    if (opts.cookie) headers.Cookie = opts.cookie;
    const req = http.request({ hostname: "127.0.0.1", port: addr.port, path, method, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        const rawSet = res.headers["set-cookie"];
        const setCookie = rawSet?.find((c) => c.startsWith("connect.sid"))?.split(";")[0];
        try {
          resolve({ status: res.statusCode ?? 0, data: raw ? JSON.parse(raw) : null, setCookie });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: raw, setCookie });
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

let server: http.Server;
const createdUserIds: string[] = [];

before(async () => {
  const app = express();
  app.use(express.json());
  await setupAuth(app);
  registerAuthRoutes(app);
  setupEmailAuth(app);
  // ONLY the trips router: the list route the landing reads (`api.trips.list.path`).
  app.use(tripsRouter);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end().catch(() => undefined);
});

/** A signed-in traveller, created through the app's own auth routes (same path the landing's user takes). */
async function signIn(label: string): Promise<{ cookie: string; userId: string }> {
  const email = `r3list-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@t.test`;
  const password = "TestPass123!";
  const reg = await request(server, "POST", "/api/auth/register", {
    body: { email, password, firstName: "R3", lastName: label, consent: true },
  });
  assert.ok(reg.status >= 200 && reg.status < 300, `register failed (${reg.status}): ${JSON.stringify(reg.data)}`);
  const login = await request(server, "POST", "/api/auth/login", { body: { email, password } });
  assert.ok(login.setCookie, `sign-in must set a session cookie (${login.status}): ${JSON.stringify(login.data)}`);
  const userId = login.data?.user?.id;
  assert.ok(userId, `sign-in must name the user (${JSON.stringify(login.data)})`);
  createdUserIds.push(userId);
  return { cookie: login.setCookie!, userId };
}

describe("GET /api/trips as the no-plan landing reads it", () => {
  it("refuses a signed-out caller", async () => {
    const res = await request(server, "GET", "/api/trips");
    assert.equal(res.status, 401);
  });

  it("answers an empty array for a fresh account", async () => {
    const actor = await signIn("fresh");
    const res = await request(server, "GET", "/api/trips", { cookie: actor.cookie });
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.data), `expected an array, got ${JSON.stringify(res.data)}`);
    assert.equal(res.data.length, 0);
  });

  it("gives each account only its own plans", async () => {
    const mine = await signIn("mine");
    const theirs = await signIn("theirs");
    await storage.createTrip({ userId: mine.userId, title: `Mine ${mine.userId.slice(0, 6)}`, destination: "Kyoto, Japan", startDate: "2027-04-01", endDate: "2027-04-03" } as any);
    await storage.createTrip({ userId: theirs.userId, title: `Theirs ${theirs.userId.slice(0, 6)}`, destination: "Kyoto, Japan", startDate: "2027-04-01", endDate: "2027-04-03" } as any);

    const mineList = await request(server, "GET", "/api/trips", { cookie: mine.cookie });
    const theirsList = await request(server, "GET", "/api/trips", { cookie: theirs.cookie });
    assert.equal(mineList.status, 200);
    assert.equal(theirsList.status, 200);
    const mineTitles = (mineList.data as Array<{ title?: string }>).map((t) => t.title);
    const theirsTitles = (theirsList.data as Array<{ title?: string }>).map((t) => t.title);
    assert.equal(mineTitles.length, 1);
    assert.equal(theirsTitles.length, 1);
    assert.ok(mineTitles[0]?.startsWith("Mine "), `my list must hold my plan, got ${JSON.stringify(mineTitles)}`);
    assert.ok(theirsTitles[0]?.startsWith("Theirs "), `their list must hold their plan, got ${JSON.stringify(theirsTitles)}`);
  });
});
