/**
 * Expert-signed blog — the ONE lifecycle (ledger `2026-09-27-blog-lifecycle`, Locked Decision 57;
 * rulings in docs/planning/briefs/lane-c.md).
 *
 *   expert posts:   draft ──submit──▶ in_review ──sign──▶ signed ──publish──▶ published ──withdraw──▶ withdrawn
 *   platform posts: draft ──publish──▶ published ──withdraw──▶ withdrawn        (TravelPulse weekly only)
 *
 * Rules that must not be weakened:
 *  - The CONTENT HASH covers title + summary + body + every source. It is computed here, server-side,
 *    on every write; a client never supplies it except to say WHICH version it signed.
 *  - SIGNING is an atomic conditional (§15): it succeeds only while the stored hash equals the hash
 *    the expert reviewed, the post names that expert, and it is `in_review`. The signature IS the
 *    per-post publishing consent (ruling 2) — `consent_at` is stamped in the same statement.
 *  - ANY edit after signing — an admin typo fix included — clears the signature and returns the post
 *    to `in_review`, and an edit to a published post takes it off the public read until re-signed
 *    and re-published (ruling 3).
 *  - PUBLISH requires `signed_content_sha256 = content_sha256` in the same statement, and re-checks
 *    the byline gate (ruling 9) — an expert who lost eligibility since signing is not published.
 *  - Posts are WITHDRAWN, never deleted.
 *  - Source quotes are capped by `BLOG_QUOTE_MAX_CHARS` and REFUSED over it (never truncated — a cut
 *    quote misquotes); a source on a partner's domain is REFUSED (ruling 4).
 */
import crypto from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { blogPosts, blogPostSources, blogPostReactions } from "@shared/schema";
import {
  BLOG_IMPRESSION_CONTENT_TYPE,
  BLOG_SLUG_RE,
  PLATFORM_POST_LABEL,
  authorshipFor,
  isBlogContentType,
  type BlogContentType,
  type BlogReactionKind,
} from "@shared/blog";
import { BLOG_QUOTE_MAX_CHARS, BLOG_RANK_MIN_IMPRESSIONS } from "../config/blog.config";
import { rankBlogPosts } from "./blog-ranking";
import { checkBylineEligibility, type BylineDecision } from "./blog-byline-gate.service";
import { loadPartnerHosts } from "./partner-hosts.service";
import { isOnPartnerHost, partnerHostOf } from "@shared/partner-hosts";

export interface BlogSourceInput {
  url: string;
  title?: string | null;
  publisher?: string | null;
  quote?: string | null;
  retrievedAt?: Date | null;
}

export interface BlogDeps {
  gate?: (expertId: string, marketSlug: string | null) => Promise<BylineDecision>;
  refusedHosts?: () => Promise<string[]>;
}

export class BlogError extends Error {
  constructor(public readonly code: string, public readonly status: number, message?: string) {
    super(message ?? code);
  }
}

// ── The hash ─────────────────────────────────────────────────────────────────────────────────

/** Pure. Canonical JSON of everything a reader sees, so any visible change moves the hash. */
export function computeContentSha256(c: {
  title: string;
  summary: string | null;
  body: string;
  sources: ReadonlyArray<{ url: string; title?: string | null; publisher?: string | null; quote?: string | null }>;
}): string {
  const canonical = JSON.stringify({
    title: c.title,
    summary: c.summary ?? null,
    body: c.body,
    sources: c.sources.map((s) => ({
      url: s.url,
      title: s.title ?? null,
      publisher: s.publisher ?? null,
      quote: s.quote ?? null,
    })),
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ── Source admission (ruling 4) ─────────────────────────────────────────────────────────────

/** Pure. A source host matches a partner host exactly or as a subdomain of it. */
export function sourceRefusal(
  s: BlogSourceInput,
  partnerHosts: readonly string[],
  quoteMax: number = BLOG_QUOTE_MAX_CHARS,
): string | null {
  const host = partnerHostOf(s.url);
  if (!host || !/^https?:\/\//i.test(s.url)) return "source_url_invalid";
  if (isOnPartnerHost(host, partnerHosts)) return "source_on_partner_domain";
  if (s.quote != null && s.quote.length > quoteMax) return `quote_over_${quoteMax}_chars`;
  return null;
}

async function admitSources(sources: BlogSourceInput[], deps: BlogDeps): Promise<void> {
  if (sources.length === 0) return;
  const hosts = await (deps.refusedHosts ?? loadPartnerHosts)();
  sources.forEach((s, i) => {
    const why = sourceRefusal(s, hosts);
    if (why) throw new BlogError(why, 400, `source ${i + 1}: ${why}`);
  });
}

// ── Create / edit ───────────────────────────────────────────────────────────────────────────

export interface CreatePostInput {
  contentType: string;
  slug: string;
  title: string;
  summary?: string | null;
  body: string;
  marketSlug?: string | null;
  occasionSlug?: string | null;
  bylineExpertId?: string | null;
  sources?: BlogSourceInput[];
}

export async function createPost(input: CreatePostInput, actorId: string, deps: BlogDeps = {}) {
  if (!isBlogContentType(input.contentType)) throw new BlogError("unknown_content_type", 400);
  if (!BLOG_SLUG_RE.test(input.slug)) throw new BlogError("invalid_slug", 400);
  const contentType = input.contentType as BlogContentType;
  const authorship = authorshipFor(contentType);
  const bylineExpertId = input.bylineExpertId ?? null;
  if (authorship === "expert" && !bylineExpertId) throw new BlogError("byline_required", 400);
  if (authorship === "platform" && bylineExpertId) throw new BlogError("platform_post_has_no_byline", 400);
  if (authorship === "expert" && !input.marketSlug) throw new BlogError("market_required", 400);
  const sources = input.sources ?? [];
  await admitSources(sources, deps);
  const summary = input.summary ?? null;
  const hash = computeContentSha256({ title: input.title, summary, body: input.body, sources });

  return db.transaction(async (tx) => {
    const clash = await tx.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, input.slug)).limit(1);
    if (clash.length) throw new BlogError("slug_taken", 409);
    const [row] = await tx.insert(blogPosts).values({
      slug: input.slug,
      contentType,
      authorship,
      status: "draft",
      marketSlug: input.marketSlug ?? null,
      occasionSlug: input.occasionSlug ?? null,
      title: input.title,
      summary,
      body: input.body,
      contentSha256: hash,
      bylineExpertId,
      createdBy: actorId,
    }).returning();
    if (sources.length) {
      await tx.insert(blogPostSources).values(sources.map((s, i) => ({
        postId: row.id,
        position: i + 1,
        url: s.url,
        title: s.title ?? null,
        publisher: s.publisher ?? null,
        quote: s.quote ?? null,
        retrievedAt: s.retrievedAt ?? null,
      })));
    }
    return row;
  });
}

export interface EditPostInput {
  title?: string;
  summary?: string | null;
  body?: string;
  sources?: BlogSourceInput[];
}

/**
 * Any edit recomputes the hash. A post that was in_review, signed or published returns to
 * `in_review` (expert) or `draft` (platform) with its signature cleared (ruling 3). A withdrawn post
 * is not edited — a new post is written instead.
 */
export async function editPost(id: string, patch: EditPostInput, actorId: string, deps: BlogDeps = {}) {
  if (patch.sources) await admitSources(patch.sources, deps);
  return db.transaction(async (tx) => {
    const cur = await tx.execute(sql`SELECT * FROM blog_posts WHERE id = ${id} FOR UPDATE`);
    const row = cur.rows[0] as any;
    if (!row) throw new BlogError("not_found", 404);
    if (row.status === "withdrawn") throw new BlogError("withdrawn_posts_are_not_edited", 409);

    const title = patch.title ?? row.title;
    const summary = patch.summary !== undefined ? patch.summary : row.summary;
    const body = patch.body ?? row.body;
    let sources: BlogSourceInput[];
    if (patch.sources) {
      sources = patch.sources;
      await tx.delete(blogPostSources).where(eq(blogPostSources.postId, id));
      if (sources.length) {
        await tx.insert(blogPostSources).values(sources.map((s, i) => ({
          postId: id, position: i + 1, url: s.url, title: s.title ?? null,
          publisher: s.publisher ?? null, quote: s.quote ?? null, retrievedAt: s.retrievedAt ?? null,
        })));
      }
    } else {
      sources = await tx.select().from(blogPostSources).where(eq(blogPostSources.postId, id)).orderBy(asc(blogPostSources.position));
    }
    const hash = computeContentSha256({ title, summary, body, sources });
    const nextStatus =
      row.status === "draft" ? "draft" : row.authorship === "platform" ? "draft" : "in_review";

    const [updated] = await tx.update(blogPosts).set({
      title, summary, body,
      contentSha256: hash,
      status: nextStatus,
      signedBy: null, signedAt: null, signedContentSha256: null, consentAt: null,
      updatedAt: new Date(),
    }).where(eq(blogPosts.id, id)).returning();
    void actorId;
    return updated;
  });
}

// ── Review, sign, publish, withdraw ─────────────────────────────────────────────────────────

async function gateFor(deps: BlogDeps, expertId: string, market: string | null): Promise<void> {
  const decision = await (deps.gate ?? checkBylineEligibility)(expertId, market);
  if (!decision.eligible) throw new BlogError(`byline_${decision.reason}`, 409);
}

async function readStatus(id: string) {
  const r = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  return r[0] ?? null;
}

export async function submitForReview(id: string, deps: BlogDeps = {}) {
  const post = await readStatus(id);
  if (!post) throw new BlogError("not_found", 404);
  if (post.authorship !== "expert") throw new BlogError("platform_posts_are_not_reviewed", 409);
  await gateFor(deps, post.bylineExpertId!, post.marketSlug);
  const [row] = await db.update(blogPosts)
    .set({ status: "in_review", updatedAt: new Date() })
    .where(and(eq(blogPosts.id, id), eq(blogPosts.status, "draft")))
    .returning();
  if (!row) throw new BlogError("not_a_draft", 409);
  return row;
}

/**
 * The expert signs EXACTLY the version they reviewed. One statement: status, byline and hash are all
 * in the WHERE, and the signature doubles as the publishing consent (ruling 2).
 */
export async function signPost(id: string, expertId: string, reviewedSha256: string, deps: BlogDeps = {}) {
  const post = await readStatus(id);
  // Not found and not yours are one answer (LD 40 posture): the rail does not reveal other experts' drafts.
  if (!post || post.bylineExpertId !== expertId) throw new BlogError("not_found", 404);
  await gateFor(deps, expertId, post.marketSlug);
  const now = new Date();
  const [row] = await db.update(blogPosts)
    .set({
      status: "signed",
      signedBy: expertId,
      signedAt: now,
      consentAt: now,
      signedContentSha256: sql`content_sha256`,
      updatedAt: now,
    })
    .where(and(
      eq(blogPosts.id, id),
      eq(blogPosts.status, "in_review"),
      eq(blogPosts.bylineExpertId, expertId),
      eq(blogPosts.contentSha256, reviewedSha256),
    ))
    .returning();
  if (!row) {
    const again = await readStatus(id);
    if (again && again.status === "in_review" && again.contentSha256 !== reviewedSha256) {
      throw new BlogError("content_changed_since_review", 409);
    }
    throw new BlogError("not_in_review", 409);
  }
  return row;
}

export async function publishPost(id: string, adminId: string, deps: BlogDeps = {}) {
  const post = await readStatus(id);
  if (!post) throw new BlogError("not_found", 404);
  const now = new Date();
  if (post.authorship === "expert") {
    await gateFor(deps, post.bylineExpertId ?? "", post.marketSlug);
    const [row] = await db.update(blogPosts)
      .set({ status: "published", publishedBy: adminId, publishedAt: now, updatedAt: now })
      .where(and(
        eq(blogPosts.id, id),
        eq(blogPosts.status, "signed"),
        sql`${blogPosts.signedContentSha256} = ${blogPosts.contentSha256}`,
      ))
      .returning();
    if (!row) throw new BlogError("not_signed_for_this_content", 409);
    return row;
  }
  const [row] = await db.update(blogPosts)
    .set({ status: "published", publishedBy: adminId, publishedAt: now, updatedAt: now })
    .where(and(eq(blogPosts.id, id), eq(blogPosts.status, "draft"), eq(blogPosts.authorship, "platform")))
    .returning();
  if (!row) throw new BlogError("not_a_draft", 409);
  return row;
}

export async function withdrawPost(id: string, adminId: string, reason: string | null) {
  const now = new Date();
  const [row] = await db.update(blogPosts)
    .set({ status: "withdrawn", withdrawnBy: adminId, withdrawnAt: now, withdrawReason: reason, updatedAt: now })
    .where(and(eq(blogPosts.id, id), eq(blogPosts.status, "published")))
    .returning();
  if (!row) throw new BlogError("not_published", 409);
  return row;
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────

async function sourcesFor(postId: string) {
  const rows = await db.select().from(blogPostSources).where(eq(blogPostSources.postId, postId)).orderBy(asc(blogPostSources.position));
  return rows.map((s) => ({ url: s.url, title: s.title, publisher: s.publisher, quote: s.quote }));
}

/**
 * The PUBLIC projection — an allowlist. The byline is the expert's HANDLE and display name, never a
 * user id (LD 40); a platform post carries the ruling-5 label instead of a byline.
 */
export async function toPublicPost(row: any) {
  let byline: { handle: string; displayName: string } | null = null;
  if (row.authorship === "expert" && row.byline_expert_id) {
    const u = await db.execute(sql`SELECT handle, first_name, last_name FROM users WHERE id = ${row.byline_expert_id} LIMIT 1`);
    const r = u.rows[0] as any;
    if (r?.handle) {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
      byline = { handle: r.handle, displayName: name || r.handle };
    }
  }
  return {
    slug: row.slug,
    contentType: row.content_type,
    marketSlug: row.market_slug,
    occasionSlug: row.occasion_slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    publishedAt: row.published_at,
    byline,
    platformLabel: row.authorship === "platform" ? PLATFORM_POST_LABEL : null,
    sources: await sourcesFor(row.id),
  };
}

/** How many published posts the index ranks over before it cuts to a page (the index is small). */
const RANK_POOL_CAP = 500;

/**
 * The blog index, RANKED (ruling 6): measured quality first, recency otherwise, through the ONE
 * pure `rankBlogPosts`. Reaction and impression counts are read here to ORDER the list and are
 * never emitted — the public projection carries no count (ruling 6: no displayed counts).
 * `minImpressions` is injectable for tests only; production reads the config.
 */
export async function listPublished(
  opts: { marketSlug?: string | null; limit?: number; minImpressions?: number } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const r = await db.execute(sql`
    SELECT p.*,
           (SELECT count(*)::int FROM blog_post_reactions x WHERE x.post_id = p.id) AS rank_reactions,
           (SELECT count(*)::int FROM content_impressions ci
             WHERE ci.content_type = ${BLOG_IMPRESSION_CONTENT_TYPE} AND ci.content_id = p.slug) AS rank_impressions
      FROM blog_posts p
     WHERE p.status = 'published'
       ${opts.marketSlug ? sql`AND p.market_slug = ${opts.marketSlug}` : sql``}
     ORDER BY p.published_at DESC NULLS LAST
     LIMIT ${RANK_POOL_CAP}
  `);
  const rows = (r.rows as any[]).map((row) => ({
    row,
    slug: String(row.slug),
    publishedAt: row.published_at ?? null,
    impressions: Number(row.rank_impressions ?? 0),
    reactions: Number(row.rank_reactions ?? 0),
  }));
  const ranked = rankBlogPosts(rows, opts.minImpressions ?? BLOG_RANK_MIN_IMPRESSIONS).slice(0, limit);
  return Promise.all(ranked.map((x) => toPublicPost(x.row)));
}

export async function getPublishedBySlug(slug: string) {
  const r = await db.execute(sql`SELECT * FROM blog_posts WHERE slug = ${slug} AND status = 'published' LIMIT 1`);
  const row = r.rows[0];
  return row ? toPublicPost(row) : null;
}

export async function countPublished(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM blog_posts WHERE status = 'published'`);
  return Number((r.rows[0] as any)?.n ?? 0);
}

/** The expert's review queue: their own `in_review` posts, with the hash they sign against. */
export async function listForReview(expertId: string) {
  const rows = await db.select().from(blogPosts)
    .where(and(eq(blogPosts.bylineExpertId, expertId), eq(blogPosts.status, "in_review")))
    .orderBy(desc(blogPosts.updatedAt));
  return Promise.all(rows.map(async (p) => ({
    id: p.id, slug: p.slug, contentType: p.contentType, marketSlug: p.marketSlug,
    title: p.title, summary: p.summary, body: p.body, contentSha256: p.contentSha256,
    sources: await sourcesFor(p.id),
  })));
}

export async function adminListPosts(status?: string | null) {
  const where = status ? eq(blogPosts.status, status) : undefined;
  return db.select().from(blogPosts).where(where).orderBy(desc(blogPosts.updatedAt)).limit(200);
}

// ── Reactions (ruling 6) ─────────────────────────────────────────────────────────────────────
// The reader is the SESSION user (§14 applied to a write that moves no money). A reaction exists
// only on a PUBLISHED post; any other slug is the one `not_found` (LD 40 posture — this rail
// cannot be used to learn which drafts exist). Adding is idempotent at the statement (the UNIQUE
// (post, user, kind) + ON CONFLICT DO NOTHING); removing a reaction that is not there is a no-op.

async function publishedPostIdBySlug(slug: string): Promise<string> {
  const r = await db.execute(sql`SELECT id FROM blog_posts WHERE slug = ${slug} AND status = 'published' LIMIT 1`);
  const id = (r.rows[0] as any)?.id;
  if (!id) throw new BlogError("not_found", 404);
  return String(id);
}

export async function addReaction(slug: string, userId: string, kind: BlogReactionKind) {
  const postId = await publishedPostIdBySlug(slug);
  await db.insert(blogPostReactions).values({ postId, userId, kind }).onConflictDoNothing();
  return myReactions(slug, userId);
}

export async function removeReaction(slug: string, userId: string, kind: BlogReactionKind) {
  const postId = await publishedPostIdBySlug(slug);
  await db.delete(blogPostReactions).where(and(
    eq(blogPostReactions.postId, postId),
    eq(blogPostReactions.userId, userId),
    eq(blogPostReactions.kind, kind),
  ));
  return myReactions(slug, userId);
}

/** The viewer's OWN reactions on one post — never anyone else's, and never a count. */
export async function myReactions(slug: string, userId: string): Promise<BlogReactionKind[]> {
  const postId = await publishedPostIdBySlug(slug);
  const rows = await db.select({ kind: blogPostReactions.kind }).from(blogPostReactions)
    .where(and(eq(blogPostReactions.postId, postId), eq(blogPostReactions.userId, userId)))
    .orderBy(asc(blogPostReactions.kind));
  return rows.map((r) => r.kind as BlogReactionKind);
}

// ── "Ask the local" (ruling 7) ───────────────────────────────────────────────────────────────

/**
 * The conversation target of an "Ask the local" press: a PUBLISHED, EXPERT-authored post and the
 * expert whose byline it carries. A platform post has no local to ask, and an unpublished one does
 * not exist to a reader — both are null, which the contact rail answers as its one `not_found`.
 * The recipient is server-derived from the row (LD 40); the client names only the post's slug.
 */
export async function resolveAskTheLocal(slug: string): Promise<{ postId: string; expertId: string } | null> {
  const r = await db.execute(sql`
    SELECT id, byline_expert_id FROM blog_posts
     WHERE slug = ${slug} AND status = 'published' AND authorship = 'expert' AND byline_expert_id IS NOT NULL
     LIMIT 1
  `);
  const row = r.rows[0] as any;
  return row ? { postId: String(row.id), expertId: String(row.byline_expert_id) } : null;
}
