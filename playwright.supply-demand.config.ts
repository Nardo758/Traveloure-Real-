/**
 * playwright.supply-demand.config.ts
 *
 * Config for the supply→demand content-journey e2e harness (Pass 2).
 * Runs against a locally-built server (BASE_URL, default http://localhost:5000).
 * Serial, single worker: the supply specs (s1-s3) mint the Kyoto fixture
 * content that the demand specs (d*-*.spec.ts, owned by a sibling agent)
 * read back, so file-name order matters and nothing may run in parallel.
 *
 * See docs/audits/pass2/BRIEF.md for the harness contract.
 */
import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

const baseURL = process.env.BASE_URL || 'http://localhost:5000';

// Chromium executable resolution: prefer an explicit env override, else fall back to
// this environment's pre-installed browser at /opt/pw-browsers/chromium (the installed
// @playwright/test version can expect a newer revision than what's on disk here — CI
// runs `npx playwright install chromium` instead and never needs this fallback). Local
// dev/debugging works with no env var either way.
function resolveChromiumExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  // /opt/pw-browsers/chromium is itself the executable (a symlink straight to the
  // chrome binary) in this environment — not a directory to look inside.
  const candidates = [
    '/opt/pw-browsers/chromium',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return undefined;
}

export default defineConfig({
  testDir: './e2e/supply-demand',
  // IMPORTANT: Playwright deletes `outputDir` at the start of every run. The
  // harness's own persistent files (run-id, cross-spec state, findings/
  // visibility JSONL, row-count baselines) live under test-results/ but
  // OUTSIDE this subdirectory specifically so a second `playwright test`
  // invocation in the same session (e.g. running s1 then s2 separately)
  // does not wipe out what an earlier run wrote.
  outputDir: 'test-results/pw-output',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/supply-demand.json' }],
  ],
  use: {
    baseURL,
    // Hardening (lead review): Playwright's action timeout defaults to 0 (no limit
    // beyond the whole test's timeout), so one element that is present but never
    // becomes actionable used to burn the entire per-test budget on a single
    // `.fill()`/`.click()`. Setting it here covers every call site — including the
    // raw (un-wrapped) calls in lib/flows.ts — not just the ones in lib/ui.ts that
    // additionally pass an explicit timeout.
    actionTimeout: 3000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'off',
    launchOptions: (() => {
      const executablePath = resolveChromiumExecutablePath();
      return executablePath ? { executablePath } : {};
    })(),
  },
  // Pass 2 fix: `testMatch: ['s*-*.spec.ts', 'd*-*.spec.ts']` on a single project did NOT
  // enforce supply-before-demand ordering, despite this file's own header comment claiming
  // "file-name order matters" — Playwright sorts matched files by PATH, not by the order glob
  // patterns are listed, and 'd' sorts before 's', so a plain `npx playwright test` ran every
  // d*-*.spec.ts FIRST, against an empty harness state, and all seven skipped with "no supply
  // fixtures in state" (found running the first full Pass-2 demand suite: 9 skipped, S1-S3
  // green, all of D1-D7 skipped for exactly that reason). Two projects with an explicit
  // `dependencies` edge is what actually guarantees order: Playwright will not start a
  // dependent project until every test in its dependency has finished, regardless of alpha
  // sort — this is the documented mechanism for cross-file ordering, not testMatch array order.
  projects: [
    { name: 'supply', testMatch: 's*-*.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'demand', testMatch: 'd*-*.spec.ts', dependencies: ['supply'], use: { ...devices['Desktop Chrome'] } },
  ],
});
