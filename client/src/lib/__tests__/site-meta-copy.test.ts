/**
 * Row 261: the site title, og/twitter titles, the SEOHead defaults and the /about
 * ROUTE_META description no longer say "AI". Pure source reads. No git, no child
 * process, no comparison with a ref, no origin or hostname.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/site-meta-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOMEPAGE_META_DESCRIPTION } from "../g02-g06-copy";
import { SITE_TITLE } from "../site-meta-copy";

const read = (path: string) => readFileSync(path, "utf8");

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

test("SM1 the site title constant", () => {
  assert.equal(typeof SITE_TITLE, "string");
  assert.ok(SITE_TITLE.length > 0);
  assert.equal(SITE_TITLE.includes("<<"), false);
  assert.equal(SITE_TITLE.includes("PENDING"), false);
  assert.equal(SITE_TITLE.includes("MARKETING"), false);
  assert.doesNotMatch(SITE_TITLE, /\bAI\b/);
  assert.doesNotMatch(SITE_TITLE, /AI-Powered/i);
  assert.equal(count(SITE_TITLE, "Traveloure"), 1);
  assert.equal(SITE_TITLE.trim().endsWith("| Traveloure"), false);
  for (const ch of ["<", ">", '"', "&"]) {
    assert.equal(SITE_TITLE.includes(ch), false, `SITE_TITLE contains ${JSON.stringify(ch)}`);
  }
});

test("SM2 the HTML shell titles equal the constant and the file says no AI", () => {
  const html = read("client/index.html");
  assert.equal(count(html, `<title>${SITE_TITLE}</title>`), 1);
  assert.equal(count(html, `<meta property="og:title" content="${SITE_TITLE}" />`), 1);
  assert.equal(count(html, `<meta name="twitter:title" content="${SITE_TITLE}" />`), 1);
  assert.doesNotMatch(html, /\bAI\b/);
  assert.doesNotMatch(html, /AI-Powered/i);
});

test("SM3 the client defaults import the one title and the one description", () => {
  const src = read("client/src/components/seo-head.tsx");
  assert.match(src, /import\s*\{[^}]*\bSITE_TITLE\b[^}]*\}\s*from\s*"@\/lib\/site-meta-copy"/);
  assert.match(src, /import\s*\{[^}]*\bHOMEPAGE_META_DESCRIPTION\b[^}]*\}\s*from\s*"@\/lib\/g02-g06-copy"/);
  assert.ok(src.includes("const DEFAULT_TITLE = SITE_TITLE;"));
  assert.ok(src.includes("const DEFAULT_DESCRIPTION = HOMEPAGE_META_DESCRIPTION;"));
  const code = stripComments(src);
  assert.doesNotMatch(code, /\bAI\b/);
  assert.doesNotMatch(code, /AI-powered/i);
  assert.equal(count(src, "| ${SITE_NAME}"), 1);
  assert.ok(src.includes("const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;"));
  assert.equal(count(src, "SITE_TITLE"), 2, "the identifier is the import and the default, never a title= prop");
});

function routeMetaSlice(src: string): string {
  const start = src.indexOf("const ROUTE_META");
  assert.ok(start >= 0, "const ROUTE_META not found");
  const lines = src.slice(start).split("\n");
  const end = lines.findIndex((line, i) => i > 0 && line === "};");
  assert.ok(end > 0, "ROUTE_META closing }; at column 0 not found");
  return lines.slice(0, end + 1).join("\n");
}

function aboutPageDescription(src: string): string {
  const blocks = [...src.matchAll(/<SEOHead\b[\s\S]*?\/>/g)].map((m) => m[0]);
  const block = blocks.find((b) => /url="\/about"/.test(b));
  if (!block) {
    assert.fail('parse failed: client/src/pages/about.tsx has no <SEOHead with url="/about"');
  }
  const desc = block.match(/\bdescription="([^"]*)"/);
  if (!desc) {
    assert.fail('parse failed: the <SEOHead url="/about"> has no description="…" literal');
  }
  return desc[1];
}

function aboutRouteDescription(slice: string): string {
  const start = slice.indexOf('"/about"');
  assert.ok(start >= 0, "ROUTE_META has no /about key");
  const rest = slice.slice(start);
  const next = rest.slice(1).search(/\n {2}"\//);
  const block = next < 0 ? rest : rest.slice(0, next + 1);
  const desc = block.match(/description:\s*"([^"]*)"/);
  if (!desc) {
    assert.fail("parse failed: ROUTE_META /about description is not a string literal");
  }
  return desc[1];
}

test("SM4 ROUTE_META has the seven keys and /about uses the page sentence", () => {
  const slice = routeMetaSlice(read("server/routes/seo.routes.ts"));
  assert.doesNotMatch(slice, /\bAI\b/);
  assert.doesNotMatch(slice, /AI-powered/i);
  const keys = [...slice.matchAll(/^\s+"([^"]+)":\s*\{/gm)].map((m) => m[1]);
  assert.deepEqual(keys, ["/discover", "/experts", "/experiences", "/pricing", "/about", "/contact", "/visa-help"]);
  const page = aboutPageDescription(read("client/src/pages/about.tsx"));
  assert.equal(aboutRouteDescription(slice), page);
});

test("SM5 serveWithHead strips the five shell tags before injecting", () => {
  const src = read("server/routes/seo.routes.ts");
  const start = src.indexOf("async function serveWithHead");
  assert.ok(start >= 0, "serveWithHead not found");
  const inject = src.indexOf("injectIntoHead(template, tags)", start);
  assert.ok(inject > start, "injectIntoHead call not found after serveWithHead");
  const before = src.slice(start, inject);
  const strips = [
    '<title>[\\s\\S]*?<\\/title>\\s*',
    'meta name="description"',
    'link rel="canonical"',
    'meta property="og:',
    'meta name="twitter:',
  ];
  for (const fragment of strips) {
    assert.ok(before.includes(fragment), `serveWithHead strip missing ${fragment}`);
  }
});

test("SM6 the homepage description is one spelling", () => {
  const html = read("client/index.html");
  assert.equal(html.split(HOMEPAGE_META_DESCRIPTION).length, 4, "description, og, and twitter — the same count g02-g06-copy.test.ts makes");
  const seoHead = read("client/src/components/seo-head.tsx");
  assert.equal(count(seoHead, "HOMEPAGE_META_DESCRIPTION"), 2);
  assert.equal(seoHead.includes(HOMEPAGE_META_DESCRIPTION), false, "the sentence is imported, never retyped");
});
