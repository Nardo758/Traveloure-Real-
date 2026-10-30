#!/usr/bin/env node
/**
 * Migration-approval check (H-32, ledger `2026-10-21-migration-approval-check`).
 *
 * A pull request that adds or changes a numbered database migration must carry
 * a comment from GitHub user Nardo758 (Leon) whose body contains, for each
 * migration number, the one citation form (H-29):
 *
 *   Migration <NNN> SQL approved — Leon
 *
 * The em dash (U+2014) is the form. A plain ASCII hyphen is the accepted
 * variant. Merging the pull request is not approval. A comment from anyone
 * else, a bot (`user.type === "Bot"` or a login ending in `[bot]`), or a body
 * that starts with `[bot:` does not count.
 *
 * Numbered migration files are `*.sql` children of a discovered migrations
 * directory (a directory named `migrations` that holds numbered SQL, and the
 * directory of `migration-files.ts`) plus the conventional
 * `.../migrations/<NNN>_*.sql` path. A changed `migration-files.ts` contributes
 * the numbers on added or removed registry lines. Leading zeros are not part
 * of the number (`052` and `52` are the same). A letter suffix is (`025b` is
 * not `25`).
 *
 * A diff that only adds or removes blank lines and `--` line comments does not
 * change SQL, so it does not need the sentence (fix-queue row 133). The check
 * reads the pull request file diff to tell those lines apart. A sentence written
 * in the SQL file is not approval. A missing diff fails closed and still needs
 * the sentence. Renaming the file still needs both numbers.
 *
 * NEGATIVE SPACE: this does not execute SQL, does not judge the SQL, and does
 * not read the pull request body, review state, or commit messages. An
 * unnumbered `.sql` file in a migrations directory is reported and not gated.
 * A nested path under a migrations directory is not a numbered migration. An
 * `issue_comment` run reports in Actions; the token is read-only, so that run
 * does not overwrite the pull_request status check on the head SHA. Re-run the
 * pull_request job after the comment. A closed pull request is not gated by an
 * `issue_comment` run.
 *
 * Node built-ins only. Unit tests: `node --test scripts/check-migration-approval.test.cjs`
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const APPROVER_LOGIN = "Nardo758";
const EM_DASH = "\u2014";
const CITATION = (id) => `Migration ${id} SQL approved ${EM_DASH} Leon`;
const SQL_BASENAME_RE = /^(\d+[a-z]*)_.+\.sql$/;
const CONVENTIONAL_SQL_RE = /^(?:.*\/)?migrations\/(\d+[a-z]*)_[^/]+\.sql$/;
const APPROVAL_RE = /(?<![A-Za-z0-9])Migration (\d+[a-z]*) SQL approved (?:\u2014|-) Leon(?![A-Za-z0-9])/g;
const REGISTRY_ENTRY_RE = /"(\d+[a-z]*)_[^"]+\.sql"/g;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "attached_assets",
  "artifacts",
  "playwright-report",
  "test-results",
]);

function normalizeMigrationId(raw) {
  const m = /^0*(\d+[a-z]*)$/.exec(String(raw));
  return m ? m[1] : String(raw);
}

function compareIds(a, b) {
  const pa = /^(\d+)([a-z]*)$/.exec(a) || [null, "0", a];
  const pb = /^(\d+)([a-z]*)$/.exec(b) || [null, "0", b];
  const na = Number(pa[1]);
  const nb = Number(pb[1]);
  if (na !== nb) return na - nb;
  return pa[2].localeCompare(pb[2]);
}

function approvalIdsInBody(body) {
  const ids = new Set();
  if (typeof body !== "string" || body.trimStart().toLowerCase().startsWith("[bot:")) return ids;
  APPROVAL_RE.lastIndex = 0;
  let m;
  while ((m = APPROVAL_RE.exec(body)) !== null) ids.add(normalizeMigrationId(m[1]));
  return ids;
}

/** True only for a non-bot comment authored by Nardo758 whose body is not a bot relay. */
function isCountedComment(comment) {
  const login = comment?.login || comment?.user?.login || "";
  const type = comment?.type || comment?.user?.type || "";
  const body = typeof comment?.body === "string" ? comment.body : "";
  if (!body) return false;
  if (type === "Bot") return false;
  if (/\[bot\]$/i.test(login)) return false;
  if (body.trimStart().toLowerCase().startsWith("[bot:")) return false;
  return login === APPROVER_LOGIN;
}

function idsFromRegistryPatch(patch) {
  const ids = [];
  if (typeof patch !== "string") return ids;
  for (const line of patch.split("\n")) {
    if (!/^[+-]/.test(line) || line.startsWith("+++") || line.startsWith("---")) continue;
    REGISTRY_ENTRY_RE.lastIndex = 0;
    let m;
    const body = line.slice(1);
    while ((m = REGISTRY_ENTRY_RE.exec(body)) !== null) ids.push(normalizeMigrationId(m[1]));
  }
  return ids;
}

/**
 * Locate migrations directories and the migration-files registry from the tree.
 * A `migrations` directory counts when it directly contains a numbered SQL file.
 * The registry's own directory counts even when the folder has another name.
 */
function discoverLayout(root) {
  const registries = [];
  const migrationsDirs = [];
  function walk(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const numbered = entries.some((e) => e.isFile() && SQL_BASENAME_RE.test(e.name));
    if (rel && path.basename(dir) === "migrations" && numbered) migrationsDirs.push(rel);
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), childRel);
      else if (e.isFile() && e.name === "migration-files.ts") registries.push(childRel);
    }
  }
  walk(root, "");
  for (const reg of registries) {
    const dir = path.posix.dirname(reg);
    if (dir && dir !== "." && !migrationsDirs.includes(dir)) migrationsDirs.push(dir);
  }
  return { migrationsDirs, registries };
}

/**
 * True when every added or removed line is blank or a `--` line comment.
 * A missing or empty diff is not comment-only: the check then still requires
 * the approval sentence.
 */
function patchIsSqlCommentOnly(patch) {
  if (typeof patch !== "string" || patch.length === 0) return false;
  let changed = false;
  for (const rawLine of patch.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (
      line.startsWith("@@") ||
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("\\") ||
      /^(?:---|\+\+\+) (?:a\/|b\/|\/dev\/null)/.test(line)
    ) {
      continue;
    }
    if (!line.startsWith("+") && !line.startsWith("-")) continue;
    changed = true;
    const body = line.slice(1).trim();
    if (body !== "" && !body.startsWith("--")) return false;
  }
  return changed;
}

function sqlIdAt(posixPath, layout) {
  const base = path.posix.basename(posixPath);
  const dir = path.posix.dirname(posixPath);
  const named = SQL_BASENAME_RE.exec(base);
  if (!named) return null;
  if (layout.migrationsDirs.includes(dir)) return named[1];
  const conv = CONVENTIONAL_SQL_RE.exec(posixPath);
  return conv ? conv[1] : null;
}

function isRegistryPath(posixPath, layout) {
  if (path.posix.basename(posixPath) !== "migration-files.ts") return false;
  if (layout.registries.includes(posixPath)) return true;
  const dir = path.posix.dirname(posixPath);
  return layout.migrationsDirs.includes(dir) || /(?:^|\/)migrations$/.test(dir);
}

function unnumberedSql(posixPath, layout) {
  const base = path.posix.basename(posixPath);
  if (!base.endsWith(".sql") || SQL_BASENAME_RE.test(base)) return false;
  const dir = path.posix.dirname(posixPath);
  return layout.migrationsDirs.includes(dir) || /(?:^|\/)migrations$/.test(dir);
}

/**
 * @param {Array<{filename:string, previous_filename?:string, status?:string, patch?:string|null}>} files
 * @param {{migrationsDirs:string[], registries:string[]}} layout
 */
function migrationIdsFromChanges(files, layout) {
  const ids = new Set();
  const commentOnly = new Set();
  const problems = [];
  const unnumbered = [];
  for (const file of files) {
    const current = (file.filename || "").replace(/\\/g, "/");
    const previous = file.previous_filename ? file.previous_filename.replace(/\\/g, "/") : "";
    const paths = [current, previous].filter(Boolean);
    const renamed = Boolean(previous) && previous !== current;
    const commentOnlyPatch = !renamed && patchIsSqlCommentOnly(file.patch);
    for (const posixPath of paths) {
      const raw = sqlIdAt(posixPath, layout);
      if (raw) {
        const id = normalizeMigrationId(raw);
        if (commentOnlyPatch) commentOnly.add(id);
        else ids.add(id);
      }
      if (unnumberedSql(posixPath, layout) && !unnumbered.includes(posixPath)) unnumbered.push(posixPath);
    }
    if (!isRegistryPath(current, layout)) continue;
    if (file.patch == null) {
      problems.push(
        `No diff was returned for ${current}, so the migration numbers it adds or changes cannot be read. Refusing to pass.`,
      );
      continue;
    }
    for (const id of idsFromRegistryPatch(file.patch)) ids.add(id);
  }
  for (const id of ids) commentOnly.delete(id);
  return {
    ids: [...ids].sort(compareIds),
    problems,
    unnumbered,
    commentOnly: [...commentOnly].sort(compareIds),
  };
}

function evaluate({ migrationIds, comments }) {
  const needed = [...new Set(migrationIds)].sort(compareIds);
  if (needed.length === 0) {
    return {
      ok: true,
      missing: [],
      approved: [],
      message: "No numbered migration was added or changed. Approval is not required.",
    };
  }
  const approved = new Set();
  for (const comment of comments) {
    if (!isCountedComment(comment)) continue;
    for (const id of approvalIdsInBody(comment.body)) approved.add(id);
  }
  const missing = needed.filter((id) => !approved.has(id));
  const have = needed.filter((id) => approved.has(id));
  if (missing.length === 0) {
    return {
      ok: true,
      missing: [],
      approved: have,
      message: `Approved by ${APPROVER_LOGIN}: ${have.map(CITATION).join("; ")}.`,
    };
  }
  const lines = [
    "Migration approval is missing.",
    "",
    `These migrations were added or changed and have no pull request comment from GitHub user ${APPROVER_LOGIN} containing the approval sentence:`,
    "",
    ...missing.map((id) => `  - ${id} — comment must contain: ${CITATION(id)}`),
    "",
    `A plain hyphen is also accepted: Migration ${missing[0]} SQL approved - Leon`,
    "",
    `Only a comment authored by ${APPROVER_LOGIN} counts. A comment from a bot, a comment whose body starts with [bot:, and a comment from anyone else do not count. Merging the pull request is not approval.`,
    "After that comment is on the pull request, re-run this check. The comment starts a fresh run; the token is read-only, so re-running the pull_request job is what updates the status check on the head commit.",
  ];
  return { ok: false, missing, approved: have, message: lines.join("\n") };
}

function normalizeComment(raw) {
  const user = raw.user || raw.author || {};
  return {
    login: user.login || "",
    type: user.type || "",
    body: typeof raw.body === "string" ? raw.body : "",
  };
}

async function githubJson(url, token, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "traveloure-migration-approval",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`GitHub API ${res.status} for ${url}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchPaged(baseUrl, token, fetchImpl) {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}page=${page}`;
    const data = await githubJson(url, token, fetchImpl);
    if (!Array.isArray(data)) throw new Error(`Expected a list from ${url}`);
    out.push(...data);
    if (data.length < 100) return out;
  }
  throw new Error(`GitHub returned more than 3000 records for ${baseUrl}; refusing to guess which migrations changed.`);
}

async function checkPullRequest({ repo, pr, token, root, eventName, fetchImpl }) {
  const fetchFn = fetchImpl || fetch;
  const layout = discoverLayout(root);
  const meta = await githubJson(`https://api.github.com/repos/${repo}/pulls/${pr}`, token, fetchFn);
  if (eventName === "issue_comment" && meta.state !== "open") {
    return {
      exitCode: 0,
      message: `Pull request #${pr} is ${meta.state}. The approval check gates open pull requests.`,
      migrationIds: [],
    };
  }
  const files = await fetchPaged(
    `https://api.github.com/repos/${repo}/pulls/${pr}/files?per_page=100`,
    token,
    fetchFn,
  );
  const { ids, problems, unnumbered, commentOnly } = migrationIdsFromChanges(files, layout);
  const notes = [];
  notes.push(`migrations dirs: ${layout.migrationsDirs.join(", ") || "(none)"}`);
  notes.push(`registries: ${layout.registries.join(", ") || "(none)"}`);
  notes.push(`head ${meta.head && meta.head.sha ? meta.head.sha : "(unknown)"}`);
  if (unnumbered.length) notes.push(`unnumbered SQL is not gated: ${unnumbered.join(", ")}`);
  if (commentOnly.length) notes.push(`comment-only SQL diffs are not gated: ${commentOnly.join(", ")}`);
  if (problems.length) {
    return { exitCode: 1, message: [...notes, ...problems].join("\n"), migrationIds: ids };
  }
  if (ids.length === 0) {
    const result = evaluate({ migrationIds: [], comments: [] });
    return { exitCode: 0, message: [...notes, result.message].join("\n"), migrationIds: [] };
  }
  const [issueComments, reviewComments, reviews] = await Promise.all([
    fetchPaged(`https://api.github.com/repos/${repo}/issues/${pr}/comments?per_page=100`, token, fetchFn),
    fetchPaged(`https://api.github.com/repos/${repo}/pulls/${pr}/comments?per_page=100`, token, fetchFn),
    fetchPaged(`https://api.github.com/repos/${repo}/pulls/${pr}/reviews?per_page=100`, token, fetchFn),
  ]);
  const comments = [...issueComments, ...reviewComments, ...reviews].map(normalizeComment);
  const result = evaluate({ migrationIds: ids, comments });
  return {
    exitCode: result.ok ? 0 : 1,
    message: [...notes, result.message].join("\n"),
    migrationIds: ids,
    missing: result.missing,
  };
}

async function main() {
  const token = process.env.GITHUB_TOKEN || "";
  const repo = process.env.GITHUB_REPOSITORY || "";
  const pr = process.env.PR_NUMBER || "";
  if (!token || !repo || !pr) {
    console.error("migration-approval: GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required.");
    process.exit(1);
  }
  try {
    const result = await checkPullRequest({
      repo,
      pr,
      token,
      root: process.cwd(),
      eventName: process.env.GITHUB_EVENT_NAME || "pull_request",
    });
    if (result.exitCode === 0) console.log(result.message);
    else console.error(result.message);
    process.exit(result.exitCode);
  } catch (err) {
    console.error(`migration-approval: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  APPROVER_LOGIN,
  CITATION,
  EM_DASH,
  approvalIdsInBody,
  checkPullRequest,
  compareIds,
  discoverLayout,
  evaluate,
  patchIsSqlCommentOnly,
  idsFromRegistryPatch,
  isCountedComment,
  migrationIdsFromChanges,
  normalizeMigrationId,
};

if (require.main === module) {
  if (process.argv.includes("--self-test")) {
    const { spawnSync } = require("node:child_process");
    const testFile = path.join(__dirname, "check-migration-approval.test.cjs");
    const run = spawnSync(process.execPath, ["--test", testFile], { stdio: "inherit" });
    process.exit(run.status == null ? 1 : run.status);
  }
  main();
}
