# Cross-Browser QA Smoke Test — 2026-08-14 (Task #1147)

**Suite:** `playwright/crossbrowser/smoke.spec.ts` via `playwright.crossbrowser.config.ts`
**App under test:** dev server (`Start application`) at `http://127.0.0.1:5000`, branch content-identical to main + rulings 112/113 commit.
**Run command:**

```bash
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
LD_LIBRARY_PATH=$PWD/.cache/pw-extra-libs \
npx playwright test -c playwright.crossbrowser.config.ts --workers=1
```

## Verdict

**5/5 browser combinations PASS — no breaks found.**

28 checks executed, 0 failures (admin panel intentionally skipped on the 2 mobile profiles — out of scope).

## Environments

| Project | Engine | Profile | Notes |
|---|---|---|---|
| chromium-desktop | Chromium 145 (Playwright 1.58.2) | Desktop Chrome 1280×720 | |
| firefox-desktop | Firefox 146 | Desktop Firefox 1280×720 | |
| webkit-desktop | WebKit 26.4 (webkit-2248) | Desktop Safari 1280×720 | Safari **emulation** via WebKit build — not real macOS Safari |
| ios-safari-emulated | WebKit 26.4 | iPhone 13 (390×664, touch, mobile UA) | **Emulation** — no real iOS hardware/rubber-band scrolling/Apple Pay surfaces |
| android-chrome-emulated | Chromium 145 | Pixel 7 (412×839, touch, mobile UA) | **Emulation** — no real Android WebView/Chrome-for-Android quirks |

Real devices were out of scope. Emulation cannot catch: real-device font rendering, iOS Safari toolbar viewport collapse, Apple/Google Pay sheets, device-speed jank, or vendor-skinned Android browsers.

## Results matrix

Statuses: ✅ pass (visual render + functional assertions + zero non-benign console errors) · ➖ out of scope.

| Page / flow | chromium-desktop | firefox-desktop | webkit-desktop | ios-safari (emu) | android-chrome (emu) |
|---|---|---|---|---|---|
| Homepage (layout, hero, nav render, console) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Navbar (desktop dropdowns / mobile hamburger open+close) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Discover page (4 tabs visible, client-side switch, filter bar) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sign-in modal (opens, email + password fields) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Full booking checkout** (fresh user → trip → catalog item → cart → payment step → Stripe Elements iframe, card 4242 4242 4242 4242 → confirmation) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin panel load (`/admin/dashboard`, admin login) | ✅ | ✅ | ✅ | ➖ | ➖ |

Per-browser: chromium-desktop 6/6, firefox-desktop 6/6, webkit-desktop 6/6, ios-safari-emulated 5/5, android-chrome-emulated 5/5.

## Console errors

Zero non-benign console errors in any browser. Filtered as known-benign noise (dev-only):

- Vite HMR websocket / `Failed to send error to Vite server` (Replit proxy artifact)
- 401s from unauthenticated session probes (`/api/auth/user` while logged out)
- Partnerize 403/404 asset fetches
- WebKit: none after TLS backend fix (see below) — before it, `TLS support is not available` blocked Google Fonts + Stripe (environment issue, not an app bug)

## Environment setup (for reruns)

Firefox/WebKit were historically disabled in `playwright.config.ts` ("network restrictions"). They now work; the enabling steps, all local to this workspace:

1. Browsers downloaded to `./.cache/ms-playwright` (`npx playwright install firefox webkit` — download works; only host-dep *validation* fails on NixOS, hence `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`).
2. Nix system libs installed (gtk3/pango/cairo/nss/gstreamer/gtk4/icu74/etc. + `glib-networking`).
3. Odd-ball libs symlinked into `.cache/pw-extra-libs` (libstdc++, libatomic — must be x86-64, the store also has 32-bit copies — libharfbuzz-icu, libjpeg.so.8, libGLESv2, libx264) and copied into `webkit-2248/minibrowser-wpe/sys/lib` (the WebKit wrapper overwrites `LD_LIBRARY_PATH`).
4. WebKit launches with a sanitized env (config strips `GST_*`/`GIO_*`/`XDG_*` — the Nix profile's paths pull libsoup3 into the libsoup2-linked MiniBrowser and crash it) plus `GIO_EXTRA_MODULES` pointed at glib-networking's gnutls module for TLS.

Note: re-running `npx playwright install webkit` replaces the browser folder — re-copy `.cache/pw-extra-libs/*` into `minibrowser-wpe/sys/lib` afterwards.

## Flags / caveats

- **No single-browser failures** were found, so nothing is HIGH PRIORITY.
- WebKit TLS: out of the box the NixOS environment gives WebKit no TLS backend, which would break Stripe (js.stripe.com) — fixed at the harness level as above. Purely an environment concern; production users' real Safari is unaffected.
- Checkout uses seeded API fixtures (fresh user/trip/catalog item routed to `ready_for_checkout`) then the **real UI payment sheet** — Stripe Elements iframe rendered and card-confirmed in every engine, in Stripe test mode.
- The webkit-desktop failures visible in an earlier aborted run (`test-results/` artifacts) were the pre-fix TLS issue + a dev-server outage, not app regressions; all pass post-fix.
