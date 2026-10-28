/**
 * Row 258 — the canonical origin is https://www.traveloure.com.
 * Pure functions and readFileSync only. No git, no database.
 * Run: npx tsx --test shared/__tests__/canonical-www.test.ts
 *
 *   AW12 one SITE_ORIGIN constant.
 *   AW13 sitemap URLs.
 *   AW14 sitemap XML.
 *   AW15 per-route head tags.
 *   AW16 robots.txt Sitemap line.
 *   AW17 static shell.
 *   AW18 SEOHead.
 *   AW19 producers; /t/:slug keeps its apex literals.
 *   AW20 no apex host in canonical output except that /t/:slug block.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { helpArticlePath } from "../help-article-slugs";
import { SITE_ORIGIN, siteUrl } from "../site-origin";
import { CANONICAL_WWW_ORIGIN } from "../../server/middleware/apex-to-www-redirect";
import { buildSitemapXml, routeHeadTags, sitemapUrlsFor } from "../../server/utils/seo-output";

const APEX_HOST_RE = /https?:\/\/traveloure\.com(?![.\w-])/;
const WWW = "https://www.traveloure.com";

function read(rel: string): string {
  return readFileSync(rel, "utf8");
}

/** From the route literal to the end of that router.get handler. */
function routeHandler(src: string, routeLiteral: string): { block: string; rest: string } {
  const at = src.indexOf(routeLiteral);
  assert.ok(at >= 0, `missing ${routeLiteral}`);
  const start = src.lastIndexOf("router.get(", at);
  assert.ok(start >= 0, `no router.get before ${routeLiteral}`);
  let i = src.indexOf("{", start);
  assert.ok(i >= 0);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const end = src.indexOf(");", i);
        assert.ok(end > i);
        return {
          block: src.slice(start, end + 2),
          rest: src.slice(0, start) + src.slice(end + 2),
        };
      }
    }
  }
  throw new Error(`unclosed handler ${routeLiteral}`);
}

const helpPath = helpArticlePath("how-planning-works");
const sampleUrls = sitemapUrlsFor({
  staticRoutes: ["/", "/pricing", helpPath],
  services: [{ id: "svc-1", updatedAt: new Date("2026-04-05T15:00:00.000Z") }],
  readyMade: [{ id: "rm-1", updatedAt: null }],
  storefronts: [{ handle: "kyoto-food" }, { handle: "" }, { handle: null }],
  blog: [{ path: "/blog/a-post", lastmod: "2026-06-07" }],
});

const sampleXml = buildSitemapXml([
  ...sampleUrls,
  { loc: `${WWW}/q?a=1&b="c"<d>` },
]);

const sampleTags = routeHeadTags({ title: "T", description: "D" }, "/pricing");

test("AW12: SITE_ORIGIN is the one constant", () => {
  assert.equal(SITE_ORIGIN, WWW);
  assert.equal(siteUrl("/pricing"), `${WWW}/pricing`);
  assert.equal(CANONICAL_WWW_ORIGIN, SITE_ORIGIN);
  const output = read("server/utils/seo-output.ts");
  assert.match(output, /from "@shared\/site-origin"/);
  assert.doesNotMatch(output, /drizzle-orm|\.\.\/db/);
});

test("AW13: every sitemap loc is on www", () => {
  assert.ok(sampleUrls.some((u) => u.loc === `${WWW}/`));
  assert.ok(sampleUrls.some((u) => u.loc === `${WWW}/pricing`));
  assert.ok(sampleUrls.some((u) => u.loc === `${WWW}${helpPath}`));
  assert.ok(sampleUrls.some((u) => u.loc === `${WWW}/services/svc-1` && u.lastmod === "2026-04-05"));
  assert.ok(sampleUrls.some((u) => u.loc === `${WWW}/ready-made/rm-1` && u.lastmod == null));
  assert.ok(sampleUrls.some((u) => u.loc === `${WWW}/s/kyoto-food`));
  assert.equal(sampleUrls.some((u) => u.loc.includes("/s/") && u.loc.endsWith("/s/")), false);
  assert.ok(sampleUrls.some((u) => u.loc === `${WWW}/blog/a-post` && u.lastmod === "2026-06-07"));
  for (const url of sampleUrls) {
    assert.ok(url.loc.startsWith(`${WWW}/`), url.loc);
    assert.equal(url.loc.startsWith("https://traveloure.com"), false, url.loc);
  }
});

test("AW14: sitemap XML header, locs, and escapes", () => {
  assert.ok(sampleXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'));
  const locs = [...sampleXml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, sampleUrls.length + 1);
  assert.ok(locs.includes(`${WWW}/`));
  assert.ok(sampleXml.includes(`<loc>${WWW}/q?a=1&amp;b=&quot;c&quot;&lt;d&gt;</loc>`));
  assert.equal(/https?:\/\/traveloure\.com/.test(sampleXml), false);
});

test("AW15: head tags name www, once", () => {
  assert.ok(sampleTags.includes('<link rel="canonical" href="https://www.traveloure.com/pricing" />'));
  assert.ok(sampleTags.includes('<meta property="og:url" content="https://www.traveloure.com/pricing" />'));
  assert.ok(sampleTags.includes('<meta property="og:image" content="https://www.traveloure.com/og-cover.png" />'));
  assert.ok(sampleTags.includes('<meta name="twitter:image" content="https://www.traveloure.com/og-cover.png" />'));
  assert.equal(sampleTags.split('<link rel="canonical"').length - 1, 1);
  assert.equal(sampleTags.includes("https://traveloure.com"), false);
});

test("AW16: robots.txt Sitemap line is www, and Disallow includes /invite/", () => {
  const robots = read("client/public/robots.txt");
  const sitemapLines = robots.split("\n").filter((line) => line.startsWith("Sitemap:"));
  assert.deepEqual(sitemapLines, ["Sitemap: https://www.traveloure.com/sitemap.xml"]);
  assert.equal(/https?:\/\/traveloure\.com/.test(robots), false);
  const disallow = robots.split("\n").filter((line) => line.startsWith("Disallow:"));
  assert.deepEqual(disallow, [
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /checkout",
    "Disallow: /bookings",
    "Disallow: /dashboard",
    "Disallow: /messages",
    "Disallow: /settings",
    "Disallow: /profile",
    "Disallow: /onboarding",
    "Disallow: /expert-workspace",
    "Disallow: /provider",
    "Disallow: /reset-password",
    "Disallow: /verify-email",
    "Disallow: /itinerary-view/",
    "Disallow: /invite/",
  ]);
});

test("AW17: the static shell canonical, og:url, og:image and twitter:image are www", () => {
  const html = read("client/index.html");
  const canonical = html.match(/rel="canonical" href="([^"]+)"/);
  const ogUrl = html.match(/property="og:url" content="([^"]+)"/);
  const ogImage = html.match(/property="og:image" content="([^"]+)"/);
  const twitterImage = html.match(/name="twitter:image" content="([^"]+)"/);
  for (const found of [canonical, ogUrl, ogImage, twitterImage]) {
    assert.ok(found, "missing tag");
    assert.ok(found[1].startsWith(`${WWW}/`), found[1]);
  }
  assert.equal(/https?:\/\/traveloure\.com/.test(html), false);
});

test("AW18: SEOHead builds fullUrl and imageUrl from SITE_ORIGIN", () => {
  const src = read("client/src/components/seo-head.tsx");
  assert.match(src, /import \{ SITE_ORIGIN \} from "@shared\/site-origin"/);
  assert.match(src, /const fullUrl = url \? `\$\{SITE_ORIGIN\}\$\{url\}` : SITE_ORIGIN;/);
  assert.match(src, /const imageUrl = image\.startsWith\("http"\) \? image : `\$\{SITE_ORIGIN\}\$\{image\}`;/);
  assert.equal(src.includes("https://traveloure.com"), false);
});

test("AW19: seo.routes.ts calls the helpers; storefront apex literals stay inside /t/:slug", () => {
  const seo = read("server/routes/seo.routes.ts");
  assert.equal(seo.includes("https://traveloure.com"), false);
  assert.equal(seo.includes("CANONICAL_ORIGIN"), false);
  assert.match(seo, /from "\.\.\/utils\/seo-output"/);
  assert.match(seo, /sitemapUrlsFor\(/);
  assert.match(seo, /buildSitemapXml\(/);
  assert.match(seo, /routeHeadTags\(/);

  const storefront = read("server/routes/storefront.routes.ts");
  const preview = routeHandler(storefront, '"/t/:slug"');
  assert.match(preview.block, /https:\/\/traveloure\.com/);
  assert.equal(preview.rest.includes("https://traveloure.com"), false);
  for (const route of ['"/s/:handle"', '"/services/:id"', '"/ready-made/:id"']) {
    const handler = routeHandler(storefront, route);
    assert.match(handler.block, /SITE_ORIGIN/);
    assert.equal(handler.block.includes("https://traveloure.com"), false);
  }
});

test("AW20: canonical output has no apex host except the /t/:slug block", () => {
  const storefront = read("server/routes/storefront.routes.ts");
  const preview = routeHandler(storefront, '"/t/:slug"');
  assert.match(preview.block, APEX_HOST_RE);
  const produced = [
    ...sampleUrls.map((u) => u.loc),
    sampleXml,
    sampleTags,
    read("client/public/robots.txt"),
    read("client/index.html"),
    read("client/src/components/seo-head.tsx"),
    read("server/routes/seo.routes.ts"),
    preview.rest,
  ].join("\n");
  assert.equal(APEX_HOST_RE.test(produced), false);
});
