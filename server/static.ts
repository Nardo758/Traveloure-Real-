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

  // fall through to index.html for SPA routes, but NEVER swallow /api requests —
  // in production serveStatic mounts before registerRoutes, so this catch-all would
  // otherwise return index.html for every API call.
  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
