/**
 * EXPERT-SIGNED BLOG — routes (ledger `2026-09-27-blog-lifecycle`, Locked Decision 57).
 *
 *   Admin (under §2's blanket `/api/admin` guard, registered before this router is mounted):
 *     GET  /api/admin/blog/posts[?status=]          list
 *     POST /api/admin/blog/posts                    create a draft (.strict pick — §19)
 *     PATCH /api/admin/blog/posts/:id               edit — clears any signature (ruling 3)
 *     POST /api/admin/blog/posts/:id/submit         draft → in_review (byline gate)
 *     POST /api/admin/blog/posts/:id/publish        only when signed for THIS content
 *     POST /api/admin/blog/posts/:id/withdraw       published → withdrawn (never deleted)
 *   Expert (the byline expert, from the SESSION — §14):
 *     GET  /api/expert/blog/review                  my posts awaiting my signature
 *     POST /api/expert/blog/posts/:id/sign          { contentSha256 } — the version I reviewed
 *   Public (published only; allowlist projection; no user ids — LD 40):
 *     GET  /api/blog/posts[?market=]                GET /api/blog/posts/:slug
 */
import { Router, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId } from "../utils/auth";
import { BLOG_POST_STATUSES } from "@shared/blog";
import {
  BlogError,
  adminListPosts,
  createPost,
  editPost,
  getPublishedBySlug,
  listForReview,
  listPublished,
  publishPost,
  signPost,
  submitForReview,
  withdrawPost,
} from "../services/blog-posts.service";

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

export default router;
