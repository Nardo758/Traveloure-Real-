/**
 * Locked Decision 52 option B (a suggestion may name a listing, migration 321) and the earner
 * activity emails (ledger 2026-09-24-earner-email-notifications). DB-backed.
 *   S1 only an approved AND active listing may be suggested; a paused or unapproved one is refused.
 *   S2 a listing-backed suggestion stores the listing and reads back its name and price.
 *   A1 an activity email reaches an EARNER only — a traveler recipient is skipped.
 *   A2 message emails are throttled to one per sender→recipient per hour; another pair still sends.
 *   A3 the earner's own "email" consent for the event's key stops it.
 * Needs a disposable Postgres with migrations applied and JOURNEY_DB_WRITES_OK=1.
 * Run: npx tsx --test --test-force-exit server/__tests__/suggestion-listing-activity-email.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  createTripSuggestion,
  getPendingSuggestion,
  getTripSuggestions,
  resolveSuggestableListing,
} from "../services/booking-actions.service";
import { sendActivityEmail } from "../services/activity-email.service";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  expert: `sl-exp-${RUN}`,
  expert2: `sl-exp2-${RUN}`,
  traveler: `sl-trav-${RUN}`,
  live: `sl-svc-live-${RUN}`,
  paused: `sl-svc-paused-${RUN}`,
  draft: `sl-svc-draft-${RUN}`,
  trip: `sl-trip-${RUN}`,
};

async function outboxCount(kind: string, recipientId: string): Promise<number> {
  const r: any = await db.execute(sql`
    SELECT count(*)::int AS n FROM email_outbox
    WHERE email_type = ${`activity_${kind}`} AND metadata->>'recipientId' = ${recipientId}
  `);
  return Number((r.rows ?? r)[0].n);
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`${ids.expert}@t.test`}, 'Aiko', 'Tanaka', 'expert'),
           (${ids.expert2}, ${`${ids.expert2}@t.test`}, 'Ren', 'Sato', 'expert'),
           (${ids.traveler}, ${`${ids.traveler}@t.test`}, 'SL', 'Traveler', 'user')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, city)
    VALUES (${ids.live}, ${ids.expert}, ${`Tea ceremony ${RUN}`}, 'fixture', '120.00', 'active', 'approved', 'Kyoto'),
           (${ids.paused}, ${ids.expert}, ${`Paused ${RUN}`}, 'fixture', '80.00', 'paused', 'approved', 'Kyoto'),
           (${ids.draft}, ${ids.expert}, ${`Draft ${RUN}`}, 'fixture', '60.00', 'active', 'submitted', 'Kyoto')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.traveler}, 'SL trip', 'Kyoto, Japan', NOW() + INTERVAL '30 days', NOW() + INTERVAL '33 days')
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'recipientId' IN (${ids.expert}, ${ids.expert2}, ${ids.traveler})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_suggestions WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  for (const id of [ids.live, ids.paused, ids.draft]) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.expert}, ${ids.expert2}, ${ids.traveler})`).catch(() => {});
});

test("S1: only an approved and active listing may be suggested", async () => {
  const live = await resolveSuggestableListing(ids.live);
  assert.ok(live);
  assert.equal(live!.price, "120.00");
  assert.equal(await resolveSuggestableListing(ids.paused), null, "paused is refused");
  assert.equal(await resolveSuggestableListing(ids.draft), null, "unapproved is refused");
  assert.equal(await resolveSuggestableListing(`nope-${RUN}`), null, "missing is the same answer");
});

test("S2: a listing-backed suggestion stores the listing and reads back its name and price", async () => {
  const id = await createTripSuggestion({
    tripId: ids.trip, expertId: ids.expert, type: "activity", title: "Tea", providerServiceId: ids.live,
  });
  const pending = await getPendingSuggestion(id, ids.trip);
  assert.equal(pending.provider_service_id, ids.live);
  const [row] = (await getTripSuggestions(ids.trip)).filter((r: any) => r.id === id);
  assert.equal(row.listing_name, `Tea ceremony ${RUN}`);
  assert.equal(String(row.listing_price), "120.00");
  const free = await createTripSuggestion({ tripId: ids.trip, expertId: ids.expert, type: "note", title: "Free" });
  assert.equal((await getPendingSuggestion(free, ids.trip)).provider_service_id, null, "free text names no listing");
});

test("A1: an activity email reaches an earner only", async () => {
  assert.equal(await sendActivityEmail({ recipientId: ids.traveler, kind: "review_received", destination: "catalog" }), "skipped");
  assert.equal(await outboxCount("review_received", ids.traveler), 0);
  assert.equal(await sendActivityEmail({ recipientId: ids.expert, kind: "review_received", subject: "Tea", destination: "catalog" }), "sent");
  assert.equal(await outboxCount("review_received", ids.expert), 1);
});

test("A2: message emails are throttled per pair per hour", async () => {
  const send = (to: string, key: string) =>
    sendActivityEmail({ recipientId: to, kind: "new_message", actorName: "SL", destination: "messages", throttleKey: key });
  assert.equal(await send(ids.expert, `${ids.traveler}>${ids.expert}`), "sent");
  assert.equal(await send(ids.expert, `${ids.traveler}>${ids.expert}`), "skipped", "same pair within the hour");
  assert.equal(await outboxCount("new_message", ids.expert), 1);
  assert.equal(await send(ids.expert2, `${ids.traveler}>${ids.expert2}`), "sent", "another pair is independent");
});

test("A3: the earner's own email consent for the key stops it", async () => {
  await db.execute(sql`
    UPDATE users SET preferences = jsonb_build_object('settings', jsonb_build_object('notifications',
      jsonb_build_object('bookingRequest', jsonb_build_object('email', false, 'push', true))))
    WHERE id = ${ids.expert2}
  `);
  assert.equal(await sendActivityEmail({ recipientId: ids.expert2, kind: "quote_request", destination: "catalog" }), "skipped");
  assert.equal(await outboxCount("quote_request", ids.expert2), 0);
});
