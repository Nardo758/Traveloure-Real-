/**
 * CP-3 (ledger `2026-10-16-cp3-share-image-ref`): a Ready-Made share image prints the author's own /r/ link.
 *
 *   R1  The author's own link for this trip prints: `refCode` is the code and the cover differs from the /t/ cover.
 *       No viewer is checked, so the author downloading their own image still gets their link.
 *   R2  The author's link for ANOTHER trip does not print on this one (the /t/ image is served).
 *   R3  A link owned by someone who did not author the trip does not print.
 *   R4  An expired, unknown, malformed or absent code prints the /t/ link.
<<<<<<< HEAD
 *   R5  Og draws no link: a valid ref changes nothing and it shares the /t/ image's cache entry. The map
 *       format is not served (GC-1), with or without a ref.
=======
 *   R5  Map and og draw no link: a valid ref changes nothing, and they share the /t/ image's cache entry.
>>>>>>> origin/main
 *   R6  The cache is keyed by code: two valid codes give two images, a repeat returns the cached one, and a refused
 *       code shares the /t/ image's entry.
 *   R7  The pure rule `shareImageRefCode`.
 *
 * Run against a disposable database:
 *   npx tsx --test server/__tests__/cp3-share-image-ref.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  _clearReadyMadeShareCaches,
  getReadyMadeShareImage,
<<<<<<< HEAD
  MAP_FORMAT_NOT_SERVED,
=======
>>>>>>> origin/main
  shareImageRefCode,
} from "../services/ready-made-share-data.service";

const SUFFIX = `cp3ref-${process.pid}`;
const CODE = (n: string) => `c3${n}${process.pid}`.slice(0, 12);
const CODES = ["a", "a2", "b", "o", "x"].map(CODE);

let authorId: string;
let otherId: string;
const tripIds: string[] = [];
let rmId: string;
let rmOtherId: string;

async function mkUser(tag: string): Promise<string> {
  const res = await db.execute(sql`
    INSERT INTO users (id, email, role, first_name) VALUES (gen_random_uuid()::text, ${`${tag}-${SUFFIX}@traveloure.test`}, 'travel_expert', 'Aiko')
    RETURNING id
  `);
  return String((res.rows[0] as any).id);
}

async function mkListing(title: string): Promise<string> {
  const t = await db.execute(sql`
    INSERT INTO trips (id, user_id, destination, start_date, end_date)
    VALUES (gen_random_uuid()::text, ${authorId}, 'Kyoto, Japan', '2027-11-01', '2027-11-03')
    RETURNING id
  `);
  const tripId = String((t.rows[0] as any).id);
  tripIds.push(tripId);
  const rm = await db.execute(sql`
    INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, status, active)
    VALUES (gen_random_uuid()::text, ${authorId}, ${tripId}, 'Kyoto', ${title}, 3, 'approved', true)
    RETURNING id
  `);
  return String((rm.rows[0] as any).id);
}

async function mkLink(code: string, ownerId: string, targetId: string | null, expiresAt: string | null = null) {
  await db.execute(sql`
    INSERT INTO short_links (id, code, owner_user_id, target_type, target_id, frame, expires_at)
    VALUES (gen_random_uuid()::text, ${code}, ${ownerId}, 'ready_made', ${targetId}, NULL, ${expiresAt}::timestamp)
  `);
}

before(async () => {
  authorId = await mkUser("author");
  otherId = await mkUser("other");
  rmId = await mkListing(`Autumn Kyoto ${SUFFIX}`);
  rmOtherId = await mkListing(`Spring Kyoto ${SUFFIX}`);
  await mkLink(CODE("a"), authorId, rmId);
  await mkLink(CODE("a2"), authorId, rmId);
  await mkLink(CODE("b"), authorId, rmOtherId);
  await mkLink(CODE("o"), otherId, rmId);
  await mkLink(CODE("x"), authorId, rmId, "2020-01-01");
  _clearReadyMadeShareCaches();
});

after(async () => {
  for (const c of CODES) await db.execute(sql`DELETE FROM short_links WHERE code = ${c}`);
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id IN (${rmId}, ${rmOtherId})`);
  for (const t of tripIds) await db.execute(sql`DELETE FROM trips WHERE id = ${t}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${authorId}, ${otherId})`);
  _clearReadyMadeShareCaches();
});

test("R1 · the author's own link for this trip prints on the cover and the story", async () => {
  const plain = await getReadyMadeShareImage(rmId, "cover");
  const withRef = await getReadyMadeShareImage(rmId, "cover", CODE("a").toUpperCase());
  assert.ok(plain && withRef);
  assert.equal(plain!.refCode, null);
  assert.equal(withRef!.refCode, CODE("a"));
  assert.equal(withRef!.version, plain!.version, "the version names the listing, not the link");
  assert.notDeepEqual(withRef!.png, plain!.png);
  const story = await getReadyMadeShareImage(rmId, "story", CODE("a"));
  assert.equal(story!.refCode, CODE("a"));
});

test("R2 · the author's link for another trip does not print here", async () => {
  const img = await getReadyMadeShareImage(rmId, "cover", CODE("b"));
  assert.equal(img!.refCode, null);
});

test("R3 · a link owned by someone who did not author the trip does not print", async () => {
  const img = await getReadyMadeShareImage(rmId, "cover", CODE("o"));
  assert.equal(img!.refCode, null);
});

test("R4 · an expired, unknown, malformed or absent code prints the /t/ link", async () => {
  for (const ref of [CODE("x"), "zzzz9999", "not a code!", "", null]) {
    const img = await getReadyMadeShareImage(rmId, "cover", ref);
    assert.equal(img!.refCode, null, String(ref));
  }
});

<<<<<<< HEAD
test("R5 · og draws no link, so a valid ref changes nothing; the map format is not served", async () => {
  const plain = await getReadyMadeShareImage(rmId, "og");
  const withRef = await getReadyMadeShareImage(rmId, "og", CODE("a"));
  assert.ok(plain && plain !== MAP_FORMAT_NOT_SERVED && withRef && withRef !== MAP_FORMAT_NOT_SERVED);
  assert.equal(withRef.refCode, null);
  assert.equal(withRef.png, plain.png, "og shares the /t/ cache entry");
  // GC-1 (ledger `2026-10-17-gc1-google-coords`): the map format is not served, with or without a ref.
  assert.equal(await getReadyMadeShareImage(rmId, "map"), MAP_FORMAT_NOT_SERVED);
  assert.equal(await getReadyMadeShareImage(rmId, "map", CODE("a")), MAP_FORMAT_NOT_SERVED);
=======
test("R5 · map and og draw no link, so a valid ref changes nothing", async () => {
  for (const format of ["map", "og"] as const) {
    const plain = await getReadyMadeShareImage(rmId, format);
    const withRef = await getReadyMadeShareImage(rmId, format, CODE("a"));
    assert.equal(withRef!.refCode, null);
    assert.equal(withRef!.png, plain!.png, `${format} shares the /t/ cache entry`);
  }
>>>>>>> origin/main
});

test("R6 · the cache is keyed by code", async () => {
  const a = await getReadyMadeShareImage(rmId, "cover", CODE("a"));
  const a2 = await getReadyMadeShareImage(rmId, "cover", CODE("a2"));
  const again = await getReadyMadeShareImage(rmId, "cover", CODE("a"));
  const plain = await getReadyMadeShareImage(rmId, "cover");
  const refused = await getReadyMadeShareImage(rmId, "cover", CODE("o"));
  assert.notDeepEqual(a!.png, a2!.png);
  assert.equal(again!.png, a!.png, "a repeat returns the cached image");
  assert.equal(refused!.png, plain!.png, "a refused code shares the /t/ entry");
});

test("R7 · the pure rule", () => {
  const link = { linkId: "l", code: "abc12345", ownerUserId: "u1", frame: null, targetType: "ready_made", targetId: "rm1" };
  assert.equal(shareImageRefCode({ link, valid: true, listingId: "rm1", tripAuthorId: "u1" }), "abc12345");
  assert.equal(shareImageRefCode({ link, valid: true, listingId: "rm2", tripAuthorId: "u1" }), null, "another trip");
  assert.equal(shareImageRefCode({ link, valid: true, listingId: "rm1", tripAuthorId: "u2" }), null, "owner not author");
  assert.equal(shareImageRefCode({ link: { ...link, targetType: "storefront" }, valid: true, listingId: "rm1", tripAuthorId: "u1" }), null);
  assert.equal(shareImageRefCode({ link, valid: false, listingId: "rm1", tripAuthorId: "u1" }), null, "expired or refused");
  assert.equal(shareImageRefCode({ link: null, valid: false, listingId: "rm1", tripAuthorId: "u1" }), null);
});
