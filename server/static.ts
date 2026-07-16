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

  app.use(express.static(distPath));

  // fall through to index.html for SPA routes, but NEVER swallow /api requests —
  // in production serveStatic mounts before registerRoutes, so this catch-all would
  // otherwise return index.html for every API call.
  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
