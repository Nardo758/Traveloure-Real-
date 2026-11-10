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
 * Canonical origin is https://www.traveloure.com (www), matching the 301 from the apex.
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
import { SITE_ORIGIN, buildSitemapXml, routeHeadTags, sitemapUrlsFor } from "../utils/seo-output";
import { placesMarketFor, placesPath, placesRedirectTarget } from "@shared/places-path";
import { getLaunchMarketSlug } from "../services/platform-flags";
import { isClientRoutePath } from "@shared/ticker";

const router = Router();

// Row 258: one canonical constant, shared with the pure helpers.
void SITE_ORIGIN;

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
  // C-4: the reviewed-places pages are `/places/{city}` (sitemap below); `/places` itself is a redirect.
  "/pricing",
  "/about",
  "/contact",
  "/visa-help",
  "/press",
  "/careers",
  // TB1.4: the legal pages belong in the sitemap; they are public, canonical and stable.
  "/terms",
  "/privacy",
  "/cookies",
  // Lane B: the Help center and each PUBLISHED article — a held article (an unshipped feature)
  // is never in the sitemap (shared/help-article-slugs.ts).
  "/help",
  ...PUBLISHED_HELP_ARTICLE_SLUGS.map(helpArticlePath),
];

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
  // C-4: one `/places/{city}` per operating market with at least one reviewed place — never an empty page.
  const placesRoutes = await import("../services/gem-discovery.service")
    .then(({ gemDiscoveryService }) => gemDiscoveryService.getDestinationsWithGems())
    .then((rows) => Array.from(new Set(rows.map((r) => placesMarketFor(r.destination.split(",")[0])?.marketKey).filter((k): k is string => !!k))).map(placesPath))
    .catch(() => [] as string[]);

  return buildSitemapXml(
    sitemapUrlsFor({
      staticRoutes: [...STATIC_ROUTES, ...placesRoutes],
      services,
      readyMade,
      storefronts,
      blog,
    }),
  );
}

// C-4 / A-16 (ledger `2026-11-05-lane4-places`): `/places/{city}` is the canonical page. `/places`, `/places?city=` and
// `/hidden-gems` (CMS-1's old address) are permanent redirects to it; no city ⇒ the launch market's page.
async function redirectToPlaces(req: any, res: any) {
  const city = typeof req.query.city === "string" ? req.query.city : null;
  const launch = await getLaunchMarketSlug().catch(() => null);
  res.redirect(301, placesRedirectTarget(city, launch));
}
router.get("/hidden-gems", redirectToPlaces);
router.get("/places", redirectToPlaces);

// A-16: a city that is not an operating market is not found — the SPA shell with a 404 status (its NotFound page renders),
// never a 200 for a page that does not exist. A known city falls through to the SPA.
router.get("/places/:city", async (req, res, next) => {
  if (placesMarketFor(req.params.city)) return next();
  try {
    const templatePath = resolveTemplatePath();
    if (!templatePath) return res.status(404).type("text/plain").send("Not found");
    const template = await transformDevHtml(req.originalUrl, fs.readFileSync(templatePath, "utf-8"));
    return res.status(404).set({ "Content-Type": "text/html" }).end(template);
  } catch (err) {
    console.error("[seo] /places not-found shell failed:", err);
    return res.status(404).type("text/plain").send("Not found");
  }
});

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
      "Browse local experiences, tours and travel services from local experts and providers on Traveloure.",
  },
  "/experts": {
    title: "Local Travel Experts | Traveloure",
    description:
      "Meet the local experts who help plan your trip, starting with Kyoto.",
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
      "Traveloure builds your plan around a place, then hands the parts that matter to someone who lives there.",
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
  // TB1.2 (Wording approved — Leon, 2026-11-09): the legal and company pages were inheriting the
  // homepage's <title> and canonical. Each now serves its own title, description and self-canonical
  // through the same `routeHeadTags` rail every other public route uses.
  "/terms": {
    title: "Terms of Service | Traveloure",
    description: "The terms that govern your use of Traveloure.",
  },
  "/privacy": {
    title: "Privacy Policy | Traveloure",
    description: "What we collect, why, and the controls you have over it.",
  },
  "/cookies": {
    title: "Cookie Policy | Traveloure",
    description: "The cookies Traveloure sets and what each one is for.",
  },
  "/press": {
    title: "Press | Traveloure",
    description: "Press resources and contact for Traveloure.",
  },
  "/careers": {
    title: "Careers | Traveloure",
    description: "Open roles at Traveloure.",
  },
};

function resolveTemplatePath(): string | null {
  const dev = path.resolve(process.cwd(), "client", "index.html");
  const prod = path.resolve(process.cwd(), "dist", "public", "index.html");
  const chosen = process.env.NODE_ENV === "production" && fs.existsSync(prod) ? prod : dev;
  return fs.existsSync(chosen) ? chosen : null;
}

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
    const tags = routeHeadTags(meta, routePath);

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

// ─── TB1.3: an unknown URL answers 404, and still renders the SPA's not-found page ───────────────
//
// THE ROUTE LIST IS NOT HAND-WRITTEN. `CLIENT_ROUTES` is generated from `App.tsx`'s own route table
// by `scripts/generate-client-routes.cjs` (CI fails when the committed file is stale), and
// `isClientRoutePath` already matches `:param` segments — so `/plans/abc123` keeps its 200 while
// `/nosuchpage` becomes a real 404. A hand-guessed prefix list would drift the first time a route
// moved, and a wrong 404 on a legitimate deep link is worse than the soft 404 this replaces.
//
// WHAT IS EXCLUDED, deliberately: anything that is not an HTML GET. `/api/*` (its own routers
// answer JSON, including their own 404s), assets, uploads, the sitemap and robots keep their very
// different responses — a crawler asking for a missing image must never receive the app shell.
//
// AND THE DEV SERVER'S OWN MODULES, because the app under test is not always a production build:
// the e2e gates run `npm run dev`, so the browser asks for `/@vite/client`, `/@react-refresh`,
// `/src/main.tsx` and `/node_modules/.vite/…`. None of those is an App.tsx route, so the first cut
// answered them with this 404 HTML — the app never booted, and every spec failed on a blank page
// ("element(s) not found") rather than on the route it thought it was testing. A path whose last
// segment has a file extension is likewise never a page.
const NOT_A_PAGE_PATH = /^\/(api|assets|images|attachments|uploads|static|@[^/]+|src|node_modules|\.vite|og-cover\.png|sitemap\.xml|robots\.txt)(\/|$)/;
const LOOKS_LIKE_A_FILE = /\.[a-z0-9]{1,16}$/i;

router.use(async (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (NOT_A_PAGE_PATH.test(req.path)) return next();
  if (LOOKS_LIKE_A_FILE.test(req.path)) return next();
  if (!req.accepts("html")) return next();
  if (isClientRoutePath(req.path)) return next();
  try {
    const templatePath = resolveTemplatePath();
    if (!templatePath) return next();
    const template = await transformDevHtml(req.originalUrl, fs.readFileSync(templatePath, "utf-8"));
    // The SPA boots and its own NotFound page renders — the STATUS is what changes, so a crawler
    // stops indexing a page that does not exist (the soft-404 this replaces answered 200).
    return res.status(404).set({ "Content-Type": "text/html" }).end(template);
  } catch (err) {
    console.error("[seo] not-found shell failed:", err);
    return next();
  }
});

export default router;
