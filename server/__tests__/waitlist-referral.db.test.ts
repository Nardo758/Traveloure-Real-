/**
 * LW-1d (ledger `2026-10-16-lw1d-source-and-referral`): waitlist credit from an expert's short link.
 *
 *   F1  A Ready-Made link whose owner authored the trip credits that owner, with the link's code and trip.
 *   F2  A made-up code credits nobody (unknown_ref); a malformed one too; an absent one is no_ref.
 *   F3  A Ready-Made link minted for a trip its owner did NOT author credits nobody (owner_not_author).
 *   F4  A storefront link credits nobody on the waitlist (not_ready_made_link).
 *   F5  An expired link credits nobody; the visitor's own link is self_referral.
 *   F6  The pure author rule, including a trip that no longer exists.
 *
 * Run against a disposable database:
 *   npx tsx --test server/__tests__/waitlist-referral.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { decideWaitlistReferral, resolveWaitlistReferral } from "../services/waitlist-referral.service";

const SUFFIX = `wlref-${process.pid}`;
const CODE = (n: string) => `wl${n}${process.pid}`.slice(0, 12);

let authorId: string;
let otherId: string;
let tripId: string;
let rmTripId: string;

async function mkUser(tag: string): Promise<string> {
  const res = await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${`${tag}-${SUFFIX}@traveloure.test`}, 'travel_expert')
    RETURNING id
  `);
  return String((res.rows[0] as any).id);
}

async function mkLink(code: string, ownerId: string, targetType: string, targetId: string | null, expiresAt: string | null = null) {
  await db.execute(sql`
    INSERT INTO short_links (id, code, owner_user_id, target_type, target_id, frame, expires_at)
    VALUES (gen_random_uuid()::text, ${code}, ${ownerId}, ${targetType}, ${targetId}, NULL, ${expiresAt}::timestamp)
  `);
}

before(async () => {
  authorId = await mkUser("author");
  otherId = await mkUser("other");
  const t = await db.execute(sql`
    INSERT INTO trips (id, user_id, destination, start_date, end_date)
    VALUES (gen_random_uuid()::text, ${authorId}, 'Kyoto, Japan', '2027-11-01', '2027-11-03')
    RETURNING id
  `);
  tripId = String((t.rows[0] as any).id);
  const rm = await db.execute(sql`
    INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days)
    VALUES (gen_random_uuid()::text, ${authorId}, ${tripId}, 'Kyoto', ${`Autumn Kyoto ${SUFFIX}`}, 3)
    RETURNING id
  `);
  rmTripId = String((rm.rows[0] as any).id);
  await mkLink(CODE("a"), authorId, "ready_made", rmTripId);
  await mkLink(CODE("b"), otherId, "ready_made", rmTripId);
  await mkLink(CODE("c"), authorId, "storefront", null);
  await mkLink(CODE("d"), authorId, "ready_made", rmTripId, "2020-01-01");
});

after(async () => {
  await db.execute(sql`DELETE FROM short_links WHERE code IN (${CODE("a")}, ${CODE("b")}, ${CODE("c")}, ${CODE("d")})`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${rmTripId}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${authorId}, ${otherId})`);
});

test("F1 · the author's own Ready-Made link credits the author", async () => {
  const r = await resolveWaitlistReferral({ ref: CODE("a").toUpperCase(), viewerUserId: null });
  assert.deepEqual(r, { credited: true, referrerUserId: authorId, shortLinkCode: CODE("a"), readyMadeTripId: rmTripId });
});

test("F2 · a made-up, malformed or absent ref credits nobody", async () => {
  assert.deepEqual(await resolveWaitlistReferral({ ref: "zzzz9999", viewerUserId: null }), {
    credited: false,
    reason: "unknown_ref",
    ref: "zzzz9999",
  });
  assert.equal((await resolveWaitlistReferral({ ref: "not a code!", viewerUserId: null }) as any).reason, "malformed_ref");
  assert.equal((await resolveWaitlistReferral({ ref: null, viewerUserId: null }) as any).reason, "no_ref");
});

test("F3 · a link to a trip its owner did not author credits nobody", async () => {
  const r = await resolveWaitlistReferral({ ref: CODE("b"), viewerUserId: null });
  assert.deepEqual(r, { credited: false, reason: "owner_not_author", ref: CODE("b") });
});

test("F4 · a storefront link is not a Ready-Made link", async () => {
  const r = await resolveWaitlistReferral({ ref: CODE("c"), viewerUserId: null });
  assert.deepEqual(r, { credited: false, reason: "not_ready_made_link", ref: CODE("c") });
});

test("F5 · an expired link and the visitor's own link credit nobody", async () => {
  assert.equal((await resolveWaitlistReferral({ ref: CODE("d"), viewerUserId: null }) as any).reason, "expired_ref");
  assert.equal((await resolveWaitlistReferral({ ref: CODE("a"), viewerUserId: authorId }) as any).reason, "self_referral");
});

test("F6 · the pure author rule", () => {
  const link = { code: "abc", ownerUserId: "u1", targetType: "ready_made", targetId: "t1" };
  assert.equal(decideWaitlistReferral({ link, tripAuthorId: "u1" }).credited, true);
  assert.equal((decideWaitlistReferral({ link, tripAuthorId: "u2" }) as any).reason, "owner_not_author");
  assert.equal((decideWaitlistReferral({ link, tripAuthorId: undefined }) as any).reason, "trip_not_found");
  assert.equal(
    (decideWaitlistReferral({ link: { ...link, targetId: null }, tripAuthorId: "u1" }) as any).reason,
    "not_ready_made_link",
  );
});
