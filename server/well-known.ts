import { type Express, type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { logger } from "./infrastructure/logger";

/**
 * `/.well-known` — served as static files, BEFORE either SPA catch-all.
 *
 * WHY THIS EXISTS (CLAUDE.md Locked Decision 43(e), ledger `2026-09-05-well-known-static`):
 * Stripe verifies an Apple Pay domain by fetching
 * `https://<domain>/.well-known/apple-developer-merchantid-domain-association`. Both SPA
 * fallbacks answer **200 text/html** for any unmatched path (`serveStatic`'s boot-window
 * catch-all and `mountSpaFallback` in production, Vite's `app.use("*")` in dev), so that
 * fetch received the SPA's "404 – Lost at Sea?" PAGE and the domain could not be registered.
 * That is §9's rule biting a third party: a dead path here returns 200-HTML, NOT 404.
 *
 * TWO THINGS THIS MOUNT GUARANTEES, and both are load-bearing:
 *   1. A file committed under `<publicDir>/.well-known/` is served VERBATIM, with a
 *      `text/plain` content type for the extension-less names this protocol uses and no
 *      caching (a stale cached body is a verification failure that looks like a routing bug).
 *   2. An unknown `/.well-known/*` path gets a PLAIN 404 — never the SPA — so a missing file
 *      reads as missing instead of reading as "your request reached a page".
 *
 * `serveStatic`'s own `express.static(distPath)` does NOT cover this and never could: it
 * ignores dotfiles by default (`dotfiles: "ignore"`), so `dist/public/.well-known/*` falls
 * through to the catch-all even once the file exists. The serve below is hand-rolled rather
 * than another `express.static` mount for a second reason — `app.use(path, express.static(…))`
 * is one of this repo's pre-existing `tsc` baseline errors (serve-static's own
 * `RequestHandler<R>` generic does not fit these express types), and the baseline only ever
 * moves down.
 *
 * The directory is read from disk PER REQUEST, so a file dropped in after boot (the operator
 * drop-in described in `client/public/.well-known/README.md`) is served without a restart —
 * as long as the directory itself exists at boot, which the committed README guarantees.
 */

export const WELL_KNOWN_DIRNAME = ".well-known";
export const WELL_KNOWN_URL_PREFIX = "/.well-known";

/**
 * Where the directory can live, most-likely-first for the current mode.
 *
 * Production serves the BUILT tree (`dist/public`, the same root `serveStatic` resolves) —
 * `server/public` is the legacy in-place layout and is kept as a second candidate. Development
 * serves the SOURCE tree (`client/public`, Vite's `publicDir`), because in dev nothing has been
 * built. Resolution is first-existing-wins over this list; there is no fabricated fallback —
 * when none exists the mount says so and still answers 404 rather than the SPA.
 */
export function wellKnownDirCandidates(
  cwd: string = process.cwd(),
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string[] {
  const built = path.resolve(cwd, "dist", "public", WELL_KNOWN_DIRNAME);
  const legacy = path.resolve(cwd, "server", "public", WELL_KNOWN_DIRNAME);
  const source = path.resolve(cwd, "client", "public", WELL_KNOWN_DIRNAME);
  return nodeEnv === "production" ? [built, legacy, source] : [source, built, legacy];
}

/** First candidate that exists as a directory, or null. NULL means NOT PRESENT — never a guess. */
export function resolveWellKnownDir(
  cwd: string = process.cwd(),
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string | null {
  for (const candidate of wellKnownDirCandidates(cwd, nodeEnv)) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Not there — try the next candidate. An unreadable path is the same answer as an absent one.
    }
  }
  return null;
}

/**
 * Resolve a request path under the directory, or null when it may not be served.
 *
 * REFUSED, all by the same rule — a served path must be a plain file INSIDE the directory:
 * traversal (`..`), an absolute escape, and any segment beginning with a dot (this protocol
 * names no dotfiles, and the directory itself is the only dot in the URL).
 */
export function resolveWellKnownFile(dir: string, requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null; // A malformed escape is not a filename.
  }
  if (decoded.includes("\0")) return null;
  const relative = decoded.replace(/^\/+/, "");
  if (!relative) return null; // The directory itself is not a file.
  const segments = relative.split("/");
  if (segments.some((segment) => segment === "" || segment.startsWith("."))) return null;
  const resolved = path.resolve(dir, ...segments);
  const root = path.resolve(dir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/** A plain-text 404. Deliberately not the SPA shell and not JSON: this protocol is read by machines. */
function wellKnownNotFound(_req: Request, res: Response): void {
  res.status(404).type("text/plain").send("Not Found\n");
}

/**
 * Mount `/.well-known`. Call this BEFORE any SPA catch-all is registered — in
 * `server/index.ts` it sits above the production `serveStatic(app)` pre-bind call and far
 * above `setupVite()`/`mountSpaFallback()`, so source position pins the order.
 */
export function mountWellKnown(
  app: Express,
  // Test seam ONLY — the one production caller passes nothing and takes the resolution above.
  dir: string | null = resolveWellKnownDir(),
): void {
  if (dir) {
    app.use(WELL_KNOWN_URL_PREFIX, (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();

      const file = resolveWellKnownFile(dir, req.path);
      if (!file) return next();

      fs.readFile(file, (err, body) => {
        // ENOENT / EISDIR / anything unreadable: fall through to the plain 404 below. Never
        // report a reason to the caller — this is an unauthenticated public path.
        if (err) return next();

        // Files here are read by verification robots; a stale body is a failed verification.
        res.setHeader("Cache-Control", "no-cache");
        // `apple-developer-merchantid-domain-association` has no extension, so a mime lookup
        // yields nothing and the body would go out as application/octet-stream. Stripe accepts
        // either; text/plain is the readable one.
        const extension = path.extname(file);
        res.type(extension ? extension : "text/plain; charset=utf-8");
        // The BUFFER is sent, unmodified — a re-encode here is a failed verification.
        res.status(200).send(body);
      });
    });
  } else {
    logger.warn(
      { candidates: wellKnownDirCandidates() },
      "No .well-known directory found — /.well-known/* will answer 404 (Apple Pay domain verification cannot succeed until a file is present)",
    );
  }

  // Always mounted, directory or not: an unknown /.well-known path must never reach the SPA.
  app.use(WELL_KNOWN_URL_PREFIX, wellKnownNotFound);
}
