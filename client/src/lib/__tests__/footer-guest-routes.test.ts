/**
 * footer-guest-routes.test.ts
 *
 * Unit test — no browser required. Sibling of footer-route-coverage.test.ts: that file asks
 * "does every footer href have a route?"; this one asks "can a GUEST open it?".
 *
 * WHY. The footer is the one navigation surface every visitor sees, signed in or not. It
 * carried `/chat` — a signed-in inbox wrapped in `ProtectedRoute` — so a guest who clicked it
 * was bounced to "/" behind a sign-in modal. The footer-links smoke gate stayed green through
 * that, correctly by its own stated scope: it only refuses the 404 page, and a redirect to "/"
 * is not a 404. This test closes that gap: no footer href may resolve to a route that App.tsx
 * renders through `ProtectedRoute` (or behind a `requiredRole`).
 *
 * NEGATIVE SPACE (§18d — green means green within these bounds). This reads App.tsx's
 * `<Route path="…">` blocks as TEXT. It sees a `ProtectedRoute` / `requiredRole` written in the
 * route's own children. It does NOT see a page component that gates itself internally (a
 * `useAuth()` redirect inside the page), a server-side 401, or a `<Redirect>` that lands on a
 * protected route. The runtime half of the same question — the page does not bounce a guest to
 * "/" — lives in playwright/tests/footer-links.spec.ts, which visits every footer href without a
 * session.
 *
 * Run with: npx tsx --test client/src/lib/__tests__/footer-guest-routes.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { footerSectionsConfig, getAllFooterHrefs } from "../nav-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type RouteBlock = { path: string; body: string };

/**
 * Splits App.tsx into `<Route path="…"> … ` blocks: each block's body runs from its opening
 * tag to the next `<Route` (or the end of the file). The FIRST block for a path wins, mirroring
 * wouter's `<Switch>`, which renders the first matching route.
 */
function extractRouteBlocks(): Map<string, RouteBlock> {
  const content = readFileSync(resolve(__dirname, "../../App.tsx"), "utf-8");
  const opener = /<Route\s+path=["']([^"']+)["']/g;
  const starts: Array<{ path: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = opener.exec(content)) !== null) starts.push({ path: m[1], index: m.index });
  const blocks = new Map<string, RouteBlock>();
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : content.length;
    if (!blocks.has(s.path)) blocks.set(s.path, { path: s.path, body: content.slice(s.index, end) });
  });
  return blocks;
}

/** Wouter-style match of a bare path against a route pattern with `:param` segments. */
function matches(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (!pattern.includes(":")) return false;
  const a = pattern.split("/");
  const b = path.split("/");
  return a.length === b.length && a.every((seg, i) => seg.startsWith(":") || seg === b[i]);
}

const GATE_MARKERS = [/\bProtectedRoute\b/, /\brequiredRole\s*=/];

describe("Footer hrefs are open to a guest", () => {
  const blocks = extractRouteBlocks();

  it("finds route blocks in App.tsx (the parser is not silently empty)", () => {
    assert.ok(blocks.size > 50, `expected many <Route path> blocks, found ${blocks.size}`);
    // Self-check of the predicate against a route KNOWN to be protected, so a regex that stops
    // matching cannot turn this whole file green by seeing no gates anywhere.
    const dashboard = blocks.get("/dashboard");
    assert.ok(dashboard, "expected a /dashboard route block");
    assert.ok(
      GATE_MARKERS.some((re) => re.test(dashboard.body)),
      "the /dashboard block should read as protected — the gate predicate is broken",
    );
  });

  it("no footer href resolves to a ProtectedRoute / requiredRole route", () => {
    const offenders: string[] = [];
    for (const href of getAllFooterHrefs()) {
      const path = href.split("?")[0];
      const block = Array.from(blocks.values()).find((b) => matches(b.path, path));
      if (!block) {
        offenders.push(`  "${href}" — no <Route> matches it (footer-route-coverage should also fail)`);
        continue;
      }
      if (GATE_MARKERS.some((re) => re.test(block.body))) {
        offenders.push(`  "${href}" — route "${block.path}" is rendered through ProtectedRoute/requiredRole`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `\nFooter links a guest cannot open (${offenders.length}):\n${offenders.join("\n")}\n\n` +
        "The footer is shown to every visitor. Remove the link, or point it at a public page.",
    );
  });

  it("the retired footer links stay retired", () => {
    const hrefs = getAllFooterHrefs();
    for (const retired of ["/chat", "/executive-assistant", "/faq"]) {
      assert.ok(!hrefs.includes(retired), `${retired} was removed from the footer and must not return (/faq redirects to the Help center link beside it)`);
    }
  });

  it("the Blog link stays hidden (no post store exists to count five published posts)", () => {
    assert.ok(!getAllFooterHrefs().includes("/blog"), "/blog is hidden from the footer until 5 posts are published");
  });

  it("'Start a plan' is the planning-modal action, not a URL", () => {
    const plan = footerSectionsConfig.find((s) => s.i18nKey === "footer.sections.plan");
    assert.ok(plan, "expected the Plan section");
    const first = plan.links[0];
    assert.equal(first.action, "startPlan");
    assert.equal(first.href, undefined);
  });
});
