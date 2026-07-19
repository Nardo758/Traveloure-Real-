import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// This spec runs under Playwright's ESM loader, where `__dirname` is NOT defined
// (it only exists in CommonJS). Derive it from import.meta.url — otherwise the
// source-file collection below throws "ReferenceError: __dirname is not defined
// in ES module scope" at collection time and the whole suite errors out.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dynamic-link cross-check — Suite 5
 *
 * Extends Suite 4 (hardcoded-links.spec.ts) to cover links built from
 * template literals.  Suite 4 only catches static string literals like
 * `href="/some-page"`.  A route deletion can still leave dynamic links
 * pointing at nothing without any gate catching it.
 *
 * Patterns detected:
 *   href={`/static/${dynamic}/suffix`}
 *   to={`/static/${dynamic}`}
 *   navigate(`/static/${dynamic}`)
 *   setLocation(`/static/${dynamic}`)
 *   window.location.href = `/static/${dynamic}`
 *
 * Algorithm per template literal:
 *   1. Capture the full template literal body up to the first closing backtick
 *      that belongs to the outer literal (the [^`]* regex stops there).
 *   2. Replace every ${…} expression — where the expression body contains no
 *      "}" — with the single safe character "X" (no slashes, so X is treated
 *      as one path segment, matching any single :param wildcard in a route).
 *   3. Strip query string and hash — only the pathname matters for routing.
 *   4. Skip the path if it still contains "${" after substitution.  This
 *      happens when a nested template literal appears inside a ${…} expression
 *      (e.g. `${ternary ? `…` : ""}`).  The scanner can't safely resolve those
 *      statically, so it skips rather than producing a false failure.
 *   5. Check the resulting concrete-ish path against every
 *      <Route path="…"> in App.tsx, where :param → [^/]+ wildcard.
 *
 * Example:
 *   `/experts/${expert.id}`  → `/experts/X`      → matches /experts/:id  ✓
 *   `/trip/${id}/edit`       → `/trip/X/edit`     → no matching route     ✗  FAIL
 *   `/visa-help${x ? `…`}`  → skipped (nested template literal)
 *
 * Intentionally skipped:
 *   - Template literals whose content does not start with "/" (external URLs,
 *     mailto:, tel:, pure-variable hrefs like `${someUrl}`)
 *   - Template literals with no ${…} at all — Suite 4 handles those
 *   - /api/* paths
 *   - Paths in SKIP_PATHS
 *   - Paths with unresolved "${" remnants after ${…} substitution (nested
 *     template literals — unresolvable at static-analysis time)
 *   - client/src/lib/nav-config.ts (covered by Suites 1 + 2)
 *
 * No browser or running server needed — purely static source-file analysis.
 * Runs in navbar-links-gate.yml alongside the other route-coverage suites.
 */

// ── Paths to skip ─────────────────────────────────────────────────────────────
// Add paths here that intentionally exist in component files but are NOT
// frontend routes (external URLs served by a different system, CDN paths, etc.).
// Do NOT add paths just because they are currently broken — fix the Route or
// remove the link instead.
const SKIP_PATHS = new Set<string>([
  '/sitemap.xml',
  '/robots.txt',
  '/favicon.ico',
  // navigate(`/${role}/services`) in ServiceForm.tsx where role is 'expert' or
  // 'provider' at runtime.  Both /expert/services and /provider/services have
  // matching <Route> entries; the scanner cannot resolve a dynamic leading
  // segment, so /X/services is a false positive here.
  '/X/services',
]);

// ── Source file collection ────────────────────────────────────────────────────
const CLIENT_SRC_DIR = path.resolve(__dirname, '../../client/src');
const NAV_CONFIG_PATH = path.join(CLIENT_SRC_DIR, 'lib', 'nav-config.ts');

function collectTsxFiles(dir: string, result: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsxFiles(full, result);
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      if (full !== NAV_CONFIG_PATH) {
        result.push(full);
      }
    }
  }
  return result;
}

// ── Regex to capture template-literal navigation paths ────────────────────────
// Matches any of the five programmatic-navigation patterns:
//   1. href={`/…`}                  — JSX attribute (group 1)
//   2. to={`/…`}                    — wouter <Link to> attribute (group 1)
//   3. navigate(`/…`)               — wouter useLocation navigate() call (group 2)
//   4. setLocation(`/…`)            — wouter useLocation setLocation() call (group 2)
//   5. window.location.href = `/…`  — imperative redirect (group 3)
//
// [^`]* stops at the first backtick — intentional: for nested template literals
// (e.g. `${x ? `…` : ""}`), the body is truncated at the inner backtick.  The
// "skip if '${' remains" guard handles truncated cases without false failures.
// Does NOT match static string literals  href="/…"  (Suite 4 handles those).
//
// To extract the path body: use m[1] ?? m[2] ?? m[3] (exactly one will be set).
const TEMPLATE_HREF_RE =
  /(?:href|to)=\{`(\/[^`]*)`\}|(?:navigate|setLocation)\(`(\/[^`]*)`\)|window\.location\.href\s*=\s*`(\/[^`]*)`/g;

// ── Replace ${…} with a single safe segment placeholder ───────────────────────
// "X" contains no "/" so it is treated as one path segment and matches any
// single :param wildcard in a wouter route pattern.
// \$\{[^}]*\} handles the common case where the expression body contains no "}":
//   ${id}  ${expert.id}  ${encodeURIComponent(slug)}  ${detailQuery ?? ""}
// Expressions that contain nested "}" (rare in href contexts) are not replaced;
// the subsequent "${" guard skips those paths safely.
const EXPR_RE = /\$\{[^}]*\}/g;

function normalizeDynamicPath(templateBody: string): string | null {
  // Substitute every resolvable ${…} expression with the segment placeholder.
  const substituted = templateBody.replace(EXPR_RE, 'X');

  // Strip query string and hash — routing only cares about the pathname.
  const pathname = substituted.split(/[?#]/)[0];

  // Skip root — always valid, ubiquitous in back-links.
  if (pathname === '/') return null;
  // Skip backend API endpoints.
  if (pathname.startsWith('/api/')) return null;
  // Skip explicitly excluded paths.
  if (SKIP_PATHS.has(pathname)) return null;
  // Skip paths that still contain "${" after substitution.  This happens when a
  // nested template literal inside a ${…} expression caused truncation — the
  // scanner can't safely resolve the remaining expression statically.
  if (pathname.includes('${')) return null;

  return pathname;
}

// ── Extract all dynamic template-literal paths ────────────────────────────────
function extractDynamicPaths(files: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf-8');
    TEMPLATE_HREF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TEMPLATE_HREF_RE.exec(source)) !== null) {
      // m[1] = href/to JSX attribute, m[2] = navigate/setLocation call,
      // m[3] = window.location.href assignment.  Exactly one group is set.
      const raw = m[1] ?? m[2] ?? m[3];

      // Only process paths that contain at least one ${…} expression.
      // Paths without expressions are static strings — Suite 4 handles those.
      if (!raw.includes('${')) continue;

      const normalized = normalizeDynamicPath(raw);
      if (normalized === null) continue;

      const existing = result.get(normalized) ?? [];
      if (!existing.includes(file)) existing.push(file);
      result.set(normalized, existing);
    }
  }

  return result;
}

// ── App.tsx route extraction ──────────────────────────────────────────────────
function extractAppRoutePatterns(): string[] {
  const appTsxPath = path.resolve(__dirname, '../../client/src/App.tsx');
  const source = fs.readFileSync(appTsxPath, 'utf-8');
  const routeRe = /<Route\s+path="([^"]+)"/g;
  const patterns: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = routeRe.exec(source)) !== null) {
    patterns.push(m[1]);
  }
  return patterns;
}

// ── Route pattern → regex ─────────────────────────────────────────────────────
// /itinerary/:id            → ^/itinerary/[^/]+$
// /expert/services/:id/edit → ^/expert/services/[^/]+/edit$
// The placeholder "X" used in substituted paths contains no "/", so it always
// matches the [^/]+ wildcard that :param segments are converted to.
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/:[a-zA-Z]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

// ── Build all matchers once at module load ────────────────────────────────────
const APP_ROUTE_PATTERNS = extractAppRoutePatterns();
const APP_ROUTE_REGEXES = APP_ROUTE_PATTERNS.map(patternToRegex);

function hasMatchingRoute(normalizedPath: string): boolean {
  return APP_ROUTE_REGEXES.some((re) => re.test(normalizedPath));
}

// ── Collect all dynamic paths once at module load ─────────────────────────────
const SOURCE_FILES = collectTsxFiles(CLIENT_SRC_DIR);
const DYNAMIC_PATHS = extractDynamicPaths(SOURCE_FILES);

// ── Test suite ────────────────────────────────────────────────────────────────
test.describe('Dynamic-link cross-check — template literal hrefs vs App.tsx routes', () => {
  // Sanity: confirm the scanner found template-literal paths to validate.
  test('scanner found at least one dynamic path to validate', () => {
    expect(
      DYNAMIC_PATHS.size,
      'The dynamic-link scanner found 0 template-literal paths — the regex may be broken.',
    ).toBeGreaterThan(0);
  });

  for (const [normalizedPath, sourceFiles] of DYNAMIC_PATHS) {
    test(`${normalizedPath} has a matching <Route> in App.tsx`, () => {
      const matched = hasMatchingRoute(normalizedPath);

      const relFiles = sourceFiles
        .map((f) => path.relative(CLIENT_SRC_DIR, f))
        .join(', ');

      expect(
        matched,
        `Dynamic path "${normalizedPath}" (from template literal in [${relFiles}]) ` +
          'has no matching <Route path="…"> in client/src/App.tsx.\n' +
          'The scanner substituted each ${…} expression with "X" before matching.\n' +
          'Fix: either add a <Route> for this path, or update the link.',
      ).toBe(true);

      console.log(`[dynamic-links] PASS ${normalizedPath}  (refs: ${relFiles})`);
    });
  }
});
