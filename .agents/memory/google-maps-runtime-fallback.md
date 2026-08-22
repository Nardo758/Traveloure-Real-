---
name: Google Maps runtime auth fallback
description: How the workspace map falls back to Leaflet on runtime key rejection, and the gm_authFailure clobbering gotcha
---
Google-backed map surfaces use a build-time key check PLUS a shared runtime detector: Google calls `window.gm_authFailure` on key rejection (RefererNotAllowedMapError, expired key, billing), which flips the surface to its Leaflet fallback.

**Why:** `@vis.gl/react-google-maps` assigns its OWN `gm_authFailure` (source of its "Error: AuthFailure" overlay) after app modules evaluate — a plain assignment made at module scope gets clobbered and the fallback never fires. The fix is a single stable accessor-property wrapper (idempotent via a window flag, setter ignores self-assignment to avoid recursion, try/catch for non-configurable descriptors).

**How to apply:** any new Google map surface should gate on the shared `useGoogleMapsAuthFailed()` helper, not just `MAPS_KEY`. Also: curl-probing the Maps JS bootstrap with a Referer header always succeeds — referrer validation happens in a separate runtime AuthenticationService call, so curl cannot verify browser-key referrer restrictions.
