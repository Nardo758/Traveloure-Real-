/**
 * Phone push (Locked Decision 53, ledger `2026-09-24-web-push`). DB-backed; the transport is a
 * recorder (no network).
 *   P1 a recent notice of a person with a device is pushed ONCE — a second dispatch and the sweep send nothing.
 *   P2 the person's own Push switch for the notice's key stops it (claimed, not sent).
 *   P3 a type with no preference key is never pushed.
 *   P4 a person with no device is never claimed; an old notice is never claimed (no backlog).
 *   P5 the sweep pushes an unclaimed recent notice exactly once.
 *   P6 a device the push service reports gone (410) is deleted; other devices still receive.
 *   P7 unconfigured (no VAPID keys) claims nothing.
 * Needs a disposable Postgres with migrations applied and JOURNEY_DB_WRITES_OK=1.
 * Run: npx tsx --test --test-force-exit server/__tests__/web-push.db.test.ts
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  _webPushTestHooks,
  dispatchPushForNotification,
  sendPushToUser,
  sweepUnpushedNotifications,
} from "../services/web-push.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  withDevice: `wp-dev-${RUN}`,
  noDevice: `wp-nodev-${RUN}`,
  quiet: `wp-quiet-${RUN}`,
};
const sent: { endpoint: string; title: string; url: string }[] = [];

async function notice(userId: string, type: string, minutesAgo = 0): Promise<string> {
  const id = `wp-n-${crypto.randomUUID().slice(0, 12)}`;
  await db.execute(sql`
    INSERT INTO notifications (id, user_id, type, title, message, data, created_at)
    VALUES (${id}, ${userId}, ${type}, ${`Title ${type}`}, 'Body', ${JSON.stringify({ tripId: "t-1", workspacePath: "/trip/t-1" })}::jsonb,
            NOW() - make_interval(mins => ${minutesAgo}))
  `);
  return id;
}

async function claimedAt(id: string): Promise<unknown> {
  const r: any = await db.execute(sql`SELECT push_claimed_at FROM notifications WHERE id = ${id}`);
  return (r.rows ?? r)[0]?.push_claimed_at ?? null;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, preferences)
    VALUES (${ids.withDevice}, ${`${ids.withDevice}@t.test`}, 'Aiko', 'Tanaka', 'expert', NULL),
           (${ids.noDevice}, ${`${ids.noDevice}@t.test`}, 'No', 'Device', 'expert', NULL),
           (${ids.quiet}, ${`${ids.quiet}@t.test`}, 'Quiet', 'Expert', 'expert',
            ${JSON.stringify({ settings: { notifications: { newMessage: { email: true, push: false } } } })}::jsonb)
  `);
  await db.execute(sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (${ids.withDevice}, ${`https://push.test/${RUN}/a`}, 'p', 'a'),
           (${ids.quiet}, ${`https://push.test/${RUN}/q`}, 'p', 'a')
  `);
  _webPushTestHooks.configured = true;
  _webPushTestHooks.send = async (sub, payload) => {
    if (sub.endpoint.endsWith("/gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    sent.push({ endpoint: sub.endpoint, title: payload.title, url: payload.url });
    return { statusCode: 201 };
  };
});

beforeEach(() => {
  sent.length = 0;
});

after(async () => {
  _webPushTestHooks.configured = undefined;
  _webPushTestHooks.send = undefined;
  const all = [ids.withDevice, ids.noDevice, ids.quiet];
  for (const u of all) {
    await db.execute(sql`DELETE FROM notifications WHERE user_id = ${u}`).catch(() => {});
    await db.execute(sql`DELETE FROM push_subscriptions WHERE user_id = ${u}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id = ${u}`).catch(() => {});
  }
});

test("P1: pushed once, with the notice's title and an in-app path", async () => {
  const id = await notice(ids.withDevice, "message_received");
  await dispatchPushForNotification(id);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, "Title message_received");
  assert.equal(sent[0].url, "/plans/t-1");
  assert.ok(await claimedAt(id));
  await dispatchPushForNotification(id);
  await sweepUnpushedNotifications();
  assert.equal(sent.filter((s) => s.title === "Title message_received").length, 1, "never twice");
});

test("P2 + P3: the Push switch and an unmapped type both stop the send", async () => {
  const off = await notice(ids.quiet, "message_received");
  await dispatchPushForNotification(off);
  assert.ok(await claimedAt(off), "claimed");
  const unmapped = await notice(ids.withDevice, "provider_verification_request");
  await dispatchPushForNotification(unmapped);
  assert.equal(sent.length, 0);
});

test("P4: no device, or an old notice, is never claimed", async () => {
  const noDev = await notice(ids.noDevice, "message_received");
  await dispatchPushForNotification(noDev);
  assert.equal(await claimedAt(noDev), null);
  const old = await notice(ids.withDevice, "message_received", 60);
  await dispatchPushForNotification(old);
  await sweepUnpushedNotifications();
  assert.equal(await claimedAt(old), null, "a backlog is never sent");
  assert.equal(sent.length, 0);
});

test("P5: the sweep pushes an unclaimed recent notice exactly once", async () => {
  const id = await notice(ids.withDevice, "booking_request");
  const first = await sweepUnpushedNotifications();
  assert.ok(first.claimed >= 1);
  await sweepUnpushedNotifications();
  assert.equal(sent.filter((s) => s.title === "Title booking_request").length, 1);
  assert.ok(await claimedAt(id));
});

test("P6: a gone device is deleted, the others still receive", async () => {
  await db.execute(sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (${ids.withDevice}, ${`https://push.test/${RUN}/gone`}, 'p', 'a')
  `);
  const delivered = await sendPushToUser(ids.withDevice, { title: "t", body: "b", url: "/", tag: "x" });
  assert.equal(delivered, 1);
  const r: any = await db.execute(sql`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = ${ids.withDevice}`);
  assert.equal(Number((r.rows ?? r)[0].n), 1, "the gone endpoint is removed");
});

test("P7: unconfigured claims nothing", async () => {
  _webPushTestHooks.configured = false;
  try {
    const id = await notice(ids.withDevice, "message_received");
    await dispatchPushForNotification(id);
    const swept = await sweepUnpushedNotifications();
    assert.equal(swept.claimed, 0);
    assert.equal(await claimedAt(id), null);
    assert.equal(sent.length, 0);
  } finally {
    _webPushTestHooks.configured = true;
  }
});
