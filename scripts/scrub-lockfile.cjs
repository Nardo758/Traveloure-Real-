#!/usr/bin/env node
/**
 * Scrub Replit package-firewall proxy URLs out of package-lock.json.
 *
 * WHY: npm install inside the Replit workspace resolves through Replit's
 * internal npm proxy and bakes `http://package-firewall.replit.local/npm/...`
 * into every `resolved` URL. Those hosts are unreachable from GitHub runners,
 * so `npm ci` crashes and every CI gate cascades red (this kept main
 * un-mergeable-to-green from ~Jul 7 until the #133 scrub).
 *
 * The main recurrence engine is `.replit [postMerge]` → scripts/post-merge.sh
 * → `npm install`, which re-pollutes the lockfile after every merge pulled
 * into the workspace. This script runs (a) at the end of post-merge.sh and
 * (b) from the pre-commit hook (.githooks/pre-commit) as a second line of
 * defense for manual installs. The CI `lockfile-purity` gate stays as the
 * final backstop.
 *
 * URL-ONLY by construction: rewrites the host+path prefix of `resolved` URLs
 * matching *.replit.local (any scheme, any subdomain, with or without an
 * /npm/ path prefix) to the public registry. Never touches `version` or
 * `integrity` (integrity hashes are content-based and registry-independent).
 *
 * Exit codes: 0 = clean or scrubbed; 1 = lockfile missing/unreadable.
 */
const fs = require("fs");
const path = require("path");

const lockfilePath = path.join(__dirname, "..", "package-lock.json");

let raw;
try {
  raw = fs.readFileSync(lockfilePath, "utf8");
} catch (err) {
  console.error(`[scrub-lockfile] cannot read ${lockfilePath}: ${err.message}`);
  process.exit(1);
}

// Any scheme, any *.replit.local host, optional port, optional /npm prefix —
// only inside a "resolved" value, so package names/URLs elsewhere are safe.
const pattern = /("resolved":\s*")https?:\/\/[a-z0-9.-]*replit\.local(?::\d+)?(?:\/npm)?\//g;

const matches = raw.match(pattern);
if (!matches) {
  console.log("[scrub-lockfile] clean — no replit.local URLs found.");
  process.exit(0);
}

const scrubbed = raw.replace(pattern, "$1https://registry.npmjs.org/");
fs.writeFileSync(lockfilePath, scrubbed);
console.log(
  `[scrub-lockfile] rewrote ${matches.length} replit.local resolved URL(s) → https://registry.npmjs.org/`,
);
