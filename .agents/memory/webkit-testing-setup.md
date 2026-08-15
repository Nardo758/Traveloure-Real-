---
name: WebKit (Safari-engine) testing on this repl
description: How to launch Playwright WebKit on NixOS for Safari-parity testing — LD path recipe, wrapper patch, TLS fix
---

Playwright WebKit works here but needs manual NixOS shimming (took many iterations):

1. `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright install webkit` (browser lands in `.cache/ms-playwright/webkit-*`).
2. The bundled `minibrowser-wpe/MiniBrowser` wrapper **hard-overwrites LD_LIBRARY_PATH** — patch it to `"${MYDIR}/lib:${LD_LIBRARY_PATH}:${MYDIR}/sys/lib"` (nix libs must beat the stale bundled sys/lib, e.g. old freetype lacking FT_Get_Transform that nix harfbuzz needs).
3. Build LD_LIBRARY_PATH from /nix/store lib dirs (saved at `/tmp/wk-ldpath.txt` last time; regenerate if gone). Version-alignment traps:
   - gstreamer core + plugins-base/-good/-bad must be the SAME minor (1.24.x); mixed versions → `gst_meta_info_register` / `g_sort_array` symbol errors.
   - freetype must be ≥2.11 to satisfy nix harfbuzz.
   - EXCLUDE mesa/libdrm dirs (nix mesa drivers break EGL with `amdgpu_va_get_start_addr`); use bundled GL + `LIBGL_ALWAYS_SOFTWARE=1`.
4. Point `GST_PLUGIN_SYSTEM_PATH_1_0`/`GST_REGISTRY_1_0` at an empty dir to dodge the libsoup2/libsoup3 same-process crash from gst plugins.
5. **TLS**: WebKit reports "TLS support is not available" and silently fails to load js.stripe.com (Stripe Elements area renders blank) unless `GIO_EXTRA_MODULES` points at a glib-networking `lib/gio/modules` dir + `SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt`. A blank PaymentElement in WebKit = missing TLS module, not an app bug.

App-flow facts learned while testing:
- Checkout payment step shows one-click "Book & Pay — saved card" when the traveler has a saved card; Stripe PaymentElement only mounts for card-less users after clicking "Complete Booking". Use a freshly registered account (POST /api/auth/register, then accept-terms) to exercise the Elements path.
- Cart can be seeded via `POST /api/cart {serviceId, quantity}`; trip date editor on /cart uses native `input[type=date]`.
