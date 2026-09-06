/**
 * `/.well-known` is served ahead of the SPA catch-all — CLAUDE.md Locked Decision 43(e),
 * ledger `2026-09-05-well-known-static`.
 *
 * THE DEFECT THIS PINS: Stripe verifies an Apple Pay domain by fetching
 * `https://<domain>/.well-known/apple-developer-merchantid-domain-association`. In production
 * that path was answered by the SPA fallback — HTTP 200 with the "404 – Lost at Sea?" HTML page —
 * so the domain could not be registered and Apple Pay could never appear, with nothing in any log
 * to say so (§9: a dead endpoint returns 200-HTML, NOT 404).
 *
 * WHAT IS PROVEN HERE, and nothing else:
 *   O1-O4  ORDER, by source position in `server/index.ts` — the one thing that makes the fix work.
 *   B1-B4  BEHAVIOUR, over a real express app on a real socket with a temp directory (B1-B3) and
 *          the pure path-resolution rules (B4). No DB, no Stripe, no network beyond loopback:
 *          `mountWellKnown` takes an explicit directory.
 *   D1-D3  The committed directory, and the BUILD OUTPUT when a build has been run (the dotfile
 *          directory surviving Vite's `publicDir` copy is the half a source-only test cannot see).
 *   F1-F2  The association file: byte-identical when committed, honestly documented when not.
 *
 * NEGATIVE SPACE: this boots `mountWellKnown`, NOT `server/index.ts`, so it cannot prove the real
 * server's middleware stack at runtime — O1-O4 are source-text pins and would not notice a
 * catch-all registered from some third file. It says nothing about TLS, the deployed domain, or
 * whether the Stripe dashboard registration was actually performed — LD 43(e) rules that an
 * operator step, and no test can assert it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import {
  mountWellKnown,
  resolveWellKnownDir,
  resolveWellKnownFile,
  wellKnownDirCandidates,
  WELL_KNOWN_DIRNAME,
  WELL_KNOWN_URL_PREFIX,
} from "../well-known";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const INDEX_TS = fs.readFileSync(path.join(REPO_ROOT, "server", "index.ts"), "utf-8");
const WELL_KNOWN_TS = fs.readFileSync(path.join(REPO_ROOT, "server", "well-known.ts"), "utf-8");
const SOURCE_DIR = path.join(REPO_ROOT, "client", "public", WELL_KNOWN_DIRNAME);
const ASSOCIATION_FILENAME = "apple-developer-merchantid-domain-association";
const STRIPE_FILE_URL = "https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association";

// ── O: order, pinned by source position ─────────────────────────────────────────────────────

test("O1: server/index.ts mounts /.well-known and imports it from the one module", () => {
  assert.match(INDEX_TS, /import \{ mountWellKnown \} from "\.\/well-known";/);
  assert.ok(INDEX_TS.includes("mountWellKnown(app);"), "the mount is never called");
});

test("O2: the mount is registered BEFORE the production serveStatic() pre-bind catch-all", () => {
  const mount = INDEX_TS.indexOf("mountWellKnown(app);");
  const serveStatic = INDEX_TS.indexOf("serveStatic(app);");
  assert.ok(mount > -1 && serveStatic > -1, "one of the two calls is missing");
  assert.ok(
    mount < serveStatic,
    "mountWellKnown(app) must appear ABOVE serveStatic(app) — serveStatic's boot-window catch-all answers 200-HTML for any non-/api path",
  );
});

test("O3: the mount is registered BEFORE both late SPA fallbacks (mountSpaFallback, setupVite)", () => {
  const mount = INDEX_TS.indexOf("mountWellKnown(app);");
  assert.ok(mount > -1, "mountWellKnown(app) is not called at all");
  for (const laterCall of ["mountSpaFallback(app);", "await setupVite(httpServer, app);"]) {
    const at = INDEX_TS.indexOf(laterCall);
    assert.ok(at > -1, `${laterCall} not found — the SPA fallback moved; re-pin this test`);
    assert.ok(mount < at, `mountWellKnown(app) must appear above ${laterCall}`);
  }
});

test("O4: both SPA fallbacks are still the catch-alls this ordering is defending against", () => {
  const staticTs = fs.readFileSync(path.join(REPO_ROOT, "server", "static.ts"), "utf-8");
  const viteTs = fs.readFileSync(path.join(REPO_ROOT, "server", "vite.ts"), "utf-8");
  assert.ok(staticTs.includes('app.use("*"'), "server/static.ts no longer holds a catch-all");
  assert.ok(viteTs.includes('app.use("*"'), "server/vite.ts no longer holds a catch-all");
  // The reason the mount is needed at all: express.static ignores dotfiles, so the built
  // dist/public/.well-known would fall through even when the file is present.
  assert.ok(
    !staticTs.includes(WELL_KNOWN_DIRNAME),
    "server/static.ts grew its own .well-known handling — one mount only (§18 rule 1)",
  );
});

// ── B: behaviour, over a real socket ────────────────────────────────────────────────────────

async function withServer(
  dir: string | null,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const app = express();
  mountWellKnown(app, dir);
  // Stand in for the real SPA fallbacks: 200 text/html for ANYTHING. If the mount ever stops
  // terminating a /.well-known request, these assertions see this page instead of a 404.
  app.use("*", (_req, res) => {
    res.status(200).type("html").send("<html><body>404 – Lost at Sea?</body></html>");
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("B1: a file dropped in the directory is served byte-identical, text/plain, uncached", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-"));
  // A stand-in for the real association file: extension-less, one line, no trailing newline.
  const body = "7B227073704964223A224558414D504C45222C2276657273696F6E223A312E307D";
  fs.writeFileSync(path.join(dir, ASSOCIATION_FILENAME), body);
  try {
    await withServer(dir, async (base) => {
      const res = await fetch(`${base}${WELL_KNOWN_URL_PREFIX}/${ASSOCIATION_FILENAME}`);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), body, "body must be byte-identical — no re-encoding");
      assert.match(res.headers.get("content-type") ?? "", /^text\/plain/);
      assert.equal(res.headers.get("cache-control"), "no-cache");
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("B2: an unknown /.well-known path is a PLAIN 404, never the SPA page", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-"));
  try {
    await withServer(dir, async (base) => {
      for (const p of [`${WELL_KNOWN_URL_PREFIX}/${ASSOCIATION_FILENAME}`, `${WELL_KNOWN_URL_PREFIX}/nope`, WELL_KNOWN_URL_PREFIX]) {
        const res = await fetch(`${base}${p}`);
        const text = await res.text();
        assert.equal(res.status, 404, `${p} answered ${res.status} — the SPA catch-all swallowed it`);
        assert.match(res.headers.get("content-type") ?? "", /^text\/plain/);
        assert.ok(!/Lost at Sea/.test(text), `${p} was answered with the SPA shell`);
      }
      // The SPA still owns everything else — this mount narrows nothing but its own prefix.
      const spa = await fetch(`${base}/plans/123`);
      assert.equal(spa.status, 200);
      assert.match(spa.headers.get("content-type") ?? "", /^text\/html/);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("B3: with NO directory at all the prefix still 404s honestly rather than falling to the SPA", async () => {
  await withServer(null, async (base) => {
    const res = await fetch(`${base}${WELL_KNOWN_URL_PREFIX}/${ASSOCIATION_FILENAME}`);
    assert.equal(res.status, 404);
    assert.ok(!/Lost at Sea/.test(await res.text()));
  });
});

test("B4: path resolution refuses traversal, dotfiles and the directory itself", () => {
  const dir = "/srv/app/dist/public/.well-known";
  assert.equal(resolveWellKnownFile(dir, "/apple-developer-merchantid-domain-association"), `${dir}/apple-developer-merchantid-domain-association`);
  assert.equal(resolveWellKnownFile(dir, "/acme-challenge/token123"), `${dir}/acme-challenge/token123`);
  for (const bad of ["/", "", "/../index.html", "/..%2f..%2fetc/passwd", "/.hidden", "/nested/../../escape", "/a//b", "/x%00.txt"]) {
    assert.equal(resolveWellKnownFile(dir, bad), null, `${JSON.stringify(bad)} must not resolve to a served file`);
  }
});

// ── D: the committed directory, and the build output ────────────────────────────────────────

test("D1: the directory is committed in the client publicDir, so it exists in every build", () => {
  assert.ok(fs.statSync(SOURCE_DIR).isDirectory(), `${SOURCE_DIR} is missing`);
  const readme = path.join(SOURCE_DIR, "README.md");
  assert.ok(fs.existsSync(readme), "the directory keeper/README is missing — git cannot carry an empty directory");
  const text = fs.readFileSync(readme, "utf-8");
  assert.ok(text.includes(STRIPE_FILE_URL), "the README must carry the exact Stripe file URL");
  assert.ok(text.includes(ASSOCIATION_FILENAME), "the README must name the exact filename");
});

test("D2: resolution finds the committed directory from the repo root, and never guesses", () => {
  assert.equal(resolveWellKnownDir(REPO_ROOT, "development"), SOURCE_DIR);
  const candidates = wellKnownDirCandidates(REPO_ROOT, "production");
  assert.equal(candidates[0], path.join(REPO_ROOT, "dist", "public", WELL_KNOWN_DIRNAME));
  assert.ok(candidates.every((c) => path.isAbsolute(c)));
  // An absent tree resolves to null — NOT to some other directory (§13).
  assert.equal(resolveWellKnownDir(path.join(os.tmpdir(), "no-such-repo-root"), "production"), null);
});

test("D3: the build output carries the directory (skipped, loudly, when nothing has been built)", () => {
  const builtPublic = path.join(REPO_ROOT, "dist", "public");
  if (!fs.existsSync(builtPublic)) {
    console.log("D3 SKIPPED: dist/public absent — run `npm run build` first (CI runs this test after the build)");
    return;
  }
  const builtWellKnown = path.join(builtPublic, WELL_KNOWN_DIRNAME);
  assert.ok(
    fs.existsSync(builtWellKnown),
    "dist/public/.well-known is missing — Vite's publicDir copy dropped the dotfile directory, so production would 404",
  );
  for (const entry of fs.readdirSync(SOURCE_DIR)) {
    assert.ok(fs.existsSync(path.join(builtWellKnown, entry)), `${entry} did not reach the build output`);
  }
});

// ── F: the association file itself ──────────────────────────────────────────────────────────

test("F1: when the association file is committed it is non-empty, single-line and unmangled", () => {
  const file = path.join(SOURCE_DIR, ASSOCIATION_FILENAME);
  if (!fs.existsSync(file)) {
    console.log(
      `F1 SKIPPED: ${ASSOCIATION_FILENAME} is not committed — it is an operator drop-in (see ${path.join(SOURCE_DIR, "README.md")}). The route is ready; the file is not.`,
    );
    return;
  }
  const raw = fs.readFileSync(file);
  assert.ok(raw.length > 0, "the association file is empty — an empty file verifies as a failure");
  const text = raw.toString("utf-8");
  assert.ok(!text.includes("\r"), "CRLF — the file must be committed verbatim, not re-encoded");
  assert.equal(text.trim().split("\n").length, 1, "the file is one line; extra lines mean it was mangled in transit");
  assert.ok(!/<html|<!DOCTYPE/i.test(text), "an HTML body was saved instead of the file");
});

test("F2: the absence of the file is DOCUMENTED, not silent — and the mount serves any drop-in", () => {
  const readme = fs.readFileSync(path.join(SOURCE_DIR, "README.md"), "utf-8");
  if (fs.existsSync(path.join(SOURCE_DIR, ASSOCIATION_FILENAME))) return;
  assert.ok(/NOT committed/i.test(readme), "the README must say plainly that the file is missing");
  assert.ok(/Payment method domains/i.test(readme), "the README must carry the operator's Stripe-dashboard step");
  // No code change is needed for the drop-in: the directory is read per request, not at boot.
  assert.ok(
    WELL_KNOWN_TS.includes("fs.readFile("),
    "the mount must read the DIRECTORY per request, not resolve one hard-coded file at boot",
  );
});
