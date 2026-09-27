/**
 * item-comments-write-status.db.test.ts — R150 (ledger `2026-09-27-pending-advisor-no-comments-fix`;
 * implements R139, Locked Decision 12 / §12).
 *
 * A per-item plan comment is a WRITE onto the traveler's plan: it lands a row, and it notifies the
 * other party. `resolveItemCommentRole` (server/routes/booking-actions.ts) granted its expert arm
 * through the §12 READ predicate `isTripAdvisor`, which passes `pending` — so an invited-but-
 * unaccepted advisor could post on the plan they had not yet agreed to work. LD 12: "a PENDING
 * advisor may not write", and read surfaces keep granting `pending`.
 *
 * The ruling applied here, and the READ half is deliberate:
 *   C1  a PENDING advisor's POST is REFUSED 403 (the file's own convention for this rail) and NO
 *       comment row is written — FAILS on the pre-R150 router (it answered 201 and wrote the row)
 *   C2  a PENDING advisor's GET still answers 200 — reading comments is a read surface, and LD 12
 *       keeps `pending` on every read surface (the invited expert reads the plan while deciding)
 *   C3  flipped to ACCEPTED, the same advisor's POST answers 201 and the row lands
 *   C4  ASSIGNED (the admin-confirmed status) posts too — the write list is §12's, not re-typed
 *   C5  a REJECTED advisor can do neither
 *   C6  the trip OWNER still posts — the write gate narrows only the advisor arm
 *
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test --test-force-exit server/__tests__/item-comments-write-status.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";
// Stub every outbound credential so importing the booking-actions router (which pulls the
// Stripe/email service modules) never constructs a live client.
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";
process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.RESEND_API_KEY ??= "re_test_dummy";

const { db, pool } = await import("../db");
const { eq, inArray, sql } = await import("drizzle-orm");
const { users, trips, itineraryItems, tripExpertAdvisors, tripItemComments, notifications } = await import(
  "../../shared/schema"
);
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const bookingActionsRoutes = (await import("../routes/booking-actions")).default;

// ── Disposable-DB guard (house pattern; never defaults open) ──────────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[item-comments-write-status] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

// ── Password + HTTP harness (mirrors expert-note-separation.db.test.ts) ────────

const TEST_PASSWORD = "ItemCmt1Test!";

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, dk) => {
      if (err) return reject(err);
      resolve(`${salt}:${dk.toString("hex")}`);
    });
  });
}

let server: http.Server | null = null;

async function getServer(): Promise<http.Server> {
  if (server) return server;
  const app = express();
  app.use(express.json());
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));
  setupEmailAuth(app);
  // Production mount shape (server/routes.ts): app.use("/api", bookingActionsRoutes)
  app.use("/api", bookingActionsRoutes);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return server;
}

interface HttpResult {
  status: number;
  data: any;
  setCookie?: string;
}

function httpRequest(
  srv: http.Server,
  method: string,
  path: string,
  opts: { body?: object; cookie?: string } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const addr = srv.address() as { port: number };
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Content-Length": bodyStr ? Buffer.byteLength(bodyStr) : 0,
    };
    if (opts.cookie) headers["Cookie"] = opts.cookie;
    const req = http.request({ hostname: "127.0.0.1", port: addr.port, path, method, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => {
        raw += c;
      });
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"]?.find((c) => c.startsWith("connect.sid"))?.split(";")[0];
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw), setCookie });
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

async function loginCookie(srv: http.Server, email: string): Promise<string> {
  const res = await httpRequest(srv, "POST", "/api/auth/login", { body: { email, password: TEST_PASSWORD } });
  assert.equal(res.status, 200, `login must succeed for ${email}`);
  assert.ok(res.setCookie, "login must set a session cookie");
  return res.setCookie!;
}

const RUN = crypto.randomUUID().slice(0, 8);
const ownerId = crypto.randomUUID();
const advisorId = crypto.randomUUID();
const emailOf = (id: string) => `item-cmt-${id.slice(0, 8)}@test.invalid`;
let tripId = "";
let itemId = "";
let advisorRowId = "";

async function setAdvisorStatus(status: string): Promise<void> {
  await db.update(tripExpertAdvisors).set({ status } as any).where(eq(tripExpertAdvisors.id, advisorRowId));
}
async function commentsBy(authorId: string): Promise<number> {
  const rows = await db.select({ id: tripItemComments.id }).from(tripItemComments).where(eq(tripItemComments.authorId, authorId));
  return rows.length;
}
const commentsPath = () => `/api/trips/${tripId}/items/${itemId}/comments`;

describe("R150 — the item-comment WRITE rail requires a §12 WRITE status; a pending advisor reads but cannot post", () => {
  before(async () => {
    await assertDisposableDb();
    const password = await hashPassword(TEST_PASSWORD);
    for (const [id, role, first] of [
      [ownerId, "user", "Owner"],
      [advisorId, "local_expert", "Advisor"],
    ] as const) {
      await db.insert(users).values({ id, email: emailOf(id), firstName: first, lastName: `Cmt${RUN}`, role, password } as any);
    }
    const [trip] = await db
      .insert(trips)
      .values({
        userId: ownerId,
        title: `Item comments ${RUN}`,
        destination: "Kyoto",
        startDate: "2026-10-01",
        endDate: "2026-10-05",
        status: "planning",
      } as any)
      .returning();
    tripId = trip.id;
    const [item] = await db
      .insert(itineraryItems)
      .values({ tripId, title: "Fushimi Inari at dawn", itemType: "activity", dayNumber: 1, status: "in_planning" } as any)
      .returning();
    itemId = item.id;
    const [adv] = await db
      .insert(tripExpertAdvisors)
      .values({ tripId, localExpertId: advisorId, status: "pending" } as any)
      .returning();
    advisorRowId = adv.id;
  });

  after(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await db.delete(tripItemComments).where(eq(tripItemComments.tripId, tripId));
    await db.delete(notifications).where(inArray(notifications.userId, [ownerId, advisorId]));
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    await db.delete(tripExpertAdvisors).where(eq(tripExpertAdvisors.tripId, tripId));
    await db.delete(trips).where(eq(trips.id, tripId));
    await db.delete(users).where(inArray(users.id, [ownerId, advisorId]));
    await pool.end();
  });

  it("C1: a PENDING advisor's POST is refused 403 and NO comment row is written", async () => {
    const srv = await getServer();
    const cookie = await loginCookie(srv, emailOf(advisorId));
    await setAdvisorStatus("pending");
    const res = await httpRequest(srv, "POST", commentsPath(), { body: { body: "can we do this earlier?" }, cookie });
    assert.equal(res.status, 403, "a pending advisor may not write onto the plan (LD 12)");
    assert.equal(await commentsBy(advisorId), 0, "no row may land for a refused write");
  });

  it("C2: a PENDING advisor's GET still answers 200 — reading is a read surface (LD 12 keeps pending)", async () => {
    const srv = await getServer();
    const cookie = await loginCookie(srv, emailOf(advisorId));
    await setAdvisorStatus("pending");
    const res = await httpRequest(srv, "GET", commentsPath(), { cookie });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.comments));
  });

  it("C3: ACCEPTED, the same advisor's POST answers 201 and the row lands", async () => {
    const srv = await getServer();
    const cookie = await loginCookie(srv, emailOf(advisorId));
    await setAdvisorStatus("accepted");
    const res = await httpRequest(srv, "POST", commentsPath(), { body: { body: "moved it to 06:00" }, cookie });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(await commentsBy(advisorId), 1);
  });

  it("C4: ASSIGNED (admin-confirmed) posts too (201) — the write list is §12's own", async () => {
    const srv = await getServer();
    const cookie = await loginCookie(srv, emailOf(advisorId));
    await setAdvisorStatus("assigned");
    const res = await httpRequest(srv, "POST", commentsPath(), { body: { body: "confirmed the slot" }, cookie });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(await commentsBy(advisorId), 2);
  });

  it("C5: a REJECTED advisor can neither read nor post", async () => {
    const srv = await getServer();
    const cookie = await loginCookie(srv, emailOf(advisorId));
    await setAdvisorStatus("rejected");
    const post = await httpRequest(srv, "POST", commentsPath(), { body: { body: "should not land" }, cookie });
    assert.equal(post.status, 403);
    const get = await httpRequest(srv, "GET", commentsPath(), { cookie });
    assert.equal(get.status, 403);
    assert.equal(await commentsBy(advisorId), 2, "unchanged");
  });

  it("C6: the trip OWNER still posts — only the advisor arm narrowed", async () => {
    const srv = await getServer();
    const cookie = await loginCookie(srv, emailOf(ownerId));
    await setAdvisorStatus("pending");
    const res = await httpRequest(srv, "POST", commentsPath(), { body: { body: "thanks!" }, cookie });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(await commentsBy(ownerId), 1);
  });
});
