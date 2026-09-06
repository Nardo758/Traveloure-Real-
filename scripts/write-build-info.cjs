#!/usr/bin/env node
/**
 * Writes `dist/build-info.json` — the build identity `GET /api/version` and `GET /api/health`
 * report (server/services/build-info.ts, source 2).
 *
 * WHY A FILE. Replit Autoscale injects NO commit env var at runtime — evidence in
 * docs/STAGING.md §4.6 ("production does not inject it"), docs/audits/e2e-model-b-triage.md
 * ("does not inject GIT_COMMIT ... so GET /api/version returns 'dev'") and `.replit`, whose
 * `[deployment]` block sets no env at all — and the deployed container has no `.git` directory.
 * A file written at BUILD time, beside the server bundle, is the only source that survives both.
 *
 * RUNS AFTER `tsx script/build.ts`, never before: that script `rm -rf dist` as its first act, and
 * it is also what produces `dist/public/index.html`, which is where the client bundle hash is read
 * from.
 *
 * §13 — NOTHING IS INVENTED. Every lookup is wrapped: with no git available the file is still
 * written, with nulls, so the runtime can say "unknown" rather than inherit a stale value from an
 * older build that happened to leave a file behind. Same for the bundle hash: no index.html, or an
 * index.html naming no hashed chunk, means the key is OMITTED, never guessed.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const DIST = path.join(REPO_ROOT, "dist");
const OUT = path.join(DIST, "build-info.json");

function git(args) {
  try {
    const out = execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const value = String(out).trim();
    return value || null;
  } catch {
    return null;
  }
}

/** Full 40-char sha only — the deploy-freshness check in e2e-tests.yml compares against
 *  `$GITHUB_SHA`, which is full-length, so a short sha there can never match. */
function commitSha() {
  const sha = git(["rev-parse", "HEAD"]);
  return sha && /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null;
}

/** The COMMIT time (`%cI`), not `new Date()`: two builds of the same commit then agree. */
function commitTime() {
  const iso = git(["show", "-s", "--format=%cI", "HEAD"]);
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** The Vite entry chunk hash from dist/public/index.html — omitted when nothing names one. */
function bundleHash() {
  try {
    const indexHtml = path.join(DIST, "public", "index.html");
    if (!fs.existsSync(indexHtml)) return null;
    const html = fs.readFileSync(indexHtml, "utf-8");
    const match = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function main() {
  const commit = commitSha();
  const bundle = bundleHash();
  const info = {
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    builtAt: commitTime(),
    ...(bundle ? { bundle } : {}),
  };
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(info, null, 2) + "\n", "utf-8");
  console.log(
    `[write-build-info] ${path.relative(REPO_ROOT, OUT)} -> commit ${info.commitShort ?? "unknown"}` +
      ` built ${info.builtAt ?? "unknown"}${bundle ? ` bundle ${bundle}` : " (no bundle hash)"}`,
  );
}

main();
