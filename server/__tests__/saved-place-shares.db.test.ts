/**
 * Saved places share links (board #329, ledger `2026-09-24-saved-places-plan-and-share`,
 * migration 324). DB-backed.
 *   S1 sharing a city is idempotent — repeated and concurrent presses return ONE active link.
 *   S2 a city with nothing saved in it is refused; nothing is written.
 *   S3 the public read carries the city and the places and nothing else — no owner, no ids — and
 *      matches the city case- and space-insensitively.
 *   S4 the link is live: a place removed after sharing leaves it.
 *   S5 only the owner can stop a link; a stopped, unknown or malformed link reads as null, and
 *      sharing again mints a NEW token (a stopped link never comes back).
 * Needs a disposable Postgres with migrations applied and JOURNEY_DB_WRITES_OK=1.
 * Run: npx tsx --test --test-force-exit server/__tests__/saved-place-shares.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  listSavedCityShares,
  readSharedSavedPlaces,
  revokeSavedCityShare,
  shareSavedCity,
} from "../services/saved-place-shares.service";

const RUN = crypto.randomUUID().slice(0, 8);
const owner = `sps-own-${RUN}`;
const other = `sps-oth-${RUN}`;
const CITY = `Kyotest ${RUN}`;

async function save(userId: string, id: string, name: string, city: string | null): Promise<string> {
  const rowId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO saved_items (id, user_id, content_type, content_id, content_name, content_image, city)
    VALUES (${rowId}, ${userId}, 'gem', ${id}, ${name}, ${"https://img.test/" + id + ".jpg"}, ${city})`);
  return rowId;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, role)
    VALUES (${owner}, ${owner + "@test.local"}, 'Owner', 'user'),
           (${other}, ${other + "@test.local"}, 'Other', 'user')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM users WHERE id IN (${owner}, ${other})`);
});

let removableId = "";

test("S1 sharing a city is idempotent, even under concurrency", async () => {
  await save(owner, `g1-${RUN}`, "Temple", CITY);
  removableId = await save(owner, `g2-${RUN}`, "Garden", ` ${CITY.toLowerCase()} `);
  await save(owner, `g3-${RUN}`, "Elsewhere", `Other ${RUN}`);

  const results = await Promise.all([
    shareSavedCity(owner, CITY),
    shareSavedCity(owner, CITY.toUpperCase()),
    shareSavedCity(owner, `  ${CITY}  `),
  ]);
  const tokens = new Set(results.map((r) => (r.ok ? r.share.token : "refused")));
  assert.equal(tokens.size, 1, "one active link");
  assert.ok(![...tokens][0].startsWith("refused"));
  assert.equal(results.filter((r) => r.ok && r.created).length, 1, "exactly one press created it");
  const active = await listSavedCityShares(owner);
  assert.equal(active.length, 1);
  assert.equal(active[0].city, CITY, "labelled with the spelling the place was saved under");
  assert.match(active[0].token, /^[0-9a-f]{64}$/);
});

test("S2 a city with nothing saved is refused and writes nothing", async () => {
  const res = await shareSavedCity(owner, `Nowhere ${RUN}`);
  assert.deepEqual(res, { ok: false, reason: "no_saved_places" });
  const res2 = await shareSavedCity(other, CITY);
  assert.deepEqual(res2, { ok: false, reason: "no_saved_places" }, "another user's saves are not theirs to share");
  const [row] = (await db.execute(sql`SELECT count(*)::int AS n FROM saved_place_shares WHERE user_id = ${other}`) as any).rows;
  assert.equal(row.n, 0);
});

test("S3/S4 the public read is the city and the places only, and it is live", async () => {
  const [share] = await listSavedCityShares(owner);
  const read = await readSharedSavedPlaces(share.token);
  assert.ok(read);
  assert.deepEqual(Object.keys(read).sort(), ["city", "places"]);
  assert.equal(read.city, CITY);
  assert.deepEqual(read.places.map((p) => p.contentName), ["Temple", "Garden"]);
  for (const place of read.places) {
    assert.deepEqual(Object.keys(place).sort(), ["contentImage", "contentName", "contentType"]);
  }
  assert.ok(!JSON.stringify(read).includes(owner), "the owner is never named");

  await db.execute(sql`DELETE FROM saved_items WHERE id = ${removableId}`);
  const after = await readSharedSavedPlaces(share.token);
  assert.deepEqual(after?.places.map((p) => p.contentName), ["Temple"]);
});

test("S5 only the owner stops a link; stopped links are gone for good", async () => {
  const [share] = await listSavedCityShares(owner);
  assert.equal(await revokeSavedCityShare(other, share.id), false, "not yours");
  assert.ok(await readSharedSavedPlaces(share.token), "still live after a refused stop");

  assert.equal(await revokeSavedCityShare(owner, share.id), true);
  assert.equal(await revokeSavedCityShare(owner, share.id), false, "already stopped");
  assert.equal(await readSharedSavedPlaces(share.token), null);
  assert.equal(await readSharedSavedPlaces("not-a-token"), null);
  assert.equal(await readSharedSavedPlaces("f".repeat(64)), null);

  const again = await shareSavedCity(owner, CITY);
  assert.ok(again.ok && again.created);
  assert.notEqual(again.ok && again.share.token, share.token, "a new link, never the stopped one");
});
