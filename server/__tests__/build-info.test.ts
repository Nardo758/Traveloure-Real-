/**
 * BUILD IDENTITY — the resolver behind `GET /api/version` and `GET /api/health`.
 * Ledger `2026-09-05-build-id-and-map-fallback`.
 *
 * WHY THIS EXISTS. Post-publish QA could not tell which commit a deploy was running for three
 * checks in a row and fell back to diffing Vite bundle hashes by hand. The failure mode a build-id
 * has is not a crash — it is a PLAUSIBLE WRONG ANSWER: a stale env var, a leftover build-info.json
 * from an older build, a short sha compared against a full one. Every one of those renders as a
 * perfectly normal-looking version endpoint, and a deploy check then believes it.
 *
 * WHAT THIS HOLDS:
 *   B1  the ordered sources — env → file → embedded → git — first hit wins.
 *   B2  §13: when every source misses, `commit` is NULL and `source` is "unknown". Never "dev",
 *       never the epoch, never a partial sha padded out.
 *   B3  a source that answers with NO commit is a MISS, not a win — the chain keeps going rather
 *       than pinning its name onto a null answer.
 *   B4  a throwing source is a miss, not a boot crash (this runs before listen()).
 *   B5  the file parser refuses junk: unparseable JSON, a non-object, a missing/short/non-hex
 *       commit. A hand-edited or truncated build-info.json must not publish a fake identity.
 *   B6  `commitShort` is DERIVED from `commit` and is never read independently — a file claiming
 *       a commitShort that disagrees with its own commit cannot publish the disagreement.
 *   B7  the env names are names this repo already uses; no invented Replit variable. (Evidence
 *       that Replit Autoscale injects NONE of them: docs/STAGING.md and
 *       docs/audits/e2e-model-b-triage.md — which is why the FILE source exists at all.)
 *   B8  the .git reader resolves HEAD directly, through a loose ref, and through packed-refs,
 *       and refuses a ref it cannot resolve rather than returning a partial value.
 *   B9  the boot line states "unknown" for an unknown build.
 *   S1  the shipped wiring: both endpoints call the ONE resolver, `/api/health` carries `build`
 *       on the failure branch too, and the build script writes the file after the bundle.
 *
 * Pure unit test: no DB, no server, no network. CI-safe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const {
  resolveBuildInfoFrom,
  parseBuildInfoFile,
  resolveGitHeadSha,
  resolveGitDir,
  formatBuildBootLine,
  UNKNOWN_BUILD_INFO,
  BUILD_SHA_ENV_NAMES,
} = await import("../services/build-info");

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf-8");

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

const info = (commit: string, source: any) => ({
  commit,
  commitShort: commit.slice(0, 7),
  builtAt: null,
  source,
});

test("B1 the first source that names a commit wins; later ones are not consulted", () => {
  let laterCalled = false;
  const resolved = resolveBuildInfoFrom([
    () => info(SHA_A, "env"),
    () => {
      laterCalled = true;
      return info(SHA_B, "file");
    },
  ]);
  assert.equal(resolved.commit, SHA_A);
  assert.equal(resolved.source, "env");
  assert.equal(laterCalled, false, "a resolved build id must not keep probing");
});

test("B1b the order is env -> file -> embedded -> git", () => {
  const chain = (present: string[]) =>
    resolveBuildInfoFrom(
      (["env", "file", "embedded", "git"] as const).map((name) =>
        present.includes(name) ? () => info(SHA_A, name) : () => null,
      ),
    ).source;
  assert.equal(chain(["env", "file", "embedded", "git"]), "env");
  assert.equal(chain(["file", "embedded", "git"]), "file");
  assert.equal(chain(["embedded", "git"]), "embedded");
  assert.equal(chain(["git"]), "git");
});

test("B2 nothing resolves => commit null, source unknown — never fabricated", () => {
  const resolved = resolveBuildInfoFrom([() => null, () => null, () => null, () => null]);
  assert.equal(resolved.commit, null);
  assert.equal(resolved.commitShort, null);
  assert.equal(resolved.builtAt, null);
  assert.equal(resolved.source, "unknown");
  assert.equal(resolved.bundle, undefined, "no bundle key rather than an empty one");
  assert.deepEqual(resolved, { ...UNKNOWN_BUILD_INFO });
  // The three shapes §13 forbids, asserted by name so a "helpful" default cannot creep back.
  assert.notEqual(resolved.commit, "dev");
  assert.notEqual(resolved.commit, "unknown");
  assert.notEqual(resolved.builtAt, new Date(0).toISOString());
});

test("B2b the unknown answer is a fresh object — a caller cannot poison the shared constant", () => {
  const first = resolveBuildInfoFrom([() => null]);
  (first as any).commit = SHA_A;
  assert.equal(UNKNOWN_BUILD_INFO.commit, null);
  assert.equal(resolveBuildInfoFrom([() => null]).commit, null);
});

test("B3 a source that answers without a commit is a MISS, not a win", () => {
  const resolved = resolveBuildInfoFrom([
    () => ({ commit: null, commitShort: null, builtAt: "2026-09-05T00:00:00.000Z", source: "env" as const }),
    () => info(SHA_C, "file"),
  ]);
  assert.equal(resolved.commit, SHA_C, "a builtAt with no commit must not stop the chain");
  assert.equal(resolved.source, "file");
});

test("B4 a throwing source is a miss, never a boot crash", () => {
  const resolved = resolveBuildInfoFrom([
    () => {
      throw new Error("no filesystem here");
    },
    () => info(SHA_B, "embedded"),
  ]);
  assert.equal(resolved.commit, SHA_B);
  // And a chain of nothing but throwers still answers honestly.
  const allBad = resolveBuildInfoFrom([
    () => {
      throw new Error("x");
    },
  ]);
  assert.equal(allBad.source, "unknown");
});

test("B5 the file parser refuses anything that is not a real build identity", () => {
  for (const junk of [
    "",
    "not json",
    "null",
    "[]",
    '"a string"',
    "{}",
    '{"commit": null}',
    '{"commit": ""}',
    '{"commit": "zzzz"}',
    '{"commit": "abc"}',
    '{"commit": 12345}',
    '{"commit": "  "}',
  ]) {
    assert.equal(parseBuildInfoFile(junk), null, `must refuse ${JSON.stringify(junk)}`);
  }
});

test("B5b a valid file resolves, and an unparseable builtAt/bundle is OMITTED not invented", () => {
  const ok = parseBuildInfoFile(
    JSON.stringify({ commit: SHA_A, builtAt: "2026-09-05T10:00:00Z", bundle: "BRQeMJwg" }),
  )!;
  assert.equal(ok.commit, SHA_A);
  assert.equal(ok.builtAt, "2026-09-05T10:00:00.000Z");
  assert.equal(ok.bundle, "BRQeMJwg");
  assert.equal(ok.source, "file");

  const noExtras = parseBuildInfoFile(JSON.stringify({ commit: SHA_A, builtAt: "yesterday", bundle: "" }))!;
  assert.equal(noExtras.builtAt, null, "an unparseable timestamp is absent, not repaired");
  assert.equal("bundle" in noExtras, false, "an empty bundle is OMITTED, never an empty string");
});

test("B6 commitShort is derived from commit — a file cannot publish a disagreement", () => {
  const parsed = parseBuildInfoFile(JSON.stringify({ commit: SHA_A, commitShort: "deadbee" }))!;
  assert.equal(parsed.commitShort, SHA_A.slice(0, 7));
  assert.notEqual(parsed.commitShort, "deadbee");
});

test("B7 the env names are ones this repo already uses; none invented", () => {
  assert.deepEqual([...BUILD_SHA_ENV_NAMES], ["GIT_COMMIT", "GIT_SHA", "SOURCE_COMMIT", "SOURCE_VERSION"]);
  // GIT_COMMIT is the name ~20 CI workflows set for app-in-Actions gates.
  const workflow = read(".github/workflows/journey-suite.yml");
  assert.ok(workflow.includes("GIT_COMMIT:"), "GIT_COMMIT is a real name in this repo's CI");
});

test("B8 the .git reader resolves HEAD, a loose ref and packed-refs — and refuses the rest", () => {
  // Detached HEAD: the sha is right there.
  assert.equal(resolveGitHeadSha((p) => (p === "HEAD" ? `${SHA_A}\n` : null)), SHA_A);

  // Symbolic HEAD -> loose ref file.
  const loose: Record<string, string> = {
    HEAD: "ref: refs/heads/main\n",
    "refs/heads/main": `${SHA_B}\n`,
  };
  assert.equal(resolveGitHeadSha((p) => loose[p] ?? null), SHA_B);

  // Symbolic HEAD -> packed-refs (a freshly cloned checkout has no loose ref).
  const packed: Record<string, string> = {
    HEAD: "ref: refs/heads/main\n",
    "packed-refs": `# pack-refs with: peeled fully-peeled sorted\n${SHA_C} refs/heads/main\n^${SHA_A}\n`,
  };
  assert.equal(resolveGitHeadSha((p) => packed[p] ?? null), SHA_C);

  // Refusals — each returns null rather than a partial or guessed answer.
  assert.equal(resolveGitHeadSha(() => null), null, "no HEAD at all");
  assert.equal(resolveGitHeadSha((p) => (p === "HEAD" ? "ref: refs/heads/main\n" : null)), null, "unresolvable ref");
  assert.equal(resolveGitHeadSha((p) => (p === "HEAD" ? "abc123\n" : null)), null, "a short sha is not a commit id");
  assert.equal(
    resolveGitHeadSha((p) =>
      p === "HEAD"
        ? "ref: refs/heads/main\n"
        : p === "packed-refs"
          ? `${SHA_C} refs/heads/other\n`
          : null,
    ),
    null,
    "packed-refs naming a DIFFERENT branch resolves nothing",
  );
});

test("B8b .git is a directory in a clone and a FILE in a worktree — both resolve, nothing else", () => {
  // Normal clone.
  assert.equal(
    resolveGitDir("/repo", (p) => (p === "/repo/.git" ? "dir" : null), () => null),
    "/repo/.git",
  );
  // Worktree: `.git` is a file holding an absolute `gitdir:` pointer.
  assert.equal(
    resolveGitDir(
      "/repo/wt",
      (p) => (p === "/repo/wt/.git" ? "file" : null),
      () => "gitdir: /repo/.git/worktrees/wt\n",
    ),
    "/repo/.git/worktrees/wt",
  );
  // A RELATIVE pointer resolves against the checkout, not the process cwd.
  assert.equal(
    resolveGitDir("/repo/wt", () => "file", () => "gitdir: ../.git/worktrees/wt"),
    "/repo/.git/worktrees/wt",
  );
  // Refusals: no .git, and a .git file that says something else.
  assert.equal(resolveGitDir("/repo", () => null, () => null), null);
  assert.equal(resolveGitDir("/repo", () => "file", () => "something else entirely"), null);
  assert.equal(resolveGitDir("/repo", () => "file", () => null), null);
});

test("B9 the boot line names the build, and says unknown when it cannot", () => {
  assert.equal(
    formatBuildBootLine({ commit: SHA_A, commitShort: "aaaaaaa", builtAt: "2026-09-05T10:00:00.000Z", source: "file" }),
    "[build] commit aaaaaaa built 2026-09-05T10:00:00.000Z (source: file)",
  );
  const unknown = formatBuildBootLine({ ...UNKNOWN_BUILD_INFO });
  assert.equal(unknown, "[build] commit unknown built unknown (source: unknown)");
  assert.ok(unknown.startsWith("[build] "), "one grep-able prefix beside [Migrations]");
});

test("S1 the shipped wiring: ONE resolver, both endpoints, build id on the 503 branch too", () => {
  const index = read("server/index.ts");
  const content = read("server/routes/content.routes.ts");

  // /api/version serves the resolver, not its own chain.
  assert.ok(index.includes('app.get("/api/version"'), "/api/version still registered");
  assert.ok(index.includes("getBuildInfo()"), "/api/version reads the shared resolver");
  assert.ok(
    !/declare const __GIT_SHA__/.test(index),
    "the embedded-sha read moved into build-info.ts — no second resolver in index.ts",
  );

  // The legacy `sha` key survives: e2e-tests.yml and public-smoke.spec.ts both parse it.
  assert.ok(index.includes('sha: info.commit ?? "dev"'), "legacy sha key preserved for its two consumers");
  assert.ok(
    read(".github/workflows/e2e-tests.yml").includes("/api/version"),
    "the deploy-freshness check still reads /api/version",
  );

  // /api/health carries the SAME object, on success AND on both failure branches.
  const healthBlock = content.slice(content.indexOf('router.get("/api/health"'));
  const health = healthBlock.slice(0, healthBlock.indexOf('router.get("/api/status"'));
  assert.ok(health.includes("const build = getBuildInfo();"), "health resolves once per request");
  assert.equal(
    (health.match(/timestamp: new Date\(\)\.toISOString\(\), build/g) ?? []).length,
    3,
    "build id on the ok branch AND both 503 branches — 'which build is failing' is the question",
  );

  // The build step writes the file AFTER the bundle (script/build.ts rm -rf's dist first).
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.build, "tsx script/build.ts && node scripts/write-build-info.cjs");
  const writer = read("scripts/write-build-info.cjs");
  assert.ok(writer.includes("rev-parse"), "the writer asks git for the sha");
  assert.ok(writer.includes("build-info.json"), "the writer names the file the resolver looks for");
  // FULL sha on both build-time rails — a short one can never match $GITHUB_SHA.
  assert.ok(!read("script/build.ts").includes("rev-parse --short"), "the embedded sha is full-length");
});
