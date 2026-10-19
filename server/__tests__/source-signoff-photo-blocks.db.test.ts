/**
 * CS-1 item 1 — SOURCE SIGN-OFF AND PER-PLACE no_photos, on a real database (ledger `2026-10-18-cs1-source-signoff`;
 * migration 395, held).
 *
 *   SB1  a link-out terms class forces adapter `manual`, on create and on edit
 *   SB2  sign-off is the approver's alone (403 otherwise); approving needs a terms class; reject deactivates
 *   SB3  activation needs an approved sign-off; a reading-class source is refused until the review gate exists
 *   SB4  a terms-bound edit (terms class) returns the source to pending and deactivates it
 *   SB5  the refresh refuses a source that is not auto-fetchable; recordFacts refuses a link-out source's facts
 *   PB1  migration 395 creates the table and inserts nothing (no INSERT in the file; the table is empty on a fresh run)
 *   PB2  the approver alone adds a block; a name needs its city; a block needs a key
 *   PB3  both keys: a place id, or a normalised name + city (Kiyomizu Temple ≈ Kiyomizu-dera); never a name alone
 *   PB4  upload: assertPhotoAllowed refuses a blocked subject with a 422 naming the reason
 *   PB5  read: photosFor returns no photo for a blocked place; a listing read hides its cover and gallery
 *   PB6  read: a gem (hidden gem placeName + city; AI gem name + destination) hides its image when blocked
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { like, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { contentSources, placeFacts, placePhotoBlocks } from "@shared/schema";
import { refreshEligibleSource } from "@shared/official-refresh";
import {
  ContentSourceError,
  activateContentSource,
  createContentSource,
  editContentSource,
  signoffContentSource,
} from "../services/content-sources.service";
import { recordFacts } from "../services/content-facts/place-facts.service";
import {
  PHOTO_BLOCK_REFUSAL,
  PhotoBlockError,
  addPlacePhotoBlock,
  assertPhotoAllowed,
  blockFor,
  hideBlockedGemImage,
  photoBlocks,
  warmPhotoBlocks,
} from "../services/place-photo-blocks.service";
import { photosFor } from "../services/place-photos.service";
import { DatabaseStorage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8).replace(/-/g, "");
const sid = (s: string) => `cs1_${RUN}_${s}`;
const approver = `cs1-${RUN}-approver`;
const otherAdmin = `cs1-${RUN}-admin`;
const PLACE_ID = `cs1-${RUN}-kinkaku-place`;

const base = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Sign-off ${id}`,
  homepage: "https://example.org/",
  market: "kyoto",
  adapter: "tavily_extract",
  covers: ["stop.hours"],
  doesNotCover: [],
  licenseClass: "official",
  termsUrl: "https://example.org/terms",
  ...over,
});

async function refused(p: Promise<unknown>, code: string, status: number) {
  await assert.rejects(p, (e: unknown) => (e instanceof ContentSourceError || e instanceof PhotoBlockError) && e.code === code && e.status === status);
}

let blocksAtStart = -1;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const r: any = await db.execute(sql`SELECT count(*)::int AS n FROM place_photo_blocks`);
  blocksAtStart = (r.rows ?? r)[0].n;
  for (const u of [approver, otherAdmin]) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${u}, ${`${u}@t.test`}, 'CS1', 'Admin', 'admin')`);
  }
  process.env.CONTENT_SOURCE_ACTIVATOR_USER_IDS = approver;
});

after(async () => {
  await db.delete(placeFacts).where(like(placeFacts.placeRef, `cs1-${RUN}-%`));
  await db.delete(contentSources).where(like(contentSources.id, `cs1_${RUN}_%`));
  await db.delete(placePhotoBlocks).where(sql`${placePhotoBlocks.setBy} = ${approver}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${approver}, ${otherAdmin})`);
  await pool.end();
});

test("SB1: a link-out terms class forces adapter manual, on create and on edit", async () => {
  const a = await createContentSource(base(sid("sb1a"), { termsClass: "link_out" }), otherAdmin);
  assert.equal(a.adapter, "manual");
  const b = await createContentSource(base(sid("sb1b"), { termsClass: "link_out_no_link" }), otherAdmin);
  assert.equal(b.adapter, "manual");
  const c = await createContentSource(base(sid("sb1c"), { termsClass: "extract" }), otherAdmin);
  assert.equal(c.adapter, "tavily_extract", "a reading class keeps its adapter");
  const moved = await editContentSource(sid("sb1c"), { termsClass: "link_out" });
  assert.equal(moved.adapter, "manual");
  const tried = await editContentSource(sid("sb1a"), { adapter: "tavily_extract" });
  assert.equal(tried.adapter, "manual", "a link-out source cannot be given a reading adapter");
});

test("SB2: sign-off is the approver's; approving needs a terms class; reject deactivates", async () => {
  await createContentSource(base(sid("sb2"), { termsClass: "link_out" }), otherAdmin);
  await refused(signoffContentSource(sid("sb2"), { decision: "approved" }, otherAdmin), "not_approver", 403);
  await refused(signoffContentSource(sid("sb2"), { decision: "approved", extra: 1 }, approver), "invalid_body", 400);
  const ok = await signoffContentSource(sid("sb2"), { decision: "approved" }, approver);
  assert.equal(ok.signoffStatus, "approved");
  assert.equal(ok.signoffBy, approver);
  assert.ok(ok.signoffAt);
  await createContentSource(base(sid("sb2n")), otherAdmin);
  await refused(signoffContentSource(sid("sb2n"), { decision: "approved" }, approver), "no_terms_class", 409);
  await activateContentSource(sid("sb2"), approver);
  const rej = await signoffContentSource(sid("sb2"), { decision: "rejected" }, approver);
  assert.equal(rej.signoffStatus, "rejected");
  assert.equal(rej.active, false);
});

test("SB3: activation needs an approved sign-off; a reading source waits for the review gate", async () => {
  await createContentSource(base(sid("sb3l"), { termsClass: "link_out" }), otherAdmin);
  await refused(activateContentSource(sid("sb3l"), approver), "not_signed_off", 409);
  await signoffContentSource(sid("sb3l"), { decision: "approved" }, approver);
  const on = await activateContentSource(sid("sb3l"), approver);
  assert.equal(on.active, true);
  await createContentSource(base(sid("sb3e"), { termsClass: "extract", automatedAccessAllowed: true }), otherAdmin);
  await signoffContentSource(sid("sb3e"), { decision: "approved" }, approver);
  await refused(activateContentSource(sid("sb3e"), approver), "review_gate_not_built", 409);
});

test("SB4: a terms-bound edit returns the source to pending and deactivates it", async () => {
  await createContentSource(base(sid("sb4"), { termsClass: "link_out" }), otherAdmin);
  await signoffContentSource(sid("sb4"), { decision: "approved" }, approver);
  await activateContentSource(sid("sb4"), approver);
  const notes = await editContentSource(sid("sb4"), { notes: "still fine" });
  assert.equal(notes.signoffStatus, "approved");
  assert.equal(notes.active, true);
  const moved = await editContentSource(sid("sb4"), { termsClass: "link_out_no_link" });
  assert.equal(moved.signoffStatus, null, "pending");
  assert.equal(moved.signoffBy, null);
  assert.equal(moved.active, false);
});

test("SB5: refresh refuses a non-auto-fetchable source; recordFacts refuses a link-out source's facts", async () => {
  const row = { active: true, licenseClass: "official", termsCheckedAt: new Date(), adapter: "tavily_extract", refreshIntervalDays: 7, costCeilingCentsPerDay: 100 } as any;
  assert.deepEqual(refreshEligibleSource({ ...row, signoffStatus: "approved", termsClass: "extract", automatedAccessAllowed: false }), { ok: false, reason: "not_auto_fetchable" });
  assert.deepEqual(refreshEligibleSource({ ...row, signoffStatus: null, termsClass: "extract", automatedAccessAllowed: true }), { ok: false, reason: "not_auto_fetchable" });
  assert.deepEqual(refreshEligibleSource({ ...row, signoffStatus: "approved", termsClass: "link_out", automatedAccessAllowed: true }), { ok: false, reason: "not_auto_fetchable" });

  await createContentSource(base(sid("sb5"), { termsClass: "link_out" }), otherAdmin);
  const n = await recordFacts(
    [{
      placeRefKind: "place_id", placeRef: `cs1-${RUN}-sb5-place`, placeLat: null, placeLng: null, market: "kyoto",
      need: "stop.hours", factType: "hours", value: { text: "9:00–17:00" }, origin: "crawled", sourceId: sid("sb5"),
      sourceUrl: "https://example.org/hours", license: "official", fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86_400_000), costCents: 0,
    } as any],
    { planId: null, itemId: null },
  );
  assert.equal(n, 0);
  const r: any = await db.execute(sql`SELECT count(*)::int AS n FROM place_facts WHERE place_ref = ${`cs1-${RUN}-sb5-place`}`);
  assert.equal((r.rows ?? r)[0].n, 0);
});

test("PB1: migration 395 creates place_photo_blocks and inserts nothing", () => {
  const file = fs.readFileSync(path.resolve(process.cwd(), "server/migrations/395_source_signoff_and_photo_blocks.sql"), "utf8");
  const code = file.replace(/--.*$/gm, "");
  assert.match(code, /CREATE TABLE IF NOT EXISTS place_photo_blocks/i);
  assert.doesNotMatch(code, /\b(INSERT|COPY|UPDATE)\b/i, "a deploy writes no block and no source value");
  assert.equal(blocksAtStart, 0, "the table is empty after migrations");
});

test("PB2: the approver adds a block; a name needs its city; a block needs a key", async () => {
  await refused(addPlacePhotoBlock({ placeId: PLACE_ID, reason: "no photos" }, otherAdmin), "not_approver", 403);
  await refused(addPlacePhotoBlock({ placeName: "Kiyomizu-dera", reason: "no photos" }, approver), "city_required", 400);
  await refused(addPlacePhotoBlock({ reason: "no photos" }, approver), "no_key", 400);
  const byName = await addPlacePhotoBlock({ placeName: "Kiyomizu-dera", city: "Kyoto", reason: "The temple asks for no photos online" }, approver);
  assert.equal(byName.setBy, approver);
  assert.ok(byName.placeNameNormalised);
  const byId = await addPlacePhotoBlock({ placeId: PLACE_ID, reason: "Kinkaku-ji asks for no photos online" }, approver);
  assert.equal(byId.placeId, PLACE_ID);
});

test("PB3: both keys match; a name with no city never does", async () => {
  const blocks = await photoBlocks();
  assert.ok(blockFor(blocks, { placeIds: [PLACE_ID] }), "the place id");
  for (const name of ["Kiyomizu Temple", "Kiyomizudera", "Kyōto Kiyomizu-dera"]) {
    assert.ok(blockFor(blocks, { names: [name], city: "Kyoto" }), name);
  }
  assert.equal(blockFor(blocks, { names: ["Kiyomizu-dera"], city: null }), null, "a name alone is not a key");
  assert.equal(blockFor(blocks, { names: ["Kiyomizu-dera"], city: "Osaka" }), null, "another city");
  assert.equal(blockFor(blocks, { names: ["Ginkaku-ji"], city: "Kyoto" }), null);
});

test("PB4: upload is refused with the reason", async () => {
  await assert.rejects(
    assertPhotoAllowed({ names: ["Kiyomizu Temple sunset tour"], city: "Kyoto" }),
    (e: unknown) => e instanceof PhotoBlockError && e.status === 422 && (e.details as any)?.message === PHOTO_BLOCK_REFUSAL && (e.details as any)?.reason === "The temple asks for no photos online",
  );
  await assertPhotoAllowed({ names: ["Nishiki Market walk"], city: "Kyoto" });
});

test("PB5: reads hide a blocked place's photos and keep the rest", async () => {
  const own = "https://cdn.example.org/photo.jpg";
  const out = await photosFor([
    { id: "a", name: "Kinkaku-ji", placeId: null, itemPlaceId: PLACE_ID, lat: null, lng: null, ownImage: own },
    { id: "b", name: "Kiyomizu Temple", placeId: null, city: "Kyoto", lat: null, lng: null, ownImage: own },
    { id: "c", name: "Nishiki Market", placeId: null, city: "Kyoto", lat: null, lng: null, ownImage: own },
  ]);
  assert.equal(out.a, null);
  assert.equal(out.b, null);
  assert.equal(out.c?.url, own);

  await warmPhotoBlocks();
  const hidden = DatabaseStorage.normalizeServiceImage({ id: "s1", serviceName: "Kiyomizu-dera morning walk", city: "Kyoto", serviceImage: own, galleryImages: [own] } as any) as any;
  assert.equal(hidden.serviceImage, null);
  assert.deepEqual(hidden.galleryImages, []);
  const shown = DatabaseStorage.normalizeServiceImage({ id: "s2", serviceName: "Nishiki food walk", city: "Kyoto", serviceImage: own, galleryImages: [own] } as any) as any;
  assert.equal(shown.serviceImage, own);
  // Nothing was deleted: the block rows remain, and no photo row was touched.
  const r: any = await db.execute(sql`SELECT count(*)::int AS n FROM place_photo_blocks WHERE set_by = ${approver}`);
  assert.equal((r.rows ?? r)[0].n, 2);
});

test("PB6: a gem's image is hidden when its place is blocked", async () => {
  const blocks = await photoBlocks();
  const img = "https://cdn.example.org/gem.jpg";
  assert.equal(hideBlockedGemImage({ placeName: "Kiyomizu Temple", city: "Kyoto", imageUrl: img }, blocks).imageUrl, null);
  assert.equal(hideBlockedGemImage({ name: "Kiyomizudera", destination: "Kyoto", imageUrl: img }, blocks).imageUrl, null);
  assert.equal(hideBlockedGemImage({ placeName: "Nishiki Market", city: "Kyoto", imageUrl: img }, blocks).imageUrl, img);
  assert.equal(hideBlockedGemImage({ placeName: "Kiyomizu Temple", city: "Osaka", imageUrl: img }, blocks).imageUrl, img);
});
