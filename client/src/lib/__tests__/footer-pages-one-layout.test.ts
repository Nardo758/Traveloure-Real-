/**
 * Footer pages: one layout, tokens only (decision-maker rulings, Sep 28, 2026 — ledger
 * `2026-09-28-footer-pages-one-layout`).
 *
 * F1 one red: the public --primary is coral #E85D55; #FF385C / #FB3B63 and the "two palettes by
 *    design" comment are gone from the token sheet and every footer page.
 * F2 cream ground: the public --background is the --earn-ground token.
 * F3 widths: the two page-width tokens exist, and no footer page sets its own page width.
 * F4 headings: every footer page renders its H1 through the shared PageTitle (no raw <h1>).
 * F5 chrome: every footer route mounts the shared Layout (or BrowseShell / the page's own Layout),
 *    and no footer page wraps itself in the console DashboardLayout.
 * F6 one address: Admin@traveloure.com is the only @traveloure.com address in client/src, and it
 *    is written once (company-facts.ts).
 * F7 header: a dropdown page lights its parent group (activeNavGroupName).
 *
 * The rendered half (every footer destination shows the shared header and footer, signed out) is
 * playwright/tests/footer-links.spec.ts; the hex lint is scripts/check-page-hex.cjs.
 *
 * Run: npx tsx --test client/src/lib/__tests__/footer-pages-one-layout.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { activeNavGroupName, footerSectionsConfig } from "../nav-config";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// The files behind every footer destination — the same list scripts/check-page-hex.cjs holds.
const { FOOTER_PAGE_FILES } = createRequire(import.meta.url)(path.join(ROOT, "scripts/check-page-hex.cjs")) as { FOOTER_PAGE_FILES: string[] };
const PAGE = (f: string) => `client/src/pages/${f}`;

test("F1 one red: public primary is coral, the retired reds and the by-design comment are gone", () => {
  const css = read("client/src/index.css");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  assert.match(root, /--primary:\s*3\.3 76\.2% 62\.2%;/, "public --primary is #E85D55");
  assert.doesNotMatch(css, /350 100% 6[15]%/, "the pink primary is retired in every theme");
  assert.doesNotMatch(css, /TWO PALETTES BY DESIGN/i);
  for (const f of [...FOOTER_PAGE_FILES.map(PAGE), "client/src/components/company/company-page.tsx", "client/src/components/expert-card.tsx"]) {
    assert.doesNotMatch(read(f), /#FF385C|#FF3859|#FB3B63|#fb3b63|#d92d55|#E23350/i, `${f} carries a retired red`);
  }
});

test("F2 the public ground is the cream token", () => {
  const css = read("client/src/index.css");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  assert.match(root, /--background:\s*60 16\.7% 97\.6%;/, "#FAFAF8 = --earn-ground");
  assert.match(read("client/src/components/company/company-page.tsx"), /background: "var\(--earn-ground\)"/);
});

test("F3 two width tokens, and no footer page sets its own page width", () => {
  const css = read("client/src/index.css");
  assert.match(css, /--page-content:\s*1280px;/);
  assert.match(css, /--page-reading:\s*720px;/);
  const tw = read("tailwind.config.ts");
  assert.match(tw, /content:\s*"var\(--page-content\)"/);
  assert.match(tw, /reading:\s*"var\(--page-reading\)"/);
  for (const f of FOOTER_PAGE_FILES) {
    const src = read(PAGE(f));
    assert.match(src, /@\/components\/company\/company-page/, `${f} uses the shared page layout`);
    assert.doesNotMatch(
      src,
      /container mx-auto|max-w-(3xl|4xl|5xl|6xl|7xl)\b|max-w-\[\d+px\]|max-w-screen-/,
      `${f} sets its own page width`,
    );
  }
});

test("F4 every footer page renders its H1 through PageTitle — no raw or sans H1", () => {
  for (const f of FOOTER_PAGE_FILES) {
    const src = read(PAGE(f));
    assert.doesNotMatch(src, /<h1[\s>]/, `${f} renders its own <h1>`);
  }
  const layout = read("client/src/components/company/company-page.tsx");
  assert.match(layout, /PAGE_H1_CLASS = "text-\[34px\] font-semibold leading-tight sm:text-\[42px\]"/, "page H1 is 42 (34 on phones)");
  assert.match(layout, /PAGE_H2_CLASS = "text-\[26px\]/, "section H2 is 26");
  assert.match(layout, /FRAUNCES = "'Fraunces'/, "headings are the serif");
});

test("F5 every footer route mounts the shared chrome, and none uses the console shell", () => {
  const app = read("client/src/App.tsx");
  const hrefs = footerSectionsConfig.flatMap((s) => s.links).flatMap((l) => ("href" in l && l.href ? [l.href.split("?")[0]] : []));
  assert.ok(hrefs.length >= 15, "footer hrefs were read");
  for (const href of new Set(hrefs)) {
    if (href === "/faq") continue; // a redirect to /help
    const at = app.indexOf(`<Route path="${href}">`);
    assert.ok(at >= 0, `${href} has a route`);
    const body = app.slice(at, app.indexOf("</Route>", at));
    const own = /<EarnPage \/>/.test(body); // earn.tsx mounts Layout itself
    assert.ok(/<Layout>|<BrowseShell>/.test(body) || own, `${href} is not inside the shared Layout`);
  }
  assert.match(read(PAGE("earn.tsx")), /<Layout>/);
  for (const f of FOOTER_PAGE_FILES) {
    assert.doesNotMatch(read(PAGE(f)), /import\s*\{[^}]*\bDashboardLayout\b[^}]*\}\s*from/, `${f} imports the console shell`);
  }
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__") out.push(...walk(p)); }
    else if (/\.(tsx?|json|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("F6 Admin@traveloure.com is the only @traveloure.com address in client/src, written once", () => {
  const hits: string[] = [];
  for (const f of walk(path.join(ROOT, "client/src"))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/[A-Za-z0-9._%+-]+@traveloure\.com/g)) hits.push(`${path.relative(ROOT, f)} ${m[0]}`);
  }
  assert.deepEqual(hits, ["client/src/lib/company-facts.ts Admin@traveloure.com"]);
});

test("F7 a dropdown page lights its parent header group", () => {
  assert.equal(activeNavGroupName("/destinations"), "Marketplace");
  assert.equal(activeNavGroupName("/experts"), "Experts & Services");
  assert.equal(activeNavGroupName("/providers"), "Experts & Services");
  assert.equal(activeNavGroupName("/visa-help"), "Planning Tools");
  assert.equal(activeNavGroupName("/experiences"), "Experiences", "a parent path of the group's links");
  assert.equal(activeNavGroupName("/destinations?city=kyoto"), "Marketplace", "query ignored");
  assert.equal(activeNavGroupName("/about"), null, "a page no group names lights nothing");
  assert.equal(activeNavGroupName("/"), null);
  const layout = read("client/src/components/layout.tsx");
  assert.match(layout, /isActive=\{item\.href === location \|\| activeGroup === item\.name\}/);
});
