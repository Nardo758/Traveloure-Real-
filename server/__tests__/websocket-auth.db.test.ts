/**
 * MT-1 / MT-2 — WEBSOCKET SESSION AUTHENTICATION (chat impersonation fix).
 *
 * THE VULNERABILITY (proven live before this fix): `server/websocket.ts` trusted a
 * client-supplied `senderId` on the `join` message with NO session check —
 * `userId = message.senderId`. An unauthenticated raw WebSocket client could write a
 * chat row impersonating any real user and receive messages addressed to any other
 * real user's id.
 *
 * THE FIX: `setupWebSocket(server, sessionMiddleware)` now runs the app's real
 * express-session middleware over the WebSocket upgrade request and resolves identity
 * exclusively from `req.session.passport.user` (the same shape `getUserId` reads for
 * HTTP routes). A connection that doesn't resolve a session user is sent
 * `{type:"error", error:"unauthenticated"}` and closed with code 1008 BEFORE it is ever
 * added to the in-memory `clients` map — so it can never send or receive a message.
 * `message.senderId` is never read for identity anywhere in the file post-fix.
 *
 * This suite boots the REAL `setupWebSocket` (imported, not reimplemented) on an
 * ephemeral HTTP server, with the REAL `getSession()` middleware (imported from
 * `server/replit_integrations/auth`) reading/writing the REAL `sessions` table in the
 * sandbox DB — the same code path production runs. A session row is planted directly
 * (mirroring exactly what `connect-pg-simple`/`express-session` would have stored after
 * a real login: `sess.passport.user = { claims: { sub: <id> } }`), and its signed
 * `connect.sid` cookie is built with the same `cookie-signature` library express-session
 * uses internally, so the handshake is indistinguishable from a real browser's.
 *
 * PROVES, over a real `ws` connection against the real handler:
 *   T1 — a connection with NO session cookie is sent {type:"error"} then closed 1008,
 *        and is NEVER added to `clients` (a "chat" sent immediately after is a no-op —
 *        no message listener exists yet — so ZERO rows are written).
 *   T2 — a connection with a valid session for user A, sending `chat` with a FORGED
 *        `senderId` = user B, persists a `user_and_expert_chats` row with
 *        `sender_id = A` (session wins; forged field ignored).
 *   T3 — that same delivered message leaves exactly one `notifications` row for the
 *        RECIPIENT (MT-2), fired from the shared `storage.createChat` write path.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted
 * in after(). No live session middleware side channel is used other than the sandbox's
 * own `sessions` table.
 *
 * Run solo: DATABASE_URL=postgresql://postgres@127.0.0.1:5433/traveloure npx tsx --test server/__tests__/websocket-auth.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SESSION_SECRET ??= "mt1-suite-test-secret-not-for-production";
// storage.ts (imported transitively by ../websocket) requires stripe.service.ts at
// module load; never actually called by this suite (no money path exercised), same
// posture as the birth-provenance and promotion suites. Must be set BEFORE the imports
// below, which is why it sits between the side-effect-free node:* imports and the rest.
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_websocket_auth_suite";
}

import type { Server } from "http";
import { createServer } from "http";
import { WebSocket } from "ws";
import * as cookieSignature from "cookie-signature";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { setupWebSocket } from "../websocket";
import { getSession } from "../replit_integrations/auth";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  userA: `mt1-${RUN}-a`,
  userB: `mt1-${RUN}-b`,
};
const sid = `mt1-sess-${RUN}`;
const createdChatIds: string[] = [];

// ── Disposable-DB guard (mirrors booking-birth-provenance.db.test.ts; never defaults open) ──
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
      `[websocket-auth] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' ` +
        `is not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

/** Builds the exact `connect.sid` cookie header value express-session's own
 *  `getcookie()` expects: `s:` + HMAC-signed sid, percent-encoded — signed with the
 *  same `cookie-signature` lib express-session uses internally, so this is
 *  indistinguishable from a cookie a real login would have set. */
function sessionCookieHeader(theSid: string, secret: string): string {
  const signed = cookieSignature.sign(theSid, secret);
  return "connect.sid=" + encodeURIComponent("s:" + signed);
}

let httpServer: Server;
let wss: ReturnType<typeof setupWebSocket>;
let port: number;

before(async () => {
  await assertDisposableDb();

  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.userA}, ${`mt1-${RUN}-a@t.test`}, 'MT1', 'UserA')
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name)
    VALUES (${ids.userB}, ${`mt1-${RUN}-b@t.test`}, 'MT1', 'UserB')
  `);

  // Plant a session row identical in shape to what a real login leaves behind:
  // passport's serialize/deserialize are identity functions (see replitAuth.ts), so
  // req.session.passport.user IS the full user object getUserId reads.
  const sessionPayload = {
    cookie: {
      originalMaxAge: 604800000,
      expires: new Date(Date.now() + 604800000).toISOString(),
      httpOnly: true,
      path: "/",
    },
    passport: { user: { claims: { sub: ids.userA } } },
  };
  await db.execute(sql`
    INSERT INTO sessions (sid, sess, expire)
    VALUES (${sid}, ${JSON.stringify(sessionPayload)}::json, NOW() + interval '1 day')
  `);

  // Boot the REAL setupWebSocket with the REAL session middleware on an ephemeral port.
  httpServer = createServer();
  wss = setupWebSocket(httpServer, getSession());
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  port = (httpServer.address() as any).port;
});

after(async () => {
  for (const id of createdChatIds) {
    await db.execute(sql`DELETE FROM notifications WHERE related_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM user_and_expert_chats WHERE id = ${id}`).catch(() => {});
  }
  // Belt-and-suspenders sweep in case a test failed before recording an id.
  await db.execute(sql`
    DELETE FROM notifications WHERE user_id IN (${ids.userA}, ${ids.userB})
  `).catch(() => {});
  await db.execute(sql`
    DELETE FROM content_registry WHERE content_id IN (
      SELECT id FROM user_and_expert_chats WHERE sender_id IN (${ids.userA}, ${ids.userB}) OR receiver_id IN (${ids.userA}, ${ids.userB})
    )
  `).catch(() => {});
  await db.execute(sql`
    DELETE FROM user_and_expert_chats WHERE sender_id IN (${ids.userA}, ${ids.userB}) OR receiver_id IN (${ids.userA}, ${ids.userB})
  `).catch(() => {});
  await db.execute(sql`DELETE FROM sessions WHERE sid = ${sid}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.userA}, ${ids.userB})`).catch(() => {});

  // Test clients close() without waiting for the server-side FIN — force-terminate any
  // still-open server-side sockets so httpServer.close()'s callback isn't left waiting
  // on a half-closed connection that was never going to finish on its own.
  wss.clients.forEach((c) => c.terminate());
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));

  // Verify zero fixture rows remain anywhere.
  const leftoverChats = await db.execute(sql`
    SELECT count(*)::int AS n FROM user_and_expert_chats
    WHERE sender_id IN (${ids.userA}, ${ids.userB}) OR receiver_id IN (${ids.userA}, ${ids.userB})
  `);
  const leftoverNotifs = await db.execute(sql`
    SELECT count(*)::int AS n FROM notifications WHERE user_id IN (${ids.userA}, ${ids.userB})
  `);
  const leftoverUsers = await db.execute(sql`
    SELECT count(*)::int AS n FROM users WHERE id IN (${ids.userA}, ${ids.userB})
  `);
  const leftoverSessions = await db.execute(sql`SELECT count(*)::int AS n FROM sessions WHERE sid = ${sid}`);
  assert.equal((leftoverChats.rows[0] as any).n, 0, "leftover chat fixture rows");
  assert.equal((leftoverNotifs.rows[0] as any).n, 0, "leftover notification fixture rows");
  assert.equal((leftoverUsers.rows[0] as any).n, 0, "leftover user fixture rows");
  assert.equal((leftoverSessions.rows[0] as any).n, 0, "leftover session fixture row");
});

test("T1 — no session cookie: rejected with error+1008, never joins clients, writes zero rows", async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); // no Cookie header at all

  const events: any[] = [];
  const closeCode = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for close")), 5000);
    ws.on("message", (data) => {
      events.push(JSON.parse(data.toString()));
    });
    ws.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    ws.on("open", () => {
      // Race attempt: try to smuggle a forged chat through before the server's async
      // session-middleware callback closes the socket. Because the "message" listener
      // is only ever registered AFTER successful auth (handleAuthenticatedConnection),
      // this is a no-op even if it arrives before the close frame.
      try {
        ws.send(JSON.stringify({
          type: "chat",
          senderId: ids.userA,
          recipientId: ids.userB,
          content: "should never be written — unauthenticated",
        }));
      } catch {
        /* socket may already be closing */
      }
    });
    ws.on("error", () => { /* close event still fires; ignore */ });
  });

  assert.equal(closeCode, 1008, "unauthenticated connection must close with policy-violation code 1008");
  assert.ok(
    events.some((e) => e.type === "error" && e.error === "unauthenticated"),
    "must receive an explicit unauthenticated error before close",
  );

  const rows = await db.execute(sql`
    SELECT count(*)::int AS n FROM user_and_expert_chats
    WHERE sender_id IN (${ids.userA}, ${ids.userB}) OR receiver_id IN (${ids.userA}, ${ids.userB})
  `);
  assert.equal((rows.rows[0] as any).n, 0, "unauthenticated connection must write ZERO chat rows");
});

test("T2 — valid session for A, forged senderId=B: persists sender_id=A (session wins)", async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { Cookie: sessionCookieHeader(sid, process.env.SESSION_SECRET!) },
  });

  const chatEcho = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for chat echo")), 5000);
    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "chat",
        senderId: ids.userB, // FORGED — attacker claims to be user B
        recipientId: ids.userB,
        content: `mt1-forged-sender-${RUN}`,
      }));
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chat") {
        clearTimeout(timer);
        resolve(msg);
      } else if (msg.type === "error") {
        clearTimeout(timer);
        reject(new Error(`server returned error: ${msg.error}`));
      }
    });
    ws.on("error", reject);
  });
  ws.close();

  createdChatIds.push(chatEcho.id);

  // The server's own echo must already report the session-resolved sender, not the
  // forged one.
  assert.equal(chatEcho.senderId, ids.userA, "echo must report the session-resolved sender, not the forged one");

  const row = await db.execute(sql`
    SELECT sender_id, receiver_id, message FROM user_and_expert_chats WHERE id = ${chatEcho.id}
  `);
  assert.equal(row.rows.length, 1, "exactly one chat row must be persisted");
  assert.equal((row.rows[0] as any).sender_id, ids.userA, "persisted sender_id must be the SESSION user, not the forged senderId");
  assert.equal((row.rows[0] as any).receiver_id, ids.userB, "receiver_id is the legitimate, non-identity recipientId field");
  assert.equal((row.rows[0] as any).message, `mt1-forged-sender-${RUN}`);
});

test("T3 — MT-2: a notifications row lands for the recipient after a delivered message", async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { Cookie: sessionCookieHeader(sid, process.env.SESSION_SECRET!) },
  });

  const chatEcho = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for chat echo")), 5000);
    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "chat",
        recipientId: ids.userB,
        content: `mt1-notif-${RUN}`,
      }));
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chat") {
        clearTimeout(timer);
        resolve(msg);
      } else if (msg.type === "error") {
        clearTimeout(timer);
        reject(new Error(`server returned error: ${msg.error}`));
      }
    });
    ws.on("error", reject);
  });
  ws.close();

  createdChatIds.push(chatEcho.id);

  // Best-effort insert happens synchronously inside storage.createChat before the ws
  // response is sent, but give the event loop one tick of slack for the awaited insert.
  const notifs = await db.execute(sql`
    SELECT user_id, type, related_id, data FROM notifications
    WHERE related_id = ${chatEcho.id} AND related_type = 'message'
  `);
  assert.equal(notifs.rows.length, 1, "exactly one notification row for this message (no double-fire across the ws + createChat path)");
  const n = notifs.rows[0] as any;
  assert.equal(n.user_id, ids.userB, "notification must target the RECIPIENT");
  assert.equal(n.type, "message_received");
  assert.equal(n.data?.clientId, ids.userA, "notification payload carries the true (session-resolved) sender for deep-linking");
});
