/**
 * Blog reactions, ranking, "Ask the local" and crawler honesty (ledger `2026-09-27-blog-reactions-ask`,
 * Lane C rulings 6–7, Locked Decision 57 / LD 40 amended).
 *
 * K1–K4 are pure. K5–K10 run against a disposable database; published posts are inserted as
 * fixtures (the lifecycle that produces them is proven by blog-lifecycle.db.test.ts).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { blogQualityScore, rankBlogPosts } from "../services/blog-ranking";
import { BLOG_NOINDEX, blogIndexRobots, blogPostRobots, publishedBlogSitemapEntries, robotsForIndex, robotsForPost } from "../services/blog-seo.service";
import { BlogError, addReaction, listPublished, myReactions, removeReaction } from "../services/blog-posts.service";
import { resolveContactTarget } from "../services/contact-rails.service";
import { contextLabel } from "../services/contact-rails.pure";
import { contactStartBodySchema } from "@shared/contact-address";
import { BLOG_IMPRESSION_CONTENT_TYPE } from "@shared/blog";

const RUN = crypto.randomUUID().slice(0, 8);
const EXPERT = `bra-${RUN}-expert`;
const READER = `bra-${RUN}-reader`;
const slug = (s: string) => `k-${RUN}-${s}`;
const ids: Record<string, string> = {};

async function post(key: string, o: { status?: string; authorship?: string; byline?: string | null; publishedAt?: string; market?: string }) {
  const id = crypto.randomUUID();
  ids[key] = id;
  await db.execute(sql`
    INSERT INTO blog_posts (id, slug, content_type, authorship, status, market_slug, title, body, content_sha256, byline_expert_id, published_at)
    VALUES (${id}, ${slug(key)}, ${o.authorship === "platform" ? "travelpulse_weekly" : "occasion_market_guide"},
            ${o.authorship ?? "expert"}, ${o.status ?? "published"}, ${o.market ?? `m${RUN}`}, ${`Title ${key}`}, 'Body',
            ${"0".repeat(64)}, ${o.byline === undefined ? EXPERT : o.byline}, ${o.publishedAt ?? new Date().toISOString()})
  `);
}
async function impressions(key: string, n: number) {
  for (let i = 0; i < n; i++) {
    await db.execute(sql`
      INSERT INTO content_impressions (id, content_type, content_id, session_id)
      VALUES (${crypto.randomUUID()}, ${BLOG_IMPRESSION_CONTENT_TYPE}, ${slug(key)}, ${`s-${RUN}-${key}-${i}`})
    `);
  }
}
async function code(p: Promise<unknown>) {
  try { await p; return "ok"; } catch (e) { return e instanceof BlogError ? e.code : `unexpected:${(e as Error).message}`; }
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role, handle) VALUES
    (${EXPERT}, ${`${EXPERT}@t.test`}, 'expert', ${`bra${RUN}`}),
    (${READER}, ${`${READER}@t.test`}, 'user', NULL)`);
  await post("old", { publishedAt: "2026-01-01T00:00:00Z" });
  await post("new", { publishedAt: "2026-09-01T00:00:00Z" });
  await post("liked", { publishedAt: "2025-06-01T00:00:00Z" });
  await post("draft", { status: "in_review" });
  await post("pulse", { authorship: "platform", byline: null });
});

after(async () => {
  await db.execute(sql`DELETE FROM content_impressions WHERE content_type = ${BLOG_IMPRESSION_CONTENT_TYPE} AND content_id LIKE ${`k-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM conversation_contexts WHERE created_by IN (${READER}, ${EXPERT})`).catch(() => {});
  await db.execute(sql`DELETE FROM blog_posts WHERE slug LIKE ${`k-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${EXPERT}, ${READER})`).catch(() => {});
});

test("K1 a post is UNMEASURED below the impression floor — null, never 0", () => {
  assert.equal(blogQualityScore({ impressions: 4, reactions: 3 }, 50), null);
  assert.equal(blogQualityScore({ impressions: 0, reactions: 0 }, 0), null, "no impressions is never a score");
  assert.equal(blogQualityScore({ impressions: 50, reactions: 10 }, 50), 20);
  assert.equal(blogQualityScore({ impressions: 50, reactions: 90 }, 50), 100, "capped at 100");
});

test("K2 ranking: measured quality leads, recency orders the rest", () => {
  const ranked = rankBlogPosts([
    { slug: "a", publishedAt: "2026-01-01", impressions: 3, reactions: 3 },
    { slug: "b", publishedAt: "2026-09-01", impressions: 0, reactions: 0 },
    { slug: "c", publishedAt: "2025-01-01", impressions: 100, reactions: 30 },
  ], 50);
  assert.deepEqual(ranked.map((p) => p.slug), ["c", "b", "a"]);
});

test("K3 robots: an empty index and an unpublished post are noindex; published is indexable", () => {
  assert.equal(robotsForIndex(0), BLOG_NOINDEX);
  assert.equal(robotsForIndex(null), BLOG_NOINDEX, "a failed count never indexes");
  assert.equal(robotsForIndex(3), null);
  assert.equal(robotsForPost(false), BLOG_NOINDEX);
  assert.equal(robotsForPost(null), BLOG_NOINDEX);
  assert.equal(robotsForPost(true), null);
});

test("K4 the `blogPostSlug` address is exactly-one and labelled by title, never by id", () => {
  assert.ok(contactStartBodySchema.safeParse({ blogPostSlug: "kyoto-in-november" }).success);
  assert.equal(contactStartBodySchema.safeParse({ blogPostSlug: "a", handle: "someone" }).success, false);
  assert.equal(contactStartBodySchema.safeParse({ blogPostSlug: "Not A Slug!" }).success, false);
  assert.equal(contextLabel("blog_post", "post-id-1", "Kyoto in November"), "Post: Kyoto in November");
  const unnamed = contextLabel("blog_post", "post-id-1", null);
  assert.equal(unnamed, "A blog post");
  assert.ok(!unnamed.includes("post-id-1"));
});

test("K5 reactions: the session reader's own set, idempotent, published posts only", async () => {
  assert.deepEqual(await addReaction(slug("new"), READER, "useful"), ["useful"]);
  assert.deepEqual(await addReaction(slug("new"), READER, "useful"), ["useful"], "a repeat adds nothing");
  assert.deepEqual(await addReaction(slug("new"), READER, "want_this"), ["useful", "want_this"]);
  assert.deepEqual(await removeReaction(slug("new"), READER, "useful"), ["want_this"]);
  assert.deepEqual(await removeReaction(slug("new"), READER, "useful"), ["want_this"], "removing an absent reaction is a no-op");
  assert.deepEqual(await myReactions(slug("new"), EXPERT), [], "another person's reactions are never shown");
  assert.equal(await code(addReaction(slug("draft"), READER, "useful")), "not_found", "a draft does not exist to a reader");
  assert.equal(await code(addReaction(slug("nope"), READER, "useful")), "not_found");
});

test("K6 the index is ranked, and emits no count", async () => {
  await impressions("liked", 5);
  await db.execute(sql`INSERT INTO blog_post_reactions (post_id, user_id, kind) VALUES (${ids.liked}, ${READER}, 'useful'), (${ids.liked}, ${READER}, 'been_there')`);
  const unmeasured = await listPublished({ marketSlug: `m${RUN}`, minImpressions: 50 });
  // Below the floor the order is recency alone (the platform post was published "now").
  assert.deepEqual(unmeasured.map((p) => p.slug), [slug("pulse"), slug("new"), slug("old"), slug("liked")]);
  assert.equal(unmeasured.at(-1)!.slug, slug("liked"), "below the floor, the oldest post stays last whatever its reactions");
  const measured = await listPublished({ marketSlug: `m${RUN}`, minImpressions: 5 });
  assert.equal(measured[0].slug, slug("liked"), "at the floor, the reacted-to post leads");
  assert.ok(!unmeasured.some((p) => p.slug === slug("draft")), "unpublished posts are never listed");
  for (const p of measured) {
    const json = JSON.stringify(p);
    assert.ok(!/rank_|impression|reaction/i.test(json), "no count reaches the public projection");
  }
});

test("K7 Ask the local: a published expert post resolves to its byline expert, and only that", async () => {
  const ok = await resolveContactTarget(READER, { blogPostSlug: slug("new") });
  assert.deepEqual(ok, { ok: true, target: { recipientId: EXPERT, context: { kind: "blog_post", id: ids.new } } });
  assert.deepEqual(await resolveContactTarget(READER, { blogPostSlug: slug("draft") }), { ok: false, reason: "not_found" });
  assert.deepEqual(await resolveContactTarget(READER, { blogPostSlug: slug("pulse") }), { ok: false, reason: "not_found" }, "a platform post has no local to ask");
  assert.deepEqual(await resolveContactTarget(READER, { blogPostSlug: slug("missing") }), { ok: false, reason: "not_found" });
  assert.deepEqual(await resolveContactTarget(EXPERT, { blogPostSlug: slug("new") }), { ok: false, reason: "self" });
});

test("K8 crawler honesty: robots and sitemap read the same published predicate", async () => {
  assert.equal(await blogPostRobots(slug("new")), null);
  assert.equal(await blogPostRobots(slug("draft")), BLOG_NOINDEX);
  assert.equal(await blogPostRobots("../etc"), BLOG_NOINDEX);
  assert.equal(await blogIndexRobots(), null, "with a published post, the index is indexable");
  const entries = (await publishedBlogSitemapEntries()).map((e) => e.path);
  assert.ok(entries.includes("/blog"));
  assert.ok(entries.includes(`/blog/${slug("new")}`));
  assert.ok(!entries.includes(`/blog/${slug("draft")}`), "an unreviewed post is never in the sitemap");
});
