"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  approvalIdsInBody,
  checkPullRequest,
  discoverLayout,
  evaluate,
  isCountedComment,
  migrationIdsFromChanges,
} = require("./check-migration-approval.cjs");

const layout = {
  migrationsDirs: ["server/migrations", "migrations"],
  registries: ["server/migrations/migration-files.ts"],
};

function sql(name, extra = {}) {
  return { filename: `server/migrations/${name}`, status: extra.status || "modified", ...extra };
}

function leon(body, extra = {}) {
  return { login: "Nardo758", type: extra.type || "User", body };
}

test("no migration: a pull request that does not touch a numbered migration passes", () => {
  const found = migrationIdsFromChanges(
    [
      { filename: "server/routes.ts", status: "modified" },
      { filename: "docs/MIGRATIONS.md", status: "modified" },
      { filename: "server/migrations/run-migrations.ts", status: "modified" },
    ],
    layout,
  );
  assert.deepEqual(found.ids, []);
  const result = evaluate({ migrationIds: found.ids, comments: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.match(result.message, /Approval is not required/);
});

test("approved: Nardo758's em dash citation covers the changed migration", () => {
  const found = migrationIdsFromChanges([sql("400_kyoto_feed_cleanup.sql", { status: "added" })], layout);
  assert.deepEqual(found.ids, ["400"]);
  const result = evaluate({
    migrationIds: found.ids,
    comments: [leon("Migration 400 SQL approved \u2014 Leon")],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("missing: a changed migration with no approval comment fails and names the number", () => {
  const result = evaluate({
    migrationIds: ["401"],
    comments: [leon("Looks good to merge.")],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["401"]);
  assert.match(result.message, /Migration 401 SQL approved \u2014 Leon/);
  assert.match(result.message, /Merging the pull request is not approval/);
});

test("wrong author: the exact sentence from anyone else does not count", () => {
  const result = evaluate({
    migrationIds: ["400"],
    comments: [{ login: "octocat", type: "User", body: "Migration 400 SQL approved \u2014 Leon" }],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["400"]);
  assert.equal(isCountedComment({ login: "octocat", type: "User", body: "Migration 400 SQL approved \u2014 Leon" }), false);
});

test("wrong number: approval of a different migration leaves the changed one missing", () => {
  const result = evaluate({
    migrationIds: ["400"],
    comments: [leon("Migration 401 SQL approved \u2014 Leon")],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["400"]);
});

test("multiple migrations: each number needs its own citation, and one comment may carry both", () => {
  const partial = evaluate({
    migrationIds: ["400", "402", "401"],
    comments: [leon("Migration 400 SQL approved \u2014 Leon\nMigration 402 SQL approved \u2014 Leon")],
  });
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.missing, ["401"]);
  assert.deepEqual(partial.approved, ["400", "402"]);

  const full = evaluate({
    migrationIds: ["402", "400"],
    comments: [leon("Migration 400 SQL approved \u2014 Leon\nMigration 402 SQL approved \u2014 Leon")],
  });
  assert.equal(full.ok, true);
  assert.deepEqual(full.missing, []);
});

test("hyphen variant: a plain hyphen stands in for the em dash", () => {
  const result = evaluate({
    migrationIds: ["400"],
    comments: [leon("Migration 400 SQL approved - Leon")],
  });
  assert.equal(result.ok, true);
  assert.deepEqual([...approvalIdsInBody("Migration 400 SQL approved - Leon")], ["400"]);
});

test("bots never count, including a Nardo758-named bot and a body that starts with [bot:", () => {
  const phrase = "Migration 400 SQL approved \u2014 Leon";
  assert.equal(isCountedComment({ login: "Nardo758", type: "Bot", body: phrase }), false);
  assert.equal(isCountedComment({ login: "dependabot[bot]", type: "Bot", body: phrase }), false);
  assert.equal(isCountedComment({ login: "Nardo758", type: "User", body: `[bot: Coding Bot]\n${phrase}` }), false);
  const result = evaluate({
    migrationIds: ["400"],
    comments: [
      { login: "Nardo758", type: "Bot", body: phrase },
      { login: "dependabot[bot]", type: "Bot", body: phrase },
      leon(`[bot: Coding Bot] ${phrase}`),
    ],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["400"]);
});

test("a letter suffix is its own number, and leading zeros are not", () => {
  const found = migrationIdsFromChanges(
    [sql("052_phase.sql"), sql("025b_ai_cost_tracking.sql")],
    layout,
  );
  assert.deepEqual(found.ids, ["25b", "52"]);
  const padded = evaluate({
    migrationIds: found.ids,
    comments: [leon("Migration 052 SQL approved \u2014 Leon\nMigration 025b SQL approved - Leon")],
  });
  assert.equal(padded.ok, true);
  const collapsed = evaluate({
    migrationIds: ["25b"],
    comments: [leon("Migration 25 SQL approved \u2014 Leon")],
  });
  assert.equal(collapsed.ok, false);
});

test("an en dash, a paraphrase, and a review with no sentence do not approve", () => {
  const en = evaluate({
    migrationIds: ["400"],
    comments: [leon("Migration 400 SQL approved \u2013 Leon")],
  });
  assert.equal(en.ok, false);
  const paraphrase = evaluate({
    migrationIds: ["369"],
    comments: [leon("Migration 369 SQL approved by Leon")],
  });
  assert.equal(paraphrase.ok, false);
});

test("registry lines added or removed contribute numbers; a context line does not", () => {
  const patch = [
    "@@",
    '   "399_imagine_noh_run_withdrawn.sql",',
    '-  "400_kyoto_feed_cleanup.sql",',
    '+  "401_fever_address_geocodes.sql",',
  ].join("\n");
  const found = migrationIdsFromChanges(
    [{ filename: "server/migrations/migration-files.ts", status: "modified", patch }],
    layout,
  );
  assert.deepEqual(found.ids, ["400", "401"]);
  assert.deepEqual(found.problems, []);
});

test("a missing registry diff fails closed", () => {
  const found = migrationIdsFromChanges(
    [{ filename: "server/migrations/migration-files.ts", status: "modified", patch: null }],
    layout,
  );
  assert.equal(found.problems.length, 1);
});

test("a renamed migration requires both numbers, and an unnumbered sql file is reported only", () => {
  const found = migrationIdsFromChanges(
    [
      {
        filename: "server/migrations/402_next.sql",
        previous_filename: "server/migrations/401_old.sql",
        status: "renamed",
      },
      { filename: "server/migrations/scheduled_drop_deprecated_city_queues.sql", status: "modified" },
    ],
    layout,
  );
  assert.deepEqual(found.ids, ["401", "402"]);
  assert.deepEqual(found.unnumbered, ["server/migrations/scheduled_drop_deprecated_city_queues.sql"]);
});

test("discoverLayout finds this repo's migrations directory and registry", () => {
  const layoutFound = discoverLayout(path.resolve(__dirname, ".."));
  assert.ok(layoutFound.migrationsDirs.includes("server/migrations"));
  assert.ok(layoutFound.migrationsDirs.includes("migrations"));
  assert.ok(layoutFound.registries.includes("server/migrations/migration-files.ts"));
});

test("discoverLayout reads a tree that is not this repo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mig-approval-"));
  fs.mkdirSync(path.join(root, "db", "migrations"), { recursive: true });
  fs.writeFileSync(path.join(root, "db", "migrations", "007_thing.sql"), "select 1;\n");
  fs.writeFileSync(path.join(root, "db", "migrations", "migration-files.ts"), "export const MIGRATION_FILES = [];\n");
  const found = discoverLayout(root);
  assert.deepEqual(found.migrationsDirs, ["db/migrations"]);
  assert.deepEqual(found.registries, ["db/migrations/migration-files.ts"]);
  const ids = migrationIdsFromChanges(
    [{ filename: "db/migrations/007_thing.sql", status: "added" }],
    found,
  );
  assert.deepEqual(ids.ids, ["7"]);
});

test("no migration passes right away, without reading comments", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/pulls/7") && !url.includes("/pulls/7/")) {
      return jsonResponse({ state: "open", head: { sha: "abc" } });
    }
    if (url.includes("/pulls/7/files")) {
      return jsonResponse([{ filename: "README", status: "modified" }]);
    }
    return jsonResponse([]);
  };
  const result = await checkPullRequest({
    repo: "Nardo758/Traveloure-Real-",
    pr: "7",
    token: "test-token",
    root: path.resolve(__dirname, ".."),
    eventName: "pull_request",
    fetchImpl,
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.message, /Approval is not required/);
  assert.equal(calls.some((u) => u.includes("/comments") || u.includes("/reviews")), false);
});

test("a comment-only migration diff needs no approval, and a sentence in the file is not one", () => {
  const patch = [
    "@@ -1,2 +1,2 @@",
    " -- header",
    "--- HELD FOR LEON'S COMMENT on the PR before merge.",
    "+-- Adds nullable users.is_test. Merged in #1581.",
    "+-- Migration 397 SQL approved \u2014 Leon",
  ].join("\n");
  const found = migrationIdsFromChanges([sql("397_users_is_test.sql", { patch })], layout);
  assert.deepEqual(found.ids, []);
  assert.deepEqual(found.commentOnly, ["397"]);
  const result = evaluate({ migrationIds: found.ids, comments: [] });
  assert.equal(result.ok, true);
  assert.match(result.message, /Approval is not required/);
});

test("a SQL line in the migration diff still needs approval", () => {
  const patch = [
    "@@ -8,3 +8,3 @@",
    " -- note",
    "-ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test boolean;",
    "+ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL;",
  ].join("\n");
  const found = migrationIdsFromChanges([sql("397_users_is_test.sql", { patch })], layout);
  assert.deepEqual(found.ids, ["397"]);
  assert.deepEqual(found.commentOnly, []);
  const result = evaluate({ migrationIds: found.ids, comments: [] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["397"]);
});

test("a missing migration diff and a block comment still need approval", () => {
  const missing = migrationIdsFromChanges([sql("397_users_is_test.sql", { patch: null })], layout);
  assert.deepEqual(missing.ids, ["397"]);
  const block = migrationIdsFromChanges(
    [sql("398_sh1_seed_copy.sql", { patch: ["@@", "-/* old */", "+/* new */"].join("\n") })],
    layout,
  );
  assert.deepEqual(block.ids, ["398"]);
  const empty = migrationIdsFromChanges([sql("398_sh1_seed_copy.sql", { patch: "" })], layout);
  assert.deepEqual(empty.ids, ["398"]);
  const plusplus = migrationIdsFromChanges(
    [sql("397_users_is_test.sql", { patch: "@@\n+++ UPDATE users SET is_test = true;" })],
    layout,
  );
  assert.deepEqual(plusplus.ids, ["397"], "a line that starts with ++ is SQL, not a diff header");
});

test("renaming a migration still needs both numbers when the diff is comments", () => {
  const found = migrationIdsFromChanges(
    [
      {
        filename: "server/migrations/398_sh1_seed_copy.sql",
        previous_filename: "server/migrations/397_users_is_test.sql",
        status: "renamed",
        patch: ["@@ -1 +1 @@", "--- old note", "+-- new note"].join("\n"),
      },
    ],
    layout,
  );
  assert.deepEqual(found.ids, ["397", "398"]);
  assert.deepEqual(found.commentOnly, []);
});

test("a registry comment edit does not add a migration number", () => {
  const patch = [
    "@@",
    "-  // HELD for Leon's comment. Ledger 2026-10-19-sh1-test-flag.",
    "+  // Merged in #1581. Ledger 2026-10-19-sh1-test-flag.",
    '   "397_users_is_test.sql",',
  ].join("\n");
  const found = migrationIdsFromChanges(
    [{ filename: "server/migrations/migration-files.ts", status: "modified", patch }],
    layout,
  );
  assert.deepEqual(found.ids, []);
  assert.deepEqual(found.commentOnly, []);
  assert.deepEqual(found.problems, []);
});

test("migrations 397 and 398 cite the merge and carry no approval sentence", () => {
  const root = path.resolve(__dirname, "..");
  const read = (name) => fs.readFileSync(path.join(root, "server/migrations", name), "utf8");
  const flag = read("397_users_is_test.sql");
  const copy = read("398_sh1_seed_copy.sql");
  const approval = /SQL approved (?:\u2014|-) Leon/;
  for (const sqlText of [flag, copy]) {
    assert.doesNotMatch(sqlText, /HELD FOR LEON/i);
    assert.doesNotMatch(sqlText, approval);
  }
  assert.match(flag, /Adds nullable users\.is_test with no default\. Merged in #1581\./);
  assert.match(copy, /Merged in #1582\./);
  assert.match(flag, /ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test boolean;/);
  const statements = copy
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();
  assert.match(statements, /^UPDATE users SET bio/);
  assert.doesNotMatch(statements, /HELD|Merged in #/);
});

test("a closed pull request does not fail an issue_comment run", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/pulls/9") && !url.includes("/files")) {
      return jsonResponse({ state: "closed", head: { sha: "abc" } });
    }
    throw new Error(`unexpected ${url}`);
  };
  const result = await checkPullRequest({
    repo: "Nardo758/Traveloure-Real-",
    pr: "9",
    token: "test-token",
    root: path.resolve(__dirname, ".."),
    eventName: "issue_comment",
    fetchImpl,
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.message, /closed/);
});

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(data);
    },
    async json() {
      return data;
    },
  };
}
