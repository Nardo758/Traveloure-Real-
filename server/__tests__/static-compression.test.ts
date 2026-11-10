/**
 * R2-1 — the static payload is compressed when the client asks for it.
 *
 * The defect: every JS/CSS/schema-*.js file shipped with no `Content-Encoding` even when the browser
 * sent `Accept-Encoding: gzip, br` — ~1.2 MB of text per page load. `compression` is not a dependency
 * here, so `server/static.ts` negotiates with node's own zlib and caches each file's compressed form
 * by (path, mtime).
 *
 * This drives the REAL handlers (`serveCompressed`, `sendIndexHtml`) against a real temp directory
 * and a captured response — no sockets and no express boot, so it is deterministic and fast. The
 * bytes are decoded with zlib and compared to the file, which is the claim that matters.
 *
 *   Z1 `Accept-Encoding: gzip` ⇒ `Content-Encoding: gzip`, body gunzips to the file
 *   Z2 `Accept-Encoding: gzip, br` ⇒ brotli, preferred, decodes to the file
 *   Z3 no `Accept-Encoding` ⇒ identity: the handler steps aside (express.static answers)
 *   Z4 `Vary: Accept-Encoding` on the compressed answer AND the identity one
 *   Z5 the SPA shell is negotiated by the same rule
 *   Z6 a binary asset is never compressed, and HEAD announces the encoding with no body
 *
 * Run: npx tsx --test server/__tests__/static-compression.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { serveCompressed, sendIndexHtml } from "../static";

const JS_BODY = `/* r2-1 fixture */\n${"window.__fixture = 1;\n".repeat(4000)}`;
const HTML_BODY = `<!doctype html><html><head><title>t</title></head><body>${"<p>shell</p>".repeat(400)}</body></html>`;
const PNG_BODY = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);

let dir = "";

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "r2-1-"));
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "index-abc123.js"), JS_BODY);
  fs.writeFileSync(path.join(dir, "assets", "logo-abc123.png"), PNG_BODY);
  fs.writeFileSync(path.join(dir, "index.html"), HTML_BODY);
});

after(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the OS cleans temp dirs */
  }
});

interface Captured {
  headers: Record<string, string>;
  body: Buffer;
  /** True when the handler stepped aside (express.static would answer). */
  nexted: boolean;
}

/** Runs one handler with a captured response — no network, no express boot. */
function run(
  handler: (req: any, res: any, next: () => void) => void,
  opts: { path: string; acceptEncoding?: string; method?: string },
): Captured {
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const req: any = { method: opts.method ?? "GET", path: opts.path, url: opts.path, headers: {} };
  if (opts.acceptEncoding) req.headers["accept-encoding"] = opts.acceptEncoding;
  let answered = false;
  const res: any = {
    statusCode: 200,
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = String(v);
    },
    getHeader: (k: string) => headers[k.toLowerCase()],
    end: (b?: Buffer | string) => {
      answered = true;
      if (b) chunks.push(Buffer.isBuffer(b) ? b : Buffer.from(b));
    },
    sendFile: (f: string) => {
      answered = true;
      chunks.push(fs.readFileSync(f));
    },
  };
  let nexted = false;
  handler(req, res, () => {
    nexted = true;
  });
  return { headers, body: Buffer.concat(chunks), nexted: nexted || !answered };
}

const assets = () => serveCompressed(dir);

describe("R2-1 — gzip/brotli for the static payload", () => {
  it("Z1 gzip is negotiated, and the body decodes to the file", () => {
    const res = run(assets(), { path: "/assets/index-abc123.js", acceptEncoding: "gzip" });
    assert.equal(res.headers["content-encoding"], "gzip", "the whole defect: a Content-Encoding header");
    assert.match(res.headers["content-type"] ?? "", /javascript/);
    assert.equal(zlib.gunzipSync(res.body).toString("utf8"), JS_BODY);
    assert.ok(res.body.length < Buffer.byteLength(JS_BODY), `compressed ${res.body.length} < raw ${Buffer.byteLength(JS_BODY)}`);
    // Content-addressed assets keep the year the /assets mount already promised.
    assert.match(res.headers["cache-control"] ?? "", /immutable/);
  });

  it("Z2 brotli is preferred when the client offers it", () => {
    const res = run(assets(), { path: "/assets/index-abc123.js", acceptEncoding: "gzip, br" });
    assert.equal(res.headers["content-encoding"], "br");
    assert.equal(zlib.brotliDecompressSync(res.body).toString("utf8"), JS_BODY);
  });

  it("Z3 a client that asks for nothing gets identity (the handler steps aside)", () => {
    const res = run(assets(), { path: "/assets/index-abc123.js" });
    assert.equal(res.headers["content-encoding"], undefined, "identity means identity");
    assert.equal(res.nexted, true, "express.static answers, with its own ETag handling");
  });

  it("Z4 Vary: Accept-Encoding on the compressed answer AND the identity one", () => {
    for (const acceptEncoding of ["gzip", undefined]) {
      const res = run(assets(), { path: "/assets/index-abc123.js", acceptEncoding });
      assert.match(res.headers["vary"] ?? "", /Accept-Encoding/i, `Vary on ${String(acceptEncoding)}`);
    }
  });

  it("Z5 the SPA shell is negotiated by the same rule", () => {
    const res = run((req, resp, next) => sendIndexHtml(req, resp, dir), { path: "/", acceptEncoding: "gzip" });
    assert.equal(res.headers["content-encoding"], "gzip");
    assert.equal(zlib.gunzipSync(res.body).toString("utf8"), HTML_BODY);
    assert.match(res.headers["content-type"] ?? "", /text\/html/);
  });

  it("Z6 binary assets are never compressed, and HEAD announces without a body", () => {
    const png = run(assets(), { path: "/assets/logo-abc123.png", acceptEncoding: "gzip, br" });
    assert.equal(png.headers["content-encoding"], undefined, "an image is already compressed");
    assert.equal(png.nexted, true);

    const head = run(assets(), { path: "/assets/index-abc123.js", acceptEncoding: "gzip", method: "HEAD" });
    assert.equal(head.headers["content-encoding"], "gzip", "HEAD announces what GET would send");
    assert.equal(head.body.length, 0, "…and sends no body");
  });
});
