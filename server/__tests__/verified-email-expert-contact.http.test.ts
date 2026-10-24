/**
 * Row 101 contact gate over the real message routers and the real /ws handler.
 *
 * The test process sets EMAIL_SENDS_ENABLED itself. No CI workflow step is added
 * to boot a flag-on server. While the flag is off, assertTravelerMayContact allows
 * without a user lookup. While it is on, an unverified traveler is refused on the
 * traveler-initiated HTTP contact rails before a message row, a conversation
 * context row, or a notification, and the refusal does not consume a rate-limit
 * bucket. An unverified earner is not refused on reply, accept, or decline, and
 * the websocket chat path does not apply this refusal.
 *
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/verified-email-expert-contact.http.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import { WebSocket } from "ws";
import * as cookieSignature from "cookie-signature";
import { sql } from "drizzle-orm";

process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "ci-test-secret-not-for-production";
process.env.NODE_ENV ??= "test";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_expert_contact_suite";
}

const { db } = await import("../db");
const { users } = await import("../../shared/models/auth");
const { emailVerificationDeniedBody } = await import("../../shared/email-verification-gate");
const { setupAuth } = await import("../replit_integrations/auth/replitAuth");
const { getSession } = await import("../replit_integrations/auth");
const messagesRouter = (await import("../routes/messages")).default;
const conversationsRoutes = (await import("../routes/conversations.routes")).default;
const handoffRoutes = (await import("../routes/handoff.routes")).default;
const serviceQuotesRoutes = (await import("../routes/service-quotes.routes")).default;
const bookingActionsRoutes = (await import("../routes/booking-actions")).default;
const expertInboxRoutes = (await import("../routes/expert-inbox-questions.routes")).default;
const { setupWebSocket } = await import("../websocket");
const { assertTravelerMayContact } = await import("../services/verified-email-action-gate");
const { COLD_CONTACT_MAX, __resetMessageRateLimiter } = await import("../infrastructure/message-rate-limiter");

const priorSends = process.env.EMAIL_SENDS_ENABLED;
const DENIED = emailVerificationDeniedBody();
const RUN = crypto.randomUUID().slice(0, 8);
const SECRET = process.env.SESSION_SECRET!;

const ids = {
  traveler: crypto.randomUUID(),
  verified: crypto.randomUUID(),
  expert: crypto.randomUUID(),
  other: crypto.randomUUID(),
  provider: crypto.randomUUID(),
};
const handle = `vx${RUN}`;
const emails = {
  traveler: `vec-t-${RUN}@t.test`,
  verified: `vec-v-${RUN}@t.test`,
  expert: `vec-e-${RUN}@t.test`,
  other: `vec-o-${RUN}@t.test`,
  provider: `vec-p-${RUN}@t.test`,
};
const sids = {
  traveler: `vec-sess-t-${RUN}`,
  verified: `vec-sess-v-${RUN}`,
  expert: `vec-sess-e-${RUN}`,
  other: `vec-sess-o-${RUN}`,
};

const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

function sessionCookie(sid: string): string {
  const signed = cookieSignature.sign(sid, SECRET);
  return "connect.sid=" + encodeURIComponent("s:" + signed);
}

const cookies = {
  traveler: sessionCookie(sids.traveler),
  verified: sessionCookie(sids.verified),
  expert: sessionCookie(sids.expert),
  other: sessionCookie(sids.other),
};

let server: http.Server;
let wss: ReturnType<typeof setupWebSocket>;
let baseUrl = "";

function setSends(value: string | undefined): void {
  if (value === undefined) delete process.env.EMAIL_SENDS_ENABLED;
  else process.env.EMAIL_SENDS_ENABLED = value;
}

async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "postgres://localhost/traveloure").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!(host !== null && DISPOSABLE.has(host))) {
    throw new Error(`[verified-email-expert-contact] refusing to write fixtures on host '${host ?? "<none>"}'`);
  }
}

async function plantSession(sid: string, userId: string): Promise<void> {
  const sessionPayload = {
    cookie: {
      originalMaxAge: 604800000,
      expires: new Date(Date.now() + 604800000).toISOString(),
      httpOnly: true,
      path: "/",
    },
    passport: { user: { claims: { sub: userId } } },
  };
  await db.execute(sql`
    INSERT INTO sessions (sid, sess, expire)
    VALUES (${sid}, ${JSON.stringify(sessionPayload)}::json, NOW() + interval '1 day')
  `);
}

async function post(path: string, cookie: string | undefined, body: object): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function pairState(senderId: string, recipientId: string): Promise<{ chats: number; notes: number; contexts: number }> {
  const chats = await db.execute(sql`
    SELECT count(*)::int AS n FROM user_and_expert_chats
    WHERE (sender_id = ${senderId} AND receiver_id = ${recipientId})
       OR (sender_id = ${recipientId} AND receiver_id = ${senderId})
  `);
  const notes = await db.execute(sql`
    SELECT count(*)::int AS n FROM notifications
    WHERE user_id IN (${senderId}, ${recipientId})
  `);
  const contexts = await db.execute(sql`
    SELECT count(*)::int AS n FROM conversation_contexts
    WHERE created_by IN (${senderId}, ${recipientId})
  `);
  return {
    chats: (chats.rows[0] as { n: number }).n,
    notes: (notes.rows[0] as { n: number }).n,
    contexts: (contexts.rows[0] as { n: number }).n,
  };
}

function openSocket(cookie: string): Promise<WebSocket> {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${url.port}/ws`, { headers: { Cookie: cookie } });
    const timer = setTimeout(() => reject(new Error("websocket open timed out")), 5000);
    ws.on("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

before(async () => {
  await assertDisposableDb();
  setSends("true");

  await db.insert(users).values([
    {
      id: ids.traveler,
      email: emails.traveler,
      firstName: "Unverified",
      lastName: "Traveler",
      role: "user",
      authProvider: "email",
      emailVerified: null,
      isDeleted: false,
      isSuspended: false,
    },
    {
      id: ids.verified,
      email: emails.verified,
      firstName: "Verified",
      lastName: "Traveler",
      role: "user",
      authProvider: "email",
      emailVerified: new Date(),
      isDeleted: false,
      isSuspended: false,
    },
    {
      id: ids.expert,
      email: emails.expert,
      firstName: "Local",
      lastName: "Expert",
      role: "travel_expert",
      handle,
      authProvider: "email",
      emailVerified: null,
      isDeleted: false,
      isSuspended: false,
    },
    {
      id: ids.other,
      email: emails.other,
      firstName: "Other",
      lastName: "Traveler",
      role: "user",
      authProvider: "email",
      emailVerified: null,
      isDeleted: false,
      isSuspended: false,
    },
    {
      id: ids.provider,
      email: emails.provider,
      firstName: "Service",
      lastName: "Provider",
      role: "service_provider",
      authProvider: "email",
      emailVerified: null,
      isDeleted: false,
      isSuspended: false,
    },
  ]);

  await plantSession(sids.traveler, ids.traveler);
  await plantSession(sids.verified, ids.verified);
  await plantSession(sids.expert, ids.expert);
  await plantSession(sids.other, ids.other);

  const app = express();
  app.use(express.json());
  await setupAuth(app);
  app.use("/api/messages", messagesRouter);
  app.use(conversationsRoutes);
  app.use(handoffRoutes);
  app.use(serviceQuotesRoutes);
  app.use("/api", bookingActionsRoutes);
  app.use(expertInboxRoutes);

  server = http.createServer(app);
  wss = setupWebSocket(server, getSession());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("test server did not bind");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  setSends(priorSends);
  wss?.clients.forEach((client) => client.terminate());
  if (wss) await new Promise<void>((resolve) => wss.close(() => resolve()));
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));

  const idList = [ids.traveler, ids.verified, ids.expert, ids.other, ids.provider];
  const emailList = Object.values(emails);
  await db.execute(sql`
    DELETE FROM content_registry WHERE owner_id IN (${sql.join(idList.map((id) => sql`${id}`), sql`, `)})
  `).catch(() => {});
  await db.execute(sql`
    DELETE FROM notifications WHERE user_id IN (${sql.join(idList.map((id) => sql`${id}`), sql`, `)})
  `).catch(() => {});
  await db.execute(sql`
    DELETE FROM conversation_contexts WHERE created_by IN (${sql.join(idList.map((id) => sql`${id}`), sql`, `)})
  `).catch(() => {});
  await db.execute(sql`
    DELETE FROM user_and_expert_chats
    WHERE sender_id IN (${sql.join(idList.map((id) => sql`${id}`), sql`, `)})
       OR receiver_id IN (${sql.join(idList.map((id) => sql`${id}`), sql`, `)})
  `).catch(() => {});
  await db.execute(sql`
    DELETE FROM email_outbox WHERE to_email IN (${sql.join(emailList.map((email) => sql`${email}`), sql`, `)})
  `).catch(() => {});
  await db.execute(sql`
    DELETE FROM sessions WHERE sid IN (${sql.join(Object.values(sids).map((sid) => sql`${sid}`), sql`, `)})
  `).catch(() => {});
  await db.execute(sql`
    DELETE FROM users WHERE id IN (${sql.join(idList.map((id) => sql`${id}`), sql`, `)})
  `).catch(() => {});
});

test("the query denies only an unverified non-earner writing to an earner", async () => {
  setSends("true");
  assert.equal(await assertTravelerMayContact({ senderId: ids.traveler, recipientId: ids.expert }), "deny");
  assert.equal(await assertTravelerMayContact({ senderId: ids.traveler, recipientId: ids.provider }), "deny");
  assert.equal(await assertTravelerMayContact({ senderId: ids.expert, recipientId: ids.traveler }), "allow");
  assert.equal(await assertTravelerMayContact({ senderId: ids.provider, recipientId: ids.traveler }), "allow");
  assert.equal(await assertTravelerMayContact({ senderId: ids.traveler, recipientId: ids.other }), "allow");
  assert.equal(await assertTravelerMayContact({ senderId: ids.verified, recipientId: ids.expert }), "allow");
  assert.equal(await assertTravelerMayContact({ senderId: crypto.randomUUID(), recipientId: ids.expert }), "deny");
  assert.equal(await assertTravelerMayContact({ senderId: ids.traveler, recipientId: crypto.randomUUID() }), "allow");

  setSends(undefined);
  assert.equal(await assertTravelerMayContact({ senderId: ids.traveler, recipientId: ids.expert }), "allow");
  setSends("false");
  assert.equal(await assertTravelerMayContact({ senderId: ids.traveler, recipientId: ids.expert }), "allow");
  setSends("TRUE");
  assert.equal(await assertTravelerMayContact({ senderId: ids.traveler, recipientId: ids.expert }), "allow");
  setSends("true");
});

test("an unknown conversations/start target stays 404 and an unknown message recipient stays 404", async () => {
  setSends("true");
  const before = await pairState(ids.traveler, ids.expert);
  const missingHandle = await post("/api/conversations/start", cookies.traveler, { handle: `missing${RUN}` });
  assert.equal(missingHandle.status, 404);
  assert.equal(missingHandle.data?.message, "Not found");
  assert.notEqual(missingHandle.data?.code, DENIED.code);

  const missingUser = await post("/api/messages", cookies.traveler, {
    recipientId: crypto.randomUUID(),
    message: "hello",
  });
  assert.equal(missingUser.status, 404);
  assert.notEqual(missingUser.data?.code, DENIED.code);

  const signedOut = await post("/api/messages", undefined, { recipientId: ids.expert, message: "hello" });
  assert.equal(signedOut.status, 401);
  assert.notEqual(signedOut.data?.code, DENIED.code);
  assert.deepEqual(await pairState(ids.traveler, ids.expert), before);
});

test("flag on: unverified traveler to expert is refused on both HTTP rails and writes nothing", async () => {
  setSends("true");
  const before = await pairState(ids.traveler, ids.expert);
  const expertSocket = await openSocket(cookies.expert);
  const frames: any[] = [];
  expertSocket.on("message", (data) => frames.push(JSON.parse(data.toString())));

  const message = await post("/api/messages", cookies.traveler, { recipientId: ids.expert, message: "hello expert" });
  assert.equal(message.status, 403);
  assert.deepEqual(message.data, DENIED);

  const start = await post("/api/conversations/start", cookies.traveler, { handle, about: "hello expert" });
  assert.equal(start.status, 403);
  assert.deepEqual(start.data, DENIED);

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(frames, []);
  assert.equal(expertSocket.readyState, WebSocket.OPEN);
  expertSocket.close();
  assert.deepEqual(await pairState(ids.traveler, ids.expert), before);
});

test("a refused send does not consume the cold-contact bucket", async () => {
  setSends("true");
  const priorSkip = process.env.RATE_LIMIT_LOOPBACK_SKIP;
  delete process.env.RATE_LIMIT_LOOPBACK_SKIP;
  __resetMessageRateLimiter();
  try {
    for (let i = 0; i < COLD_CONTACT_MAX; i += 1) {
      const refused = await post("/api/messages", cookies.traveler, {
        recipientId: ids.expert,
        message: `refused ${i}`,
      });
      assert.equal(refused.status, 403, `refuse ${i}`);
      assert.deepEqual(refused.data, DENIED);
    }
    await db.execute(sql`UPDATE users SET email_verified = NOW() WHERE id = ${ids.traveler}`);
    const allowed = await post("/api/messages", cookies.traveler, {
      recipientId: ids.expert,
      message: "now verified",
    });
    assert.equal(allowed.status, 201, JSON.stringify(allowed.data));
    assert.notEqual(allowed.data?.code, DENIED.code);
    const after = await pairState(ids.traveler, ids.expert);
    assert.equal(after.chats, 1);
    assert.ok(after.notes >= 1);
  } finally {
    if (priorSkip === undefined) delete process.env.RATE_LIMIT_LOOPBACK_SKIP;
    else process.env.RATE_LIMIT_LOOPBACK_SKIP = priorSkip;
    await db.execute(sql`UPDATE users SET email_verified = NULL WHERE id = ${ids.traveler}`);
  }
});

test("traveler to traveler is allowed, and an unverified expert reply is allowed", async () => {
  setSends("true");
  const betweenTravelers = await post("/api/messages", cookies.traveler, {
    recipientId: ids.other,
    message: "hello traveler",
  });
  assert.equal(betweenTravelers.status, 201, JSON.stringify(betweenTravelers.data));

  const reply = await post("/api/messages", cookies.expert, {
    recipientId: ids.traveler,
    message: "hello from the expert",
  });
  assert.equal(reply.status, 201, JSON.stringify(reply.data));
  assert.notEqual(reply.data?.code, DENIED.code);
});

test("flag off: the same unverified traveler to expert is allowed", async () => {
  setSends(undefined);
  const sent = await post("/api/messages", cookies.traveler, {
    recipientId: ids.expert,
    message: "flag off",
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.notEqual(sent.data?.code, DENIED.code);
  setSends("true");
});

test("an unverified earner is not refused on accept, decline, or an inbox reply", async () => {
  setSends("true");
  const missing = crypto.randomUUID();
  const calls: Array<[string, Record<string, unknown>]> = [
    [`/api/handoffs/${missing}/accept`, {}],
    [`/api/handoffs/${missing}/decline`, {}],
    [`/api/expert/assignments/${missing}/accept`, {}],
    [`/api/quotes/${missing}/decline`, {}],
    [`/api/provider/quotes/${missing}/issue`, { amountCents: 1000 }],
    [`/api/provider/quotes/${missing}/withdraw`, {}],
    [`/api/expert/inbox/questions/${missing}/answer`, { answer: "Here is the reply." }],
  ];
  for (const [path, body] of calls) {
    const res = await post(path, cookies.expert, body);
    assert.notEqual(res.status, 403, `${path} ${JSON.stringify(res.data)}`);
    assert.notEqual(res.data?.code, DENIED.code, path);
    assert.notDeepEqual(res.data, DENIED, path);
  }
});

test("websocket chat does not refuse an unverified earner or close the socket", async () => {
  setSends("true");
  await db.execute(sql`UPDATE users SET email_verified = NULL WHERE id = ${ids.expert}`);

  const expertWs = await openSocket(cookies.expert);
  let closed = false;
  expertWs.on("close", () => {
    closed = true;
  });
  const echo = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("expert echo timed out")), 5000);
    expertWs.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chat" || msg.type === "error") {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    expertWs.send(JSON.stringify({
      type: "chat",
      recipientId: ids.other,
      content: "expert reply over the socket",
    }));
  });
  assert.equal(closed, false);
  assert.equal(expertWs.readyState, WebSocket.OPEN);
  expertWs.close();
  assert.equal(echo.type, "chat");
  assert.notEqual(echo.errorCode, "email_verification_required");
  assert.equal(echo.senderId, ids.expert);
  assert.equal(echo.recipientId, ids.other);
});
