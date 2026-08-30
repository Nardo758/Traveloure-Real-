/**
 * footer-route-coverage.test.ts
 *
 * Unit test — no browser required.
 *
 * Guarantees that every href listed in footerSectionsConfig (nav-config.ts)
 * has a corresponding <Route path="…"> declaration in App.tsx.
 *
 * Why this matters:
 *   The playwright/tests/footer-links.spec.ts smoke test only runs in CI.
 *   This check gives developers instant local feedback before they even push
 *   a branch: run `npm test` and see the mismatch immediately.
 *
 * Run with: npm test
 *        or: npx tsx --test client/src/lib/__tests__/footer-route-coverage.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { footerSectionsConfig } from "../nav-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Reads App.tsx and returns every static path string declared as
 * `<Route path="…">` or `<Route path='…'>`.
 * Dynamic segments (`:param`) are preserved so callers can match against them.
 */
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

/**
 * Strips a query string from a URL path.
 * e.g. "/discover?tab=events" → "/discover"
 */
function bareHref(href: string): string {
  return href.split("?")[0];
}

/**
 * Returns true when `path` is matched by at least one registered route.
 *
 * Rules (mirrors Wouter's path-matching semantics):
 *  1. Exact match  — path === routePath
 *  2. Param match  — routePath has a :param segment and every static part
 *     of the route is a prefix/suffix of path (simple prefix check for
 *     one-level dynamic routes like /experiences/:slug matching /experiences/…)
 *
 * For the purposes of this gate we only need to verify that footer hrefs
 * with *static* paths (no dynamic segments) have an exact route match.
 * Footer links never contain a `:param` segment themselves.
 */
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

describe("Footer link route coverage", () => {
  it("every footer href has a matching <Route path> in App.tsx", () => {
    const routePaths = extractAppRoutePaths();

    assert.ok(
      routePaths.size > 0,
      "Expected to find at least one <Route path> in App.tsx — check the regex or the file path"
    );

    const missing: string[] = [];

    for (const section of footerSectionsConfig) {
      for (const link of section.links) {
        const path = bareHref(link.href);
        if (!isMatchedByRoute(path, routePaths)) {
          missing.push(
            `  [${section.title}] "${link.label}" → "${link.href}" (no matching <Route path="${path}"> in App.tsx)`
          );
        }
      }
    }

    assert.deepEqual(
      missing,
      [],
      `\nFooter links with no matching route in App.tsx (${missing.length}):\n${missing.join("\n")}\n\n` +
        `Add a <Route path="…"> entry in client/src/App.tsx for each missing path,\n` +
        `or remove the footer link if the page no longer exists.`
    );
  });
});
