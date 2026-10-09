/**
 * seo.routes.ts — crawler-facing surfaces (2026-08-17 SEO audit fixes).
 *
 *   GET /sitemap.xml — server-generated from live data (approved+active services,
 *                      approved+active ready-made listings, claimed storefront handles)
 *                      plus the static public routes. Never a hardcoded ID list.
 *   GET /discover, /experts, /experiences, /about, /contact, /pricing, /visa-help
 *                    — per-route <title>/<meta description>/<link rel=canonical> injection
 *                      into the SPA shell, same interception pattern as
 *                      storefront.routes.ts /s/:handle. Without this, every route served
 *                      the homepage's head verbatim — including a canonical pointing AT
 *                      the homepage, which told crawlers the whole site is one page.
 *
 * robots.txt is a static file in client/public/ (served by Vite in dev, dist/public in prod).
 * Canonical origin is https://traveloure.com (no www) to match the existing static head.
 */
import { Router } from "express";
import fs from "fs";
import path from "path";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { users, providerServices, readyMadeTrips } from "@shared/schema";
import { transformDevHtml } from "../vite-dev-html";
import { injectIntoHead } from "../utils/html-head";
import { PUBLISHED_HELP_ARTICLE_SLUGS, helpArticlePath } from "@shared/help-article-slugs";
import { EXPERIENCES_PAGE_DESCRIPTION } from "@shared/operating-markets";
import { blogIndexRobots, blogPostRobots, publishedBlogSitemapEntries } from "../services/blog-seo.service";

const router = Router();

const CANONICAL_ORIGIN = "https://traveloure.com";

// ─── Sitemap ────────────────────────────────────────────────────────────────
// Cached for 15 minutes — crawlers don't need row-level freshness and the three
// queries shouldn't run on every hit.
let sitemapCache: { xml: string; builtAt: number } | null = null;
const SITEMAP_TTL_MS = 15 * 60 * 1000;

const STATIC_ROUTES = [
  "/",
  "/discover",
  "/experts",
  "/experiences",
  "/pricing",
  "/about",
  "/contact",
  "/visa-help",
  "/press",
  "/careers",
  // Lane B: the Help center and each PUBLISHED article — a held article (an unshipped feature)
  // is never in the sitemap (shared/help-article-slugs.ts).
  "/help",
  ...PUBLISHED_HELP_ARTICLE_SLUGS.map(helpArticlePath),
];

const escXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function buildSitemap(): Promise<string> {
  const [services, readyMade, storefronts, blog] = await Promise.all([
    db
      .select({ id: providerServices.id, updatedAt: providerServices.updatedAt })
      .from(providerServices)
      .where(and(eq(providerServices.approvalStatus, "approved"), eq(providerServices.status, "active"))),
    db
      .select({ id: readyMadeTrips.id, updatedAt: readyMadeTrips.updatedAt })
      .from(readyMadeTrips)
      .where(and(eq(readyMadeTrips.status, "approved"), eq(readyMadeTrips.active, true))),
    // Mirror loadStorefront's public-visibility predicate: a /s/:handle page only
    // exists when the owner has at least one APPROVED offering in one of the three
    // lanes — a bare handle 404s, and listing it would feed crawlers dead URLs.
    // When the storefront verification gate is enabled, skip storefronts entirely
    // (conservative: we can't cheaply evaluate per-owner verification here).
    (async () => {
      const flag = await db.execute(sql`
        SELECT setting_value FROM platform_settings
        WHERE setting_key = 'storefront_require_verified'
      `).catch(() => null);
      if ((flag?.rows?.[0] as any)?.setting_value === "true") return [] as { handle: string }[];
      const result = await db.execute(sql`
        SELECT u.handle FROM users u
        WHERE u.handle IS NOT NULL AND u.is_deleted = false AND u.is_suspended = false
          AND (
            EXISTS (SELECT 1 FROM provider_services ps
                    WHERE ps.user_id = u.id AND ps.approval_status = 'approved' AND ps.status = 'active')
            OR EXISTS (SELECT 1 FROM ready_made_trips rmt
                       WHERE rmt.author_id = u.id AND rmt.status = 'approved' AND rmt.active = true)
          )
      `);
      return result.rows as { handle: string }[];
    })(),
    // Lane C (ledger `2026-09-27-blog-reactions-ask`): PUBLISHED posts only, and `/blog` itself
    // only once at least one is published — an empty index is never offered to a crawler.
    publishedBlogSitemapEntries(),
  ]);

  const urls: { loc: string; lastmod?: string }[] = [
    ...STATIC_ROUTES.map((r) => ({ loc: `${CANONICAL_ORIGIN}${r}` })),
    ...services.map((s) => ({
      loc: `${CANONICAL_ORIGIN}/services/${s.id}`,
      lastmod: s.updatedAt?.toISOString().slice(0, 10),
    })),
    ...readyMade.map((r) => ({
      loc: `${CANONICAL_ORIGIN}/ready-made/${r.id}`,
      lastmod: r.updatedAt?.toISOString().slice(0, 10),
    })),
    ...storefronts
      .filter((u) => !!u.handle)
      .map((u) => ({ loc: `${CANONICAL_ORIGIN}/s/${u.handle}` })),
    ...blog.map((b) => ({ loc: `${CANONICAL_ORIGIN}${b.path}`, lastmod: b.lastmod })),
  ];

  const body = urls
    .map(
      (u) =>
        `  <url><loc>${escXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

router.get("/sitemap.xml", async (_req, res) => {
  try {
    if (!sitemapCache || Date.now() - sitemapCache.builtAt > SITEMAP_TTL_MS) {
      sitemapCache = { xml: await buildSitemap(), builtAt: Date.now() };
    }
    res
      .status(200)
      .set({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" }) // fee-literal-ok: HTTP Cache-Control max-age in SECONDS (15 min), not a fee in cents — phase2-fee-gate cents false positive (§18d)
      .send(sitemapCache.xml);
  } catch (err) {
    console.error("[seo] sitemap generation failed:", err);
    // Honest failure — a 500 tells crawlers to retry; an empty 200 sitemap would
    // deindex everything.
    res.status(500).type("text/plain").send("sitemap generation failed");
  }
});

// ─── Per-route head injection ───────────────────────────────────────────────
// Same template-interception pattern as storefront.routes.ts. Only PUBLIC routes:
// authenticated surfaces are Disallow'ed in robots.txt and keep the SPA shell.
const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/discover": {
    title: "Discover Experiences & Local Services | Traveloure",
    description:
      "Browse curated local experiences, tours, and travel services from verified experts and providers — book securely on Traveloure.",
  },
  "/experts": {
    title: "Local Travel Experts | Traveloure",
    description:
      "Meet verified local experts who plan, optimize, and book your trip — from Kyoto temple walks to Paris food tours.",
  },
  "/experiences": {
    title: "Plan around a place, a date or an event | Traveloure",
    // E3 ruling 4: the page's own description, one spelling (`shared/operating-markets.ts`).
    description: EXPERIENCES_PAGE_DESCRIPTION,
  },
  "/pricing": {
    title: "Pricing | Traveloure",
    description:
      "Transparent pricing for trip planning, itinerary optimization, and expert booking services on Traveloure.",
  },
  "/about": {
    title: "About Us | Traveloure",
    description:
      "Traveloure pairs AI-powered trip planning with verified local experts to make every journey personal.",
  },
  "/contact": {
    title: "Contact | Traveloure",
    description: "Get in touch with the Traveloure team — support, partnerships, and press.",
  },
  "/visa-help": {
    title: "Visa Help & Travel Documents | Traveloure",
    description:
      "Understand visa requirements for your destination and get help with travel documents.",
  },
};

function resolveTemplatePath(): string | null {
  const dev = path.resolve(process.cwd(), "client", "index.html");
  const prod = path.resolve(process.cwd(), "dist", "public", "index.html");
  const chosen = process.env.NODE_ENV === "production" && fs.existsSync(prod) ? prod : dev;
  return fs.existsSync(chosen) ? chosen : null;
}

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

async function serveWithHead(
  req: any,
  res: any,
  next: any,
  meta: { title: string; description: string },
  routePath: string,
) {
  try {
    const templatePath = resolveTemplatePath();
    if (!templatePath) return next();
    const canonical = `${CANONICAL_ORIGIN}${routePath}`;
    const tags = [
      `<title>${escHtml(meta.title)}</title>`,
      `<meta name="description" content="${escHtml(meta.description)}" />`,
      `<link rel="canonical" href="${escHtml(canonical)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="${escHtml(canonical)}" />`,
      `<meta property="og:title" content="${escHtml(meta.title)}" />`,
      `<meta property="og:description" content="${escHtml(meta.description)}" />`,
      `<meta property="og:image" content="${CANONICAL_ORIGIN}/og-cover.png" />`,
      `<meta property="og:site_name" content="Traveloure" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escHtml(meta.title)}" />`,
      `<meta name="twitter:description" content="${escHtml(meta.description)}" />`,
      `<meta name="twitter:image" content="${CANONICAL_ORIGIN}/og-cover.png" />`,
    ].join("\n    ");

    let template = fs.readFileSync(templatePath, "utf-8");
    // Strip the static homepage head we're replacing: title, description, canonical,
    // og:*, twitter:* — otherwise crawlers see duplicates (and two canonicals is
    // actively harmful: Google ignores both).
    template = template
      .replace(/<title>[\s\S]*?<\/title>\s*/, "")
      .replace(/<meta name="description"[^>]*>\s*/, "")
      .replace(/<link rel="canonical"[^>]*>\s*/, "")
      .replace(/<meta property="og:[^"]+"[^>]*>\s*/g, "")
      .replace(/<meta name="twitter:[^"]+"[^>]*>\s*/g, "");
    template = injectIntoHead(template, tags);
    template = await transformDevHtml(req.originalUrl, template);
    return res.status(200).set({ "Content-Type": "text/html" }).end(template);
  } catch (err) {
    console.error(`[seo] head injection failed for ${routePath}:`, err);
    return next(); // fall through to the plain SPA shell on any error
  }
}

// ─── /blog: noindex only while there is nothing published ───────────────────
// Lane C (ledger `2026-09-27-blog-reactions-ask`) replaces the old BLANKET noindex, which its own
// comment said must become conditional the day a post store existed. The index is `noindex` while
// no post is published; a post page is `noindex` unless that slug is published. A read that fails
// answers `noindex` — a wrong "index" publishes an empty or unreviewed page, a wrong "noindex" only
// delays one (§13). The header serves crawlers that never run the SPA; the page sets the same meta.
router.get("/blog", async (_req, res, next) => {
  const robots = await blogIndexRobots();
  if (robots) res.setHeader("X-Robots-Tag", robots);
  next();
});
router.get("/blog/:slug", async (req, res, next) => {
  const robots = await blogPostRobots(req.params.slug);
  if (robots) res.setHeader("X-Robots-Tag", robots);
  next();
});

for (const [routePath, meta] of Object.entries(ROUTE_META)) {
  router.get(routePath, (req, res, next) => serveWithHead(req, res, next, meta, routePath));
}

export default router;
