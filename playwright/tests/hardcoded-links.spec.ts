import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Hardcoded-link cross-check — guards against in-component links that still
 * reference routes that no longer exist in App.tsx.
 *
 * This is the fourth suite in the Route Coverage Gate and closes the blind
 * spot left by the first three:
 *
 *   Suite 1 — navbar-links   : navGroupsConfig + authNavConfig → App.tsx
 *   Suite 2 — footer-links   : footerSectionsConfig → App.tsx
 *   Suite 3 — app-routes     : every App.tsx <Route path> renders real content
 *   Suite 4 — hardcoded-links (THIS FILE)
 *             All static href="/..." and to="/..." string literals in
 *             client/src/ → verified against App.tsx <Route path> entries
 *
 * What it catches:
 *   - A <Link to="/old-page"> left behind after its <Route> was deleted from
 *     App.tsx (and also removed from nav-config, so the other suites miss it)
 *   - A hardcoded <a href="/forgot-feature"> that never had a matching Route
 *   - A new to="/coming-soon" added to a component before its Route was wired
 *
 * What it intentionally skips:
 *   - Dynamic paths (href={`/...`}, href={someVar}) — not string literals, not
 *     captured by the regex
 *   - External URLs, hash-only links, mailto/tel links
 *   - /api/* paths (backend endpoints, not frontend routes)
 *   - client/src/lib/nav-config.ts (already covered by navbar-links + footer-links)
 *   - Paths listed in SKIP_PATHS (external-system URLs, CDN paths, etc.)
 *
 * Route matching:
 *   Dynamic segments (:id, :slug, :token, …) in App.tsx patterns are replaced
 *   with [^/]+ regex wildcards before matching.  A static path like
 *   /expert/clients/42 correctly matches the pattern /expert/clients/:clientId.
 *
 * No browser or running server needed — purely static source-file analysis.
 * Runs in navbar-links-gate.yml alongside the other three suites.
 */

// ── Paths to skip ─────────────────────────────────────────────────────────────
// Add paths here that intentionally exist in component files but are NOT
// frontend routes (external URLs served by a different system, CDN paths,
// etc.).  Do NOT add paths just because they are currently broken — fix the
// Route or remove the link instead.
const SKIP_PATHS = new Set<string>([
  '/sitemap.xml',
  '/robots.txt',
  '/favicon.ico',
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

// ── Regex to capture static string-literal href/to attributes ─────────────────
// Matches: href="/...", to="/..."
// Does NOT match: href={...}, to={`...`} (dynamic / template literal forms)
// Captures group 1 = the raw attribute value (may include query string / hash).
const HREF_RE = /(?:href|to)="(\/[^"]*)"/g;

function extractHardcodedPaths(files: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf-8');
    HREF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HREF_RE.exec(source)) !== null) {
      const raw = m[1];
      // Strip query string and hash fragment — only the pathname matters.
      const clean = raw.split(/[?#]/)[0];

      // Skip the root "/" — always valid, ubiquitous in back-links.
      if (clean === '/') continue;
      // Skip backend API endpoints.
      if (clean.startsWith('/api/')) continue;
      // Skip explicitly excluded paths.
      if (SKIP_PATHS.has(clean)) continue;

      const existing = result.get(clean) ?? [];
      if (!existing.includes(file)) existing.push(file);
      result.set(clean, existing);
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
// /itinerary/:id         → ^/itinerary/[^/]+$
// /experiences/:slug/new → ^/experiences/[^/]+/new$
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex metacharacters
    .replace(/:[a-zA-Z]+/g, '[^/]+'); // :param → segment wildcard
  return new RegExp(`^${escaped}$`);
}

// ── Build all matchers once at module load ────────────────────────────────────
const APP_ROUTE_PATTERNS = extractAppRoutePatterns();
const APP_ROUTE_REGEXES = APP_ROUTE_PATTERNS.map(patternToRegex);

function hasMatchingRoute(cleanPath: string): boolean {
  return APP_ROUTE_REGEXES.some((re) => re.test(cleanPath));
}

// ── Collect all hardcoded paths once at module load ───────────────────────────
const SOURCE_FILES = collectTsxFiles(CLIENT_SRC_DIR);
const HARDCODED_PATHS = extractHardcodedPaths(SOURCE_FILES);

// ── Test suite ────────────────────────────────────────────────────────────────
// One test per unique static path found. No browser required — this is a
// static-analysis gate that works entirely from source files.

test.describe('Hardcoded-link cross-check — component hrefs vs App.tsx routes', () => {
  // Sanity: confirm the scanner actually found paths to validate.
  test('scanner found at least one hardcoded path to validate', () => {
    expect(
      HARDCODED_PATHS.size,
      'The scanner found 0 hardcoded paths — the glob and regex may be broken.',
    ).toBeGreaterThan(0);
  });

  for (const [cleanPath, sourceFiles] of HARDCODED_PATHS) {
    test(`${cleanPath} has a matching <Route> in App.tsx`, () => {
      const matched = hasMatchingRoute(cleanPath);

      const relFiles = sourceFiles
        .map((f) => path.relative(CLIENT_SRC_DIR, f))
        .join(', ');

      expect(
        matched,
        `Path "${cleanPath}" is hardcoded in [${relFiles}] but has no matching ` +
          '<Route path="..."> in client/src/App.tsx.\n' +
          'Fix: either add a <Route> for this path, or remove / update the link.',
      ).toBe(true);

      console.log(`[hardcoded-links] PASS ${cleanPath}  (refs: ${relFiles})`);
    });
  }
});
