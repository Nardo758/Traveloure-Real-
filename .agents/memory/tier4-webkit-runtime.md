---
name: Tier 4 WebKit runtime
description: How to classify and approach Playwright WebKit launch failures in the Replit Nix audit environment.
---

Treat a Playwright WebKit process that cannot resolve its native GLES2 or
GStreamer libav libraries as an environment-blocked **unable** result, not as an
application booking failure and never as a browser pass.

**Why:** Chromium and Firefox can execute the full local Stripe test-mode booking
journey after adding normal browser runtime libraries, while the pinned WebKit
bundle can still fail before opening a page even when the apparent Nix
equivalents are installed. The formerly documented dedicated Tier 4 launcher is
not present in the current tree.

**How to apply:** Confirm the failure occurs at `browserType.launch` before any
application URL is reached, preserve the trace and command output, run the other
engines independently, and require a reproducible WebKit-specific launcher or a
physical Safari run before claiming Safari-class coverage.