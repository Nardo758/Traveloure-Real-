/**
 * nav-route-coverage.test.ts (lane nav-storefront D4)
 *
 * Unit test — no browser required. Sibling of footer-route-coverage.test.ts.
 *
 * Guarantees that EVERY href getAllHrefs() reports — the union the two CI link
 * gates (navbar-links-gate / footer-links-gate) actually smoke-test — has a
 * corresponding <Route path="…"> declaration in App.tsx. The footer test covers
 * footerSectionsConfig only; this one closes the gap for navGroupsConfig +
 * authNavConfig, so a nav link to a nonexistent route fails `tsx --test`
 * locally instead of only in the Playwright gates (route-first, nav-second).
 *
 * Run with: npx tsx --test client/src/lib/__tests__/nav-route-coverage.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getAllHrefs } from "../nav-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Same extraction as footer-route-coverage.test.ts — every <Route path="…"> in App.tsx. */
function extractAppRoutePaths(): Set<string> {
  const appTsxPath = resolve(__dirname, "../../App.tsx");
  const content = readFileSync(appTsxPath, "utf-8");
  const paths = new Set<string>();
  const routePattern = /<Route\s+path=["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = routePattern.exec(content)) !== null) {
    paths.add(match[1]);
  }
  return paths;
}

/** Strips a query string: "/discover?tab=packages" → "/discover". */
function bareHref(href: string): string {
  return href.split("?")[0];
}

/** Mirrors footer-route-coverage's route matching (exact, or same-length :param match). */
function isMatchedByRoute(path: string, routePaths: Set<string>): boolean {
  if (routePaths.has(path)) return true;
  for (const routePath of routePaths) {
    if (!routePath.includes(":")) continue;
    const routeSegments = routePath.split("/");
    const pathSegments = path.split("/");
    if (routeSegments.length !== pathSegments.length) continue;
    const allStaticSegmentsMatch = routeSegments.every(
      (seg, i) => seg.startsWith(":") || seg === pathSegments[i]
    );
    if (allStaticSegmentsMatch) return true;
  }
  return false;
}

describe("Nav + footer link route coverage (getAllHrefs)", () => {
  it("every href in getAllHrefs() has a matching <Route path> in App.tsx", () => {
    const routePaths = extractAppRoutePaths();

    assert.ok(
      routePaths.size > 0,
      "Expected to find at least one <Route path> in App.tsx — check the regex or the file path"
    );

    const hrefs = getAllHrefs();
    assert.ok(hrefs.length > 0, "getAllHrefs() returned nothing — nav-config is broken");

    const missing = hrefs
      .map(bareHref)
      .filter((path) => !isMatchedByRoute(path, routePaths))
      .map((path) => `  "${path}" (no matching <Route path> in App.tsx)`);

    assert.deepEqual(
      missing,
      [],
      `\ngetAllHrefs() entries with no matching route in App.tsx (${missing.length}):\n${missing.join("\n")}\n\n` +
        `Add the <Route path="…"> in client/src/App.tsx first (route-first, nav-second),\n` +
        `or remove the nav/footer link if the page no longer exists.`
    );
  });
});
