---
name: Cross-browser Playwright on NixOS
description: How firefox/webkit Playwright browsers were made to run in this Replit workspace, and the traps.
---

Firefox + WebKit Playwright browsers DO work in this workspace (the old "network restrictions" comment in playwright.config.ts is obsolete). Recipe lives in `docs/testing/CROSS_BROWSER_SMOKE_2026-08-14.md`; matrix config is `playwright.crossbrowser.config.ts` + `playwright/crossbrowser/smoke.spec.ts`.

**Rules:**
- Run with `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` and `LD_LIBRARY_PATH=$PWD/.cache/pw-extra-libs` (host-dep validation always fails on NixOS even when launch works).
- WebKit MUST launch with a sanitized env: strip `GST_*`/`GIO_*`/`XDG_*`/`GDK/GTK` vars (Nix profile paths pull libsoup3 into the libsoup2 MiniBrowser → `libsoup-ERROR ... not supported` crash) and set `GIO_EXTRA_MODULES` to a glib-networking module dir, or all HTTPS fails with "TLS support is not available" (breaks Stripe).
- WebKit's `minibrowser-wpe/MiniBrowser` wrapper OVERWRITES `LD_LIBRARY_PATH`; missing libs must be copied into `minibrowser-wpe/sys/lib` (re-do after any `playwright install webkit`).
- Nix store has both 32-bit and 64-bit gcc lib dirs — check `file -L` before symlinking libstdc++/libatomic (ELFCLASS32 error otherwise).

**Why:** took many attempts (host validation, wrapper env clobber, 32-bit libs, libsoup conflict, missing TLS backend) — each failure mode looks like a different dead end.

**App facts learned:** cart flow reaches payment via `button-skip-to-payment` (optimize-preview sidebar) or `button-proceed-payment` (plain sidebar) → payment step → `button-complete-booking` fires POST /api/checkout → Stripe PaymentElement sheet → unlabeled `form button[type=submit]`. Benign console noise incl. "Failed to send error to Vite server" and unauth 401 probes.
