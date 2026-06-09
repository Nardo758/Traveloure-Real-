/* Traveloure PWA service worker — Phase 3 (offline shell + active-plan cache).
 *
 * Conservative by design so it can't serve stale app code:
 *   - navigations  → network-first, cached shell fallback when offline
 *   - /assets/*    → cache-first (Vite hashes these, so they're immutable)
 *   - plancard API → network-first, cached fallback for patchy mid-trip connectivity
 *   - everything else → passthrough (network)
 *
 * NO push/notification handlers yet — Phase 3 is subscription-only; the send +
 * receive layer is Phase 4.
 */
const VERSION = "v1";
const SHELL_CACHE = `traveloure-shell-${VERSION}`;
const ASSET_CACHE = `traveloure-assets-${VERSION}`;
const PLAN_CACHE = `traveloure-plan-${VERSION}`;
const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.add(SHELL_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, PLAN_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("traveloure-") && !keep.has(n))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const shell = await cache.match(SHELL_URL);
          return shell || Response.error();
        }
      })()
    );
    return;
  }

  // Hashed build assets: cache-first (immutable).
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      })()
    );
    return;
  }

  // Active trip plan: network-first, cache fallback (patchy connectivity mid-trip).
  if (url.pathname.startsWith("/api/trips/") && url.pathname.endsWith("/plancard")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PLAN_CACHE);
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const hit = await cache.match(req);
          if (hit) return hit;
          return Response.error();
        }
      })()
    );
    return;
  }

  // Everything else: default network behaviour.
});
