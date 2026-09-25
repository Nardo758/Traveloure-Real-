/**
 * RC-10 — THE PROFILE PHOTO IS SAVED (ledger `2026-09-25-rc10-profile-photo`; audit
 * `docs/audits/GAP_REGISTER.md` §A row 31, U2 CONFIRMED `ui/profile__button-save-profile/`:
 * "image sent to server=false", toast "Photo updated", old avatar after reload).
 *
 * What these hold (the REAL router on a loopback express app with a chosen session identity —
 * the `dates-confirmed` harness; a DB because `isAuthenticated` looks the session user up; NO
 * object-storage bucket, so the upload path is proven up to the storage boundary):
 *   S1–S3  the ONE format sniff: JPEG and PNG by magic bytes; anything else — including a
 *          Content-Type that lies — is refused.
 *   K1–K2  `managedAvatarObjectKey` maps only THIS rail's proxy URLs back to an object key; an
 *          OAuth-claimed or external URL is never treated as ours to delete.
 *   R1     anonymous ⇒ 401 (the actor is the session, §14).
 *   R2     an empty body ⇒ 400 PROFILE_PHOTO_REQUIRED; bytes that are not JPEG/PNG ⇒ 400
 *          PROFILE_PHOTO_INVALID_FORMAT, whatever the header claimed; the row is untouched.
 *   R3     a valid image with NO object storage configured ⇒ 503 OBJECT_STORAGE_UNAVAILABLE, the
 *          row untouched, and nothing claims the photo was saved (§13).
 *   R4     the public proxy answers ONE 404 for a malformed name and for an unknown/unavailable
 *          object alike, and is addressed by a random file name, never a user id (LD 40).
 *   R5     DELETE NULLs the column and reports `hadPhoto` honestly — true for an external URL it
 *          did not own, false on the second call.
 *   C1–C3  source pins: the router is MOUNTED (§9), `/profile` posts the FILE and toasts only on
 *          the server's answer, and the data-URL-and-toast shape is gone.
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit \
 *        server/__tests__/profile-photo.db.test.ts
 */
delete process.env.REPLIT_OBJECT_STORAGE_BUCKET;

import test, { before, after } from "node:test";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sniffImageFormat } from "../utils/image-magic";
import profilePhotoRoutes, { AVATAR_PUBLIC_PREFIX, managedAvatarObjectKey } from "../routes/profile-photo.routes";

const RUN = crypto.randomBytes(4).toString("hex");
const USER = `pp-${RUN}-user`;
const EXTERNAL_PHOTO = "https://lh3.googleusercontent.com/a/claimed-at-sign-in.jpg";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(
      `[profile-photo] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}
async function photoOf(userId: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT profile_image_url FROM users WHERE id = ${userId}`);
  return ((r.rows[0] as any)?.profile_image_url ?? null) as string | null;
}
before(async () => {
  await assertDisposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, profile_image_url)
    VALUES (${USER}, ${`pp-${RUN}@t.test`}, 'Photo', 'Owner', ${EXTERNAL_PHOTO})
  `);
});
after(async () => {
  await db.execute(sql`DELETE FROM users WHERE id = ${USER}`);
});

const ROOT = resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 2)]);
const GIF = Buffer.from("GIF89a-not-accepted-here");

async function asUser<T>(userId: string | null, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use((req, _res, next) => {
    if (userId) {
      (req as any).user = { claims: { sub: userId } };
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  app.use(profilePhotoRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const post = (base: string, body: Buffer | null, contentType = "image/jpeg") =>
  fetch(`${base}/api/me/profile-photo`, { method: "POST", headers: { "content-type": contentType }, body: body ?? undefined });

test("S1: JPEG by its bytes", () => assert.deepEqual(sniffImageFormat(JPEG), { ext: "jpg", contentType: "image/jpeg" }));
test("S2: PNG by its bytes", () => assert.deepEqual(sniffImageFormat(PNG), { ext: "png", contentType: "image/png" }));
test("S3: anything else is null — a GIF, a text file, an empty buffer", () => {
  assert.equal(sniffImageFormat(GIF), null);
  assert.equal(sniffImageFormat(Buffer.from("<svg/>")), null);
  assert.equal(sniffImageFormat(Buffer.alloc(0)), null);
});

test("K1: only this rail's proxy URLs map back to an object key", () => {
  const file = "0123456789abcdef0123456789abcdef.png";
  assert.equal(managedAvatarObjectKey(`${AVATAR_PUBLIC_PREFIX}${file}`), `avatars/${file}`);
  assert.equal(managedAvatarObjectKey(`  ${AVATAR_PUBLIC_PREFIX}${file}  `), `avatars/${file}`);
});
test("K2: an OAuth-claimed, external, malformed or absent URL is never ours to delete", () => {
  assert.equal(managedAvatarObjectKey("https://lh3.googleusercontent.com/a/photo.jpg"), null);
  assert.equal(managedAvatarObjectKey("https://storage.googleapis.com/bucket/avatars/x.jpg"), null);
  assert.equal(managedAvatarObjectKey(`${AVATAR_PUBLIC_PREFIX}../secrets.txt`), null);
  assert.equal(managedAvatarObjectKey(`${AVATAR_PUBLIC_PREFIX}short.jpg`), null);
  assert.equal(managedAvatarObjectKey(null), null);
  assert.equal(managedAvatarObjectKey(undefined), null);
});

test("R1: anonymous ⇒ 401 on upload and on remove", async () => {
  await asUser(null, async (base) => {
    assert.equal((await post(base, JPEG)).status, 401);
    assert.equal((await fetch(`${base}/api/me/profile-photo`, { method: "DELETE" })).status, 401);
  });
});

test("R2: an empty body and a lying Content-Type are refused by code", async () => {
  await asUser(USER, async (base) => {
    const empty = await post(base, null);
    assert.equal(empty.status, 400);
    assert.equal(((await empty.json()) as any).code, "PROFILE_PHOTO_REQUIRED");
    const gif = await post(base, GIF, "image/png"); // header says PNG; bytes say GIF
    assert.equal(gif.status, 400);
    assert.equal(((await gif.json()) as any).code, "PROFILE_PHOTO_INVALID_FORMAT");
    assert.equal(await photoOf(USER), EXTERNAL_PHOTO, "a refused upload touches nothing");
  });
});

test("R3: a valid image with no object storage ⇒ 503, and nothing claims it was saved", async () => {
  await asUser(USER, async (base) => {
    const res = await post(base, PNG, "image/png");
    assert.equal(res.status, 503);
    const body = (await res.json()) as any;
    assert.equal(body.code, "OBJECT_STORAGE_UNAVAILABLE");
    assert.equal("profileImageUrl" in body, false);
    assert.equal(await photoOf(USER), EXTERNAL_PHOTO, "nothing was written for a photo that was not kept");
  });
});

test("R5: DELETE NULLs the column and reports hadPhoto honestly, twice", async () => {
  await asUser(USER, async (base) => {
    const first = await fetch(`${base}/api/me/profile-photo`, { method: "DELETE" });
    assert.equal(first.status, 200);
    assert.equal(((await first.json()) as any).hadPhoto, true);
    assert.equal(await photoOf(USER), null);
    const second = await fetch(`${base}/api/me/profile-photo`, { method: "DELETE" });
    assert.equal(second.status, 200);
    assert.equal(((await second.json()) as any).hadPhoto, false, "no photo is not rendered as a removal");
  });
});

test("R4: the public proxy answers one 404 for a malformed name and an unavailable object alike", async () => {
  await asUser(null, async (base) => {
    for (const path of ["/api/avatars/../x.jpg", "/api/avatars/u-1.jpg", "/api/avatars/0123456789abcdef0123456789abcdef.gif"]) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
    assert.equal((await fetch(`${base}/api/avatars/0123456789abcdef0123456789abcdef.jpg`)).status, 404);
  });
});

test("C1: the router is mounted in server/routes.ts (§9 — an unmounted router is a dead endpoint)", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /import profilePhotoRoutes from "\.\/routes\/profile-photo\.routes";/);
  assert.match(routes, /app\.use\(profilePhotoRoutes\);/);
});

test("C2: /profile posts the FILE and toasts only on the server's answer", () => {
  const page = read("client/src/pages/profile.tsx");
  assert.match(page, /fetch\("\/api\/me\/profile-photo", \{\n\s+method: "POST",/);
  assert.match(page, /body: file,/);
  assert.match(page, /fetch\("\/api\/me\/profile-photo", \{ method: "DELETE"/);
  // The toast lives in the mutation's onSuccess — after the response, never before the request.
  const uploadStart = page.indexOf("const uploadPhotoMutation");
  const uploadEnd = page.indexOf("const removePhotoMutation");
  const upload = page.slice(uploadStart, uploadEnd);
  assert.ok(upload.indexOf("onSuccess") < upload.indexOf('title: "Photo updated"'));
  assert.match(upload, /invalidateQueries\(\{ queryKey: \["\/api\/auth\/user"\] \}\)/);
});

test("C3: the data-URL-and-toast shape is gone", () => {
  const page = read("client/src/pages/profile.tsx");
  assert.equal(page.includes("readAsDataURL"), false);
  assert.equal(page.includes("FileReader"), false);
});
