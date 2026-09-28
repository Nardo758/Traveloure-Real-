/**
 * EXPERT-SIGNED BLOG — routes (ledger `2026-09-27-blog-lifecycle`, Locked Decision 57).
 *
 *   Admin (under §2's blanket `/api/admin` guard, registered before this router is mounted):
 *     GET  /api/admin/blog/posts[?status=]          list
 *     POST /api/admin/blog/posts                    create a draft (.strict pick — §19)
 *     POST /api/admin/blog/drafts                   research + AI draft → a draft post (C.2)
 *     PATCH /api/admin/blog/posts/:id               edit — clears any signature (ruling 3)
 *     POST /api/admin/blog/posts/:id/submit         draft → in_review (byline gate)
 *     POST /api/admin/blog/posts/:id/publish        only when signed for THIS content
 *     POST /api/admin/blog/posts/:id/withdraw       published → withdrawn (never deleted)
 *   Expert (the byline expert, from the SESSION — §14):
 *     GET  /api/expert/blog/review                  my posts awaiting my signature
 *     POST /api/expert/blog/posts/:id/sign          { contentSha256 } — the version I reviewed
 *   Public (published only; allowlist projection; no user ids — LD 40):
 *     GET  /api/blog/posts[?market=]                ranked (ruling 6) — no counts emitted
 *     GET  /api/blog/posts/:slug
 *   Reader reactions (signed-in, the SESSION user, published posts only — ruling 6):
 *     GET  /api/blog/posts/:slug/reactions/mine     POST /api/blog/posts/:slug/reactions { kind }
 *     DELETE /api/blog/posts/:slug/reactions/:kind
 *   "Ask the local" is NOT here: it is the `blogPostSlug` address on the ONE contact start rail
 *   (`POST /api/conversations/start`, ruling 7 / LD 40 amended).
 */
import { Router, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { BLOG_POST_STATUSES, BLOG_REACTION_KINDS } from "@shared/blog";
import {
  BlogError,
  addReaction,
  adminListPosts,
  createPost,
  editPost,
  getPublishedBySlug,
  listForReview,
  listPublished,
  myReactions,
  publishPost,
  removeReaction,
  signPost,
  submitForReview,
  withdrawPost,
} from "../services/blog-posts.service";
import { draftPostFromResearch } from "../services/blog-draft.service";

const router = Router();

const sourceBody = z.object({
  url: z.string().url().max(2000),
  title: z.string().max(300).nullable().optional(),
  publisher: z.string().max(200).nullable().optional(),
  quote: z.string().nullable().optional(),
}).strict();

const createBody = z.object({
  contentType: z.string().max(40),
  slug: z.string().max(160),
  title: z.string().min(1).max(200),
  summary: z.string().max(1000).nullable().optional(),
  body: z.string().min(1),
  marketSlug: z.string().max(40).nullable().optional(),
  occasionSlug: z.string().max(80).nullable().optional(),
  bylineExpertId: z.string().max(255).nullable().optional(),
  sources: z.array(sourceBody).max(40).optional(),
}).strict();

const editBody = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(1000).nullable().optional(),
  body: z.string().min(1).optional(),
  sources: z.array(sourceBody).max(40).optional(),
}).strict();

const signBody = z.object({ contentSha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const reactionBody = z.object({ kind: z.enum(BLOG_REACTION_KINDS) }).strict();
const reactionKindParam = z.enum(BLOG_REACTION_KINDS);
const withdrawBody = z.object({ reason: z.string().max(200).nullable().optional() }).strict();

function fail(res: Response, err: unknown) {
  if (err instanceof BlogError) return res.status(err.status).json({ error: err.code });
  console.error("[blog] unexpected error", err);
  return res.status(500).json({ error: "internal_error" });
}

// ── Admin ────────────────────────────────────────────────────────────────────────────────────

router.get("/api/admin/blog/posts", async (req, res) => {
  const status = typeof req.query.status === "string" && (BLOG_POST_STATUSES as readonly string[]).includes(req.query.status)
    ? req.query.status : null;
  try { res.json({ posts: await adminListPosts(status) }); } catch (e) { fail(res, e); }
});

router.post("/api/admin/blog/posts", async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  try { res.status(201).json({ post: await createPost(parsed.data, getUserId(req)!) }); } catch (e) { fail(res, e); }
});

const draftBody = z.object({
  contentType: z.string().max(40),
  slug: z.string().max(160),
  topic: z.string().min(3).max(300),
  marketSlug: z.string().max(40).nullable().optional(),
  occasionSlug: z.string().max(80).nullable().optional(),
  bylineExpertId: z.string().max(255).nullable().optional(),
}).strict();

router.post("/api/admin/blog/drafts", async (req, res) => {
  const parsed = draftBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  try { res.status(201).json({ post: await draftPostFromResearch(parsed.data, getUserId(req)!) }); } catch (e) { fail(res, e); }
});

router.patch("/api/admin/blog/posts/:id", async (req, res) => {
  const parsed = editBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  try { res.json({ post: await editPost(req.params.id, parsed.data, getUserId(req)!) }); } catch (e) { fail(res, e); }
});

router.post("/api/admin/blog/posts/:id/submit", async (req, res) => {
  try { res.json({ post: await submitForReview(req.params.id) }); } catch (e) { fail(res, e); }
});

router.post("/api/admin/blog/posts/:id/publish", async (req, res) => {
  try { res.json({ post: await publishPost(req.params.id, getUserId(req)!) }); } catch (e) { fail(res, e); }
});

router.post("/api/admin/blog/posts/:id/withdraw", async (req, res) => {
  const parsed = withdrawBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  try { res.json({ post: await withdrawPost(req.params.id, getUserId(req)!, parsed.data.reason ?? null) }); } catch (e) { fail(res, e); }
});

// ── Expert ───────────────────────────────────────────────────────────────────────────────────

router.get("/api/expert/blog/review", isAuthenticated, async (req, res) => {
  try { res.json({ posts: await listForReview(getUserId(req)!) }); } catch (e) { fail(res, e); }
});

router.post("/api/expert/blog/posts/:id/sign", isAuthenticated, async (req, res) => {
  const parsed = signBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  try { res.json({ post: await signPost(req.params.id, getUserId(req)!, parsed.data.contentSha256) }); } catch (e) { fail(res, e); }
});

// ── Public ───────────────────────────────────────────────────────────────────────────────────

router.get("/api/blog/posts", async (req, res) => {
  const market = typeof req.query.market === "string" ? req.query.market.slice(0, 40) : null;
  try { res.json({ posts: await listPublished({ marketSlug: market }) }); } catch (e) { fail(res, e); }
});

router.get("/api/blog/posts/:slug", async (req, res) => {
  try {
    const post = await getPublishedBySlug(req.params.slug);
    if (!post) return res.status(404).json({ error: "not_found" });
    res.json({ post });
  } catch (e) { fail(res, e); }
});

// ── Reactions (ruling 6) — the reader is the session user; no count is ever returned ─────────

router.get("/api/blog/posts/:slug/reactions/mine", isAuthenticated, async (req, res) => {
  try { res.json({ reactions: await myReactions(req.params.slug, getUserId(req)!) }); } catch (e) { fail(res, e); }
});

router.post("/api/blog/posts/:slug/reactions", isAuthenticated, async (req, res) => {
  const parsed = reactionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  try { res.json({ reactions: await addReaction(req.params.slug, getUserId(req)!, parsed.data.kind) }); } catch (e) { fail(res, e); }
});

router.delete("/api/blog/posts/:slug/reactions/:kind", isAuthenticated, async (req, res) => {
  const kind = reactionKindParam.safeParse(req.params.kind);
  if (!kind.success) return res.status(400).json({ error: "invalid_kind" });
  try { res.json({ reactions: await removeReaction(req.params.slug, getUserId(req)!, kind.data) }); } catch (e) { fail(res, e); }
});

export default router;
