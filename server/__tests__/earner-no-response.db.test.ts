/**
 * The 48-hour "no response yet" notice (decision-maker, Sep 24, 2026 — Phase 3). DB-backed.
 *   R1 a request booking still pending past the window gets ONE notice; a second pass sends none.
 *   R2 a reply in chat since the request counts as a response — no notice.
 *   R3 a request inside the window gets no notice.
 *   R4 a quote-born booking (the earner already answered with a quote) gets no notice.
 *   R5 the notice links to other experts in the listing's city and promises no deadline.
 * Needs a disposable Postgres with migrations applied and JOURNEY_DB_WRITES_OK=1.
 * Run: npx tsx --test --test-force-exit server/__tests__/earner-no-response.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { runEarnerNoResponseNotices } from "../services/earner-no-response.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  provider: `nr-prov-${RUN}`,
  traveler: `nr-trav-${RUN}`,
  service: `nr-svc-${RUN}`,
  stale: `nr-b-stale-${RUN}`,
  replied: `nr-b-replied-${RUN}`,
  fresh: `nr-b-fresh-${RUN}`,
  quoted: `nr-b-quoted-${RUN}`,
};
const bookingIds = [ids.stale, ids.replied, ids.fresh, ids.quoted];

async function seedBooking(id: string, hoursAgo: number) {
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, created_at)
    VALUES (${id}, ${ids.service}, ${ids.traveler}, ${ids.provider}, 'pending', '100.00',
            NOW() - make_interval(hours => ${hoursAgo}))
  `);
}

async function noticesFor(id: string): Promise<any[]> {
  const r: any = await db.execute(sql`SELECT * FROM notifications WHERE dedupe_key = ${`booking:${id}:earner_no_response`}`);
  return r.rows ?? r;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`${ids.provider}@t.test`}, 'Aiko', 'Tanaka', 'expert'),
           (${ids.traveler}, ${`${ids.traveler}@t.test`}, 'NR', 'Traveler', 'user')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, city)
    VALUES (${ids.service}, ${ids.provider}, ${`Tea ceremony ${RUN}`}, 'fixture', '100.00', 'active', 'approved', 'Kyoto')
  `);
  await seedBooking(ids.stale, 49);
  await seedBooking(ids.replied, 49);
  await seedBooking(ids.fresh, 2);
  await seedBooking(ids.quoted, 49);
  await db.execute(sql`
    INSERT INTO user_and_expert_chats (id, sender_id, receiver_id, message, created_at)
    VALUES (${`nr-chat-${RUN}`}, ${ids.provider}, ${ids.traveler}, 'On it!', NOW() - make_interval(hours => 10))
  `);
  await db.execute(sql`
    INSERT INTO service_quotes (id, service_id, traveler_id, position, status, booking_id)
    VALUES (${`nr-q-${RUN}`}, ${ids.service}, ${ids.traveler}, 1, 'accepted', ${ids.quoted})
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM notifications WHERE user_id = ${ids.traveler}`).catch(() => {});
  await db.execute(sql`DELETE FROM service_quotes WHERE traveler_id = ${ids.traveler}`).catch(() => {});
  await db.execute(sql`DELETE FROM user_and_expert_chats WHERE sender_id = ${ids.provider}`).catch(() => {});
  for (const id of bookingIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.service}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.traveler})`).catch(() => {});
});

test("R2 + R3 + R4: a reply, a fresh request and a quote-born booking get no notice", async () => {
  await runEarnerNoResponseNotices();
  // The provider replied to this traveler after these requests were made — that is a response.
  assert.equal((await noticesFor(ids.replied)).length, 0, "a reply counts as a response");
  assert.equal((await noticesFor(ids.stale)).length, 0, "the same reply answers the stale request too");
  assert.equal((await noticesFor(ids.fresh)).length, 0, "inside the window");
  assert.equal((await noticesFor(ids.quoted)).length, 0, "the earner answered with a quote");
});

test("R1 + R5: with no reply, a stale request gets exactly one notice", async () => {
  await db.execute(sql`DELETE FROM user_and_expert_chats WHERE sender_id = ${ids.provider}`);
  await runEarnerNoResponseNotices();
  const [n] = await noticesFor(ids.stale);
  assert.ok(n, "the stale request is noticed");
  assert.equal(n.user_id, ids.traveler);
  assert.equal(n.type, "earner_no_response");
  assert.match(n.message, /Aiko Tanaka hasn't responded to your request/);
  assert.ok(!/cancel|refund|\d+\s*(h|hour|day)/i.test(n.message), "no deadline, nothing claimed cancelled");
  assert.equal(n.data.workspacePath, "/experts?destination=Kyoto");
  assert.equal((await noticesFor(ids.fresh)).length, 0);
  assert.equal((await noticesFor(ids.quoted)).length, 0);

  await runEarnerNoResponseNotices();
  assert.equal((await noticesFor(ids.stale)).length, 1, "a second pass sends nothing");
});
