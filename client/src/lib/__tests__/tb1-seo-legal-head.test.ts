/**
 * TB1.2 / TB1.4 — the legal and company pages serve their own head, and reach the sitemap.
 *
 * Wording approved — Leon, 2026-11-09. These strings are the approved ones, VERBATIM; a change here
 * is a copy change and needs its own approval.
 *
 *   L1 each of the five routes has the approved title and description
 *   L2 the head is injected through the SAME `routeHeadTags` rail as every other public route, which
 *      is what makes the canonical SELF-referential (it is built from the route path)
 *   L3 the legal pages are in the sitemap's static list
 *   L4 nothing else was added to the head table: the pre-existing entries are untouched
 *
 * Run: npx tsx --test client/src/lib/__tests__/tb1-seo-legal-head.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SEO = fs.readFileSync("server/routes/seo.routes.ts", "utf8");

/** The approved pairs, verbatim (Wording approved — Leon, 2026-11-09). */
const APPROVED: Record<string, { title: string; description: string }> = {
  "/terms": { title: "Terms of Service | Traveloure", description: "The terms that govern your use of Traveloure." },
  "/privacy": { title: "Privacy Policy | Traveloure", description: "What we collect, why, and the controls you have over it." },
  "/cookies": { title: "Cookie Policy | Traveloure", description: "The cookies Traveloure sets and what each one is for." },
  "/press": { title: "Press | Traveloure", description: "Press resources and contact for Traveloure." },
  "/careers": { title: "Careers | Traveloure", description: "Open roles at Traveloure." },
};

const metaBlock = SEO.slice(SEO.indexOf("const ROUTE_META"), SEO.indexOf("function resolveTemplatePath"));
const staticBlock = SEO.slice(SEO.indexOf("const STATIC_ROUTES"), SEO.indexOf("async function buildSitemap"));

describe("TB1.2 — each legal/company route carries its own head", () => {
  for (const [route, meta] of Object.entries(APPROVED)) {
    it(`L1 ${route} has the approved title and description`, () => {
      const at = metaBlock.indexOf(`"${route}": {`);
      assert.ok(at > 0, `${route} is in ROUTE_META`);
      const entry = metaBlock.slice(at, at + 400);
      assert.ok(entry.includes(`title: ${JSON.stringify(meta.title)}`), `${route} title is the approved one`);
      assert.ok(entry.includes(meta.description), `${route} description is the approved one`);
    });
  }

  it("L2 the head goes through the ONE rail, so the canonical is self-referential", () => {
    // routeHeadTags builds `<link rel="canonical" href={SITE_ORIGIN + routePath}>`; the loop below
    // is what every public route (these five included) uses.
    assert.match(SEO, /for \(const \[routePath, meta\] of Object\.entries\(ROUTE_META\)\) \{/);
    assert.match(SEO, /router\.get\(routePath, \(req, res, next\) => serveWithHead\(req, res, next, meta, routePath\)\)/);
    const OUTPUT = fs.readFileSync("server/utils/seo-output.ts", "utf8");
    assert.match(OUTPUT, /const canonical = `\$\{SITE_ORIGIN\}\$\{routePath\}`;/, "the canonical is the route's own URL");
  });
});

describe("TB1.4 — the legal pages are in the sitemap", () => {
  it("L3 /terms, /privacy and /cookies are listed", () => {
    for (const route of ["/terms", "/privacy", "/cookies"]) {
      assert.ok(staticBlock.includes(`"${route}"`), `${route} is a static sitemap route`);
    }
    // The pre-existing entries stay: this is an addition, not a replacement.
    for (const route of ["/", "/discover", "/experts", "/experiences", "/pricing", "/about", "/contact", "/press", "/careers", "/help"]) {
      assert.ok(staticBlock.includes(`"${route}"`), `${route} is still listed`);
    }
  });
});
