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

const baseURL = process.env.BASE_URL || 'http://localhost:5000';

export default defineConfig({
  testDir: './e2e/supply-demand',
  testMatch: ['s*-*.spec.ts', 'd*-*.spec.ts'],
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
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'off',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
