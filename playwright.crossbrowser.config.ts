/**
 * playwright.crossbrowser.config.ts — Task #1147 cross-browser smoke matrix.
 *
 * Five projects: chromium desktop, firefox desktop, webkit desktop,
 * webkit + iPhone 13 (iOS Safari EMULATION), chromium + Pixel 7 (Android EMULATION).
 * Real devices are out of scope — emulation gaps are flagged in the report.
 *
 * Environment notes (Replit / NixOS):
 *  - firefox/webkit binaries live in ./.cache/ms-playwright (PLAYWRIGHT_BROWSERS_PATH=0-style
 *    local cache); missing system libs were installed via Nix, plus symlinked odd ones in
 *    .cache/pw-extra-libs. Run with:
 *      PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
 *      LD_LIBRARY_PATH=$PWD/.cache/pw-extra-libs \
 *      npx playwright test -c playwright.crossbrowser.config.ts --workers=1
 *  - WebKit must launch with a SANITIZED env: the Nix profile's GST_/GIO_/XDG_ vars pull
 *    libsoup3 into the libsoup2-linked MiniBrowser and crash it.
 */
import { defineConfig, devices } from '@playwright/test';
import * as fs from 'node:fs';

/**
 * WebKit's bundled libsoup2 has no TLS backend on NixOS — we must point GIO at a
 * glib-networking module dir. Resolve it portably: env override first, then the
 * path recorded at setup time, and fail with a clear prerequisite error if gone
 * (a Nixpkgs rebuild can invalidate store hashes).
 */
function glibNetworkingGioModules(): string {
  const candidates = [
    process.env.GLIB_NETWORKING_GIO_MODULES,
    '/nix/store/0nflg54vsjqwijig30p1x9n952jqdblb-glib-networking-2.76.0/lib/gio/modules',
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(`${c}/libgiognutls.so`)) return c;
  }
  throw new Error(
    'crossbrowser config: no glib-networking GIO module dir found (WebKit would run without TLS ' +
      'and Stripe checkout would silently break). Install the "glib-networking" Nix package and ' +
      'set GLIB_NETWORKING_GIO_MODULES=<store-path>/lib/gio/modules.',
  );
}

function webkitSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(GST|GIO|XDG|GDK|GTK)/i.test(k)) continue;
    env[k] = v;
  }
  env.LD_LIBRARY_PATH = '';
  // Point GIO at glib-networking's gnutls module ONLY (the profile-wide GIO/GST paths pull
  // libsoup3 and crash MiniBrowser).
  env.GIO_EXTRA_MODULES = glibNetworkingGioModules();
  return env;
}

export default defineConfig({
  testDir: './playwright/crossbrowser',
  passWithNoTests: false,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list'], ['json', { outputFile: 'playwright-report/crossbrowser-results.json' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:5000',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'], launchOptions: { env: webkitSafeEnv() } },
    },
    {
      name: 'ios-safari-emulated',
      use: { ...devices['iPhone 13'], launchOptions: { env: webkitSafeEnv() } },
    },
    { name: 'android-chrome-emulated', use: { ...devices['Pixel 7'] } },
  ],
});
