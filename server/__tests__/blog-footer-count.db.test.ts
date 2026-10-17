/**
 * ED-1 footer count (ledger `2026-10-16-blog-footer-count`): the footer's Blog link is shown only when the
 * count of PUBLISHED posts in the post store meets `platform_settings.blog_footer_min_published` (default 5).
 *
 * F1 below the minimum → hidden. F2 at the minimum → shown. F3 the minimum is the setting, and the default 5
 * when the row is absent or invalid. F4 only `published` posts count. F5 a failed or absent count read →
 * hidden (fail-closed).
 *
 * The minimum is set RELATIVE to the published count already on the database, so posts other suites left
 * behind cannot move the answer. Every write is undone in `after`.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { blogFooterVisible, countPublished } from "../services/blog-posts.service";
import { getBlogFooterMinPublished, invalidatePlatformFlagCache } from "../services/platform-flags";
import { BLOG_FOOTER_MIN_PUBLISHED_DEFAULT, BLOG_FOOTER_MIN_PUBLISHED_SETTING } from "@shared/blog-footer";

const RUN = crypto.randomUUID().slice(0, 8);
let savedSetting: string | null = null;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${BLOG_FOOTER_MIN_PUBLISHED_SETTING}`);
  savedSetting = (r.rows[0] as any)?.setting_value ?? null;
});

after(async () => {
  await db.execute(sql`DELETE FROM blog_posts WHERE slug LIKE ${`fc-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${BLOG_FOOTER_MIN_PUBLISHED_SETTING}`).catch(() => {});
  if (savedSetting !== null) {
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${BLOG_FOOTER_MIN_PUBLISHED_SETTING}, ${savedSetting})`).catch(() => {});
  }
  invalidatePlatformFlagCache(BLOG_FOOTER_MIN_PUBLISHED_SETTING);
});

async function setMinimum(value: string | null): Promise<void> {
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${BLOG_FOOTER_MIN_PUBLISHED_SETTING}`);
  if (value !== null) {
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${BLOG_FOOTER_MIN_PUBLISHED_SETTING}, ${value})`);
  }
  invalidatePlatformFlagCache(BLOG_FOOTER_MIN_PUBLISHED_SETTING);
}

async function insertPost(tag: string, status: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO blog_posts (slug, content_type, authorship, status, title, body, content_sha256)
    VALUES (${`fc-${RUN}-${tag}`}, 'travelpulse_weekly', 'platform', ${status}, 'Footer count', 'Body', ${"0".repeat(64)})
  `);
}

test("F1–F2 below the minimum the link is hidden; at the minimum it is shown", async () => {
  const base = await countPublished();
  await setMinimum(String(base + 2));
  await insertPost("p1", "published");
  assert.equal(await countPublished(), base + 1);
  assert.equal(await blogFooterVisible(), false, "one short of the minimum: hidden");
  await insertPost("p2", "published");
  assert.equal(await blogFooterVisible(), true, "at the minimum: shown");
});

test("F3 the minimum is the setting, and 5 when the row is absent or invalid", async () => {
  await setMinimum("7");
  assert.equal(await getBlogFooterMinPublished(), 7);
  await setMinimum(null);
  assert.equal(await getBlogFooterMinPublished(), BLOG_FOOTER_MIN_PUBLISHED_DEFAULT);
  assert.equal(BLOG_FOOTER_MIN_PUBLISHED_DEFAULT, 5);
  for (const junk of ["0", "-3", "abc", "2.5", ""]) {
    await setMinimum(junk);
    assert.equal(await getBlogFooterMinPublished(), 5, `invalid ${JSON.stringify(junk)} reads the default`);
  }
});

test("F4 only published posts count — drafts, in-review, signed and withdrawn do not", async () => {
  const base = await countPublished();
  await setMinimum(String(base + 1));
  for (const status of ["draft", "in_review", "signed", "withdrawn"]) await insertPost(`np-${status}`, status);
  assert.equal(await countPublished(), base, "non-published rows are not counted");
  assert.equal(await blogFooterVisible(), false);
});

test("F5 a failed or absent count read is hidden (fail-closed)", async () => {
  const minimum = async () => 1;
  assert.equal(await blogFooterVisible({ count: async () => { throw new Error("db down"); }, minimum }), false, "failed read");
  assert.equal(await blogFooterVisible({ count: async () => undefined as unknown as number, minimum }), false, "absent count");
  assert.equal(await blogFooterVisible({ count: async () => Number.NaN, minimum }), false, "not a number");
  assert.equal(await blogFooterVisible({ count: async () => 1, minimum }), true, "control: a real count at the minimum shows");
});
