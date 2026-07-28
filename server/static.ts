import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hashed JS/CSS chunks (e.g. index-BRQeMJwg.js) are content-addressed —
  // safe to cache for 1 year. index.html and other root files must stay
  // uncached so deploys propagate immediately.
  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
  }));
  app.use(express.static(distPath, { maxAge: 0 }));

  // Boot-window catch-all. In production serveStatic mounts BEFORE registerRoutes
  // (the pre-bind block answers health checks while migrations run), so this
  // catch-all must not permanently own non-/api paths — it was swallowing every
  // server-rendered route registered later (the /p/:handle, /services/:id and
  // /ready-made/:id OG injections and the /r/:code short-link redirects — the
  // entire Direct channel was structurally dead in prod; dispatch P1, Jul 28 2026).
  // Once registerRoutes flips app.locals.routesReady, this handler steps aside and
  // requests flow to the real routes; mountSpaFallback() (mounted AFTER the routes)
  // then serves index.html for genuine SPA paths.
  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();
    if ((req.app.locals as any).routesReady) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

/**
 * The REAL SPA fallback — mounted after registerRoutes in production, so every
 * API route, OG-injection route, and short-link redirect wins first.
 */
export function mountSpaFallback(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
