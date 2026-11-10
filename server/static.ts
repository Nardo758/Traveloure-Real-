import express, { type Express, type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import zlib from "zlib";

// ─── R2-1: negotiate gzip/brotli for the static payload ─────────────────────────────────────────
//
// THE COST THIS REMOVES: every JS/CSS/schema-*.js file was served with no `Content-Encoding` even
// when the browser sent `Accept-Encoding: gzip, br` — ~1.2 MB of text per page load. `compression`
// is NOT a dependency of this repo, and adding one would be a lockfile change for one middleware,
// so this uses node's own zlib and a per-file cache: each file is compressed ONCE (keyed by path +
// mtime, so a deploy invalidates it) and then served from memory.
//
// WHY A STATIC-ONLY MIDDLEWARE AND NOT A RESPONSE FILTER: compressing arbitrary JSON/streams on the
// fly is where a hand-rolled filter gets subtly wrong (double-compressed proxied bodies, chunked
// SSE, wrong Content-Length). The megabyte is in the static bundle; that is what this touches.
//
// `Vary: Accept-Encoding` is set on EVERY compressible-path response, including the ones that fall
// through to `express.static` uncompressed — a shared cache must never hand a gzip body to a client
// that did not ask for one.
const COMPRESSIBLE_EXT = /\.(?:js|mjs|css|json|svg|txt|xml|webmanifest|map|woff|woff2)$/i;

const MIME_BY_EXT: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

interface CompressedFile {
  mtimeMs: number;
  gzip: Buffer;
  br: Buffer | null;
}

const compressedCache = new Map<string, CompressedFile>();

/** Compressed forms of one file, built once per (path, mtime). `null` ⇒ not compressible/not a file. */
function compressedFor(file: string): { gzip: Buffer; br: Buffer | null } | null {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return null;
    const hit = compressedCache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit;
    const raw = fs.readFileSync(file);
    const built: CompressedFile = {
      mtimeMs: stat.mtimeMs,
      gzip: zlib.gzipSync(raw, { level: 6 }),
      // Brotli is optional on purpose: it costs more CPU to build, so a runtime without it still
      // serves gzip rather than failing.
      br: typeof zlib.brotliCompressSync === "function" ? zlib.brotliCompressSync(raw) : null,
    };
    compressedCache.set(file, built);
    return built;
  } catch {
    return null;
  }
}

function acceptedEncodings(req: Request): { br: boolean; gzip: boolean } {
  const header = String(req.headers["accept-encoding"] ?? "").toLowerCase();
  return { br: /(^|,|\s)br(;|,|$)/.test(header), gzip: /(^|,|\s)gzip(;|,|$)/.test(header) };
}

/** The file a request maps to inside `root`, or null when it escapes the root or names no file. */
function fileForRequest(root: string, req: Request): string | null {
  let pathname = req.path;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  const resolved = path.resolve(root, `.${pathname}`);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/**
 * Serves a compressible static file itself when the client accepts gzip/br, and otherwise steps
 * aside so `express.static` answers with its own ETag/Last-Modified handling.
 */
export function serveCompressed(root: string): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const file = fileForRequest(root, req);
    if (!file || !COMPRESSIBLE_EXT.test(file)) return next();
    // Negotiated resource: the header goes on BOTH answers, compressed and identity.
    res.setHeader("Vary", "Accept-Encoding");
    const accepted = acceptedEncodings(req);
    if (!accepted.br && !accepted.gzip) return next();
    const compressed = compressedFor(file);
    if (!compressed) return next();
    const encoding = accepted.br && compressed.br ? "br" : "gzip";
    const body = encoding === "br" ? compressed.br! : compressed.gzip;
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Content-Type", MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    // Assets are content-addressed (`index-BRQeMJwg.js`), so they keep the immutable year the
    // existing /assets mount already promised; everything else stays uncached so deploys propagate.
    res.setHeader(
      "Cache-Control",
      req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0",
    );
    if (req.method === "HEAD") return res.end();
    return res.end(body);
  };
}

/**
 * The SPA `index.html`, negotiated the same way (R2-1's HTML half). Both catch-alls send this.
 */
export function sendIndexHtml(req: Request, res: Response, distPath: string) {
  const file = path.join(distPath, "index.html");
  res.setHeader("Vary", "Accept-Encoding");
  const accepted = acceptedEncodings(req);
  const compressed = accepted.br || accepted.gzip ? compressedFor(file) : null;
  if (compressed) {
    const encoding = accepted.br && compressed.br ? "br" : "gzip";
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0");
    return res.end(encoding === "br" ? compressed.br! : compressed.gzip);
  }
  return res.sendFile(file);
}

/**
 * Path prefixes the SPA fallback must NEVER answer.
 *
 * `/api` was always exempt. `/internal` joins it (lane: internal-jobs-hardening, L3): the
 * `/internal/jobs/*` MONEY runners are fired by an external cron whose only health signal is the
 * response, and an unmatched `/internal/*` path falling through to `sendFile(index.html)` answers
 * **HTTP 200 text/html** — so a renamed or deleted job route would report green forever while the
 * job never ran (§9: a dead endpoint returns 200-HTML, not 404). Exempting the prefix here lets
 * `app.use("/internal", notFoundHandler)` produce an honest 404 JSON instead.
 *
 * Shared by BOTH catch-alls below on purpose — the boot-window one matters too, because a cron
 * pass can land while `routesReady` is still false.
 */
const SERVER_PATH_PREFIXES = ["/api", "/internal"] as const;

function isServerPath(originalUrl: string): boolean {
  return SERVER_PATH_PREFIXES.some(
    (prefix) => originalUrl === prefix || originalUrl.startsWith(`${prefix}/`) || originalUrl.startsWith(`${prefix}?`),
  );
}

/**
 * Mounts the static rail. `distPathOverride` exists for tests: the real path is `__dirname/public`,
 * which a unit test cannot populate without writing into the repo.
 */
export function serveStatic(app: Express, distPathOverride?: string) {
  const distPath = distPathOverride ?? path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // R2-1: negotiate gzip/brotli BEFORE the two static mounts, so a compressible file the client
  // accepts compressed never travels raw. Files that are not compressible, or clients that ask for
  // identity, fall through to `express.static` unchanged (it still sets ETag/Last-Modified).
  app.use(serveCompressed(distPath));

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
    if (isServerPath(req.originalUrl)) return next();
    if ((req.app.locals as any).routesReady) return next();
    // R2-1's HTML half: the shell is negotiated too (one gzip, cached by mtime).
    return sendIndexHtml(req, res, distPath);
  });
}

/**
 * The REAL SPA fallback — mounted after registerRoutes in production, so every
 * API route, OG-injection route, and short-link redirect wins first.
 */
export function mountSpaFallback(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  app.use("*", (req, res, next) => {
    if (isServerPath(req.originalUrl)) return next();
    return sendIndexHtml(req, res, distPath);
  });
}
