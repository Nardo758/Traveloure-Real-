---
name: Cross-browser Playwright on NixOS
description: Durable lessons from enabling firefox/webkit Playwright browsers in this workspace.
---

Firefox + WebKit Playwright browsers DO work here — the old "disabled due to network restrictions" belief is obsolete. Rerun mechanics live in `docs/testing/CROSS_BROWSER_SMOKE_2026-08-14.md` + `scripts/setup-crossbrowser.sh`; don't duplicate them.

**Durable lessons:**
- On NixOS, Playwright's host-dependency *validation* fails even when browsers launch fine — skip validation rather than chasing phantom missing deps.
- WebKit's launcher wrapper clobbers `LD_LIBRARY_PATH`, and the Nix profile's GIO/GST env poisons it with a libsoup2/3 conflict; the fix is a sanitized launch env plus an explicit TLS (glib-networking) module — "TLS support is not available" console errors are the tell, and they silently break Stripe.
- Never pin `/nix/store` hashes in config — rebuilds invalidate them; discover at setup time and cache.
- The store carries 32-bit and 64-bit copies of gcc libs; always `file -L` before symlinking.
- Any test that creates users/bookings through the app must gate on a verified cleanup path BEFORE creating fixtures (this repo's convention: `JOURNEY_DB_WRITES_OK=1` opt-in, delete the fresh user in `finally`, and assert the DB fact — a confirmation URL alone can be a false positive).

**Why:** each failure mode above looked like a different dead end and cost multiple attempts; and completion review rejects harnesses with pinned store hashes or uncleaned fixtures.
