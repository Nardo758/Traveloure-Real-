#!/usr/bin/env node
/**
 * publish-preflight.cjs — a publish is only ever made from a clean checkout AT `origin/main`.
 *
 * Ledger `2026-09-06-publish-preflight`; CLAUDE.md "Branch and publish rule" and §20
 * ("Publish-time SQL is declined by default"). Node built-ins only — no npm ci, no DB, no
 * network beyond one `git fetch` — so it runs as a fast standalone CI job and as the FIRST
 * step of the production build.
 *
 * WHY THIS EXISTS
 * ───────────────
 * On 2026-09-06 the Replit Agent published production from the workspace checkout while that
 * checkout carried a local commit that was not on `main`. Branch protection did its job and
 * bounced the push — and that changed nothing, because a Replit Autoscale publish does not read
 * `origin`. It builds the WORKSPACE FILESYSTEM. So commit `96c39f5` was served to real users
 * while `origin/main` had never seen it: reviewed-on-main and running-in-production came apart,
 * silently, with every check green.
 *
 * CLAUDE.md already said the right thing — "a publish is only ever made from a workspace where
 * `main == origin/main`" — and it said it in PROSE. Prose is not a check. This is the check.
 *
 * THE RULE (all four must hold; any one failing exits 1)
 * ─────────────────────────────────────────────────────
 *   1. the current branch is `main`                  — not a lane branch, not a detached HEAD
 *   2. `git status --porcelain` is EMPTY             — no staged, modified OR untracked file
 *   3. `HEAD` == `origin/main`                       — nothing local ahead of, or behind, review
 *   4. `package-lock.json` holds ZERO `replit.local` — the lockfile-purity rule, at the last
 *                                                      moment it can still be caught
 *
 * It also PRINTS, on pass and on fail: both shas, and the last entry of the migration registry
 * (`server/migrations/migration-files.ts`). Those two lines exist to be COMPARED BY A HUMAN to
 * the deploy's own boot log — `"Migrations complete"` (with its applied count) and the
 * `[build] commit …` line — which is the only way to confirm that what booted is what this
 * checkout built. The script cannot make that comparison itself (see NEGATIVE SPACE).
 *
 * WHEN IT ENFORCES — and why it is a no-op everywhere else
 * ───────────────────────────────────────────────────────
 * Enforcing runs ONLY in strict mode. Strict mode is entered by `--strict` (which `.replit`'s
 * `[deployment] build` passes, via `npm run build:prod`) OR by a truthy `REPLIT_DEPLOYMENT`
 * environment variable.
 *
 *   • `--strict` is the PRIMARY gate and the one the deployment actually uses. It is a flag we
 *     control, in a file under review, so it cannot quietly stop being set by a platform change.
 *   • `REPLIT_DEPLOYMENT` is belt-and-braces for an operator who runs `npm run build` directly
 *     inside a deployment. It is NOT relied on alone: nothing else in this repo reads it, so this
 *     script has no evidence that Replit Autoscale sets it, and a guard resting on an unverified
 *     env var is a guard that may already be off. (§13 — say the limit rather than assume.)
 *   • Everywhere else — `npm run dev`, `npm run build` in CI, a local build — the script prints
 *     one line and exits 0 WITHOUT fetching. CI checks out a detached HEAD at a PR head, so every
 *     one of the four conditions is legitimately false there; enforcing would fail every PR.
 *
 * There is deliberately NO override flag. The way past a red preflight is to fix the checkout
 * (`git checkout main && git fetch origin && git reset --hard origin/main`), which is the
 * operator sequence `docs/RELEASE.md` step 0 spells out — not a switch that turns the rule off.
 *
 * A FAILED FETCH IS A WARNING, NOT A FAILURE
 * ──────────────────────────────────────────
 * The fetch is best-effort. If it fails (no network, no credentials in the build sandbox), the
 * comparison still runs against the LOCAL `refs/remotes/origin/main`, and the script says out
 * loud that the remote ref may be stale. That is honest about which way the residual risk points:
 * a stale ref makes a legitimately-current HEAD look WRONG (a false failure, which is safe), and
 * it can only produce a false PASS in the one case where the checkout is BEHIND an origin/main it
 * has not seen — i.e. publishing older reviewed code, not the unreviewed code this exists to stop.
 *
 * NEGATIVE SPACE — what this does NOT cover (§18d: green means green-within-stated-bounds)
 * ────────────────────────────────────────────────────────────────────────────────────────
 *   • It can see whether THIS CHECKOUT is publishable. It cannot see whether the DEPLOYED build
 *     came from this checkout. If the platform builds from a snapshot taken at some other moment,
 *     or serves a cached earlier build, this passes and says nothing. That gap is what the two
 *     printed lines are for, and closing it needs the boot log, not a script.
 *   • It says nothing about migrations beyond PRINTING the registry's last filename: not whether
 *     that migration is safe, idempotent, CHECK-bearing, or already applied on production. Those
 *     are `preflight-prod-constraints.cjs` and `preflight-prod-unique-indexes.cjs`, and they run
 *     against the production database, which this script never touches.
 *   • It cannot stop a publish. It fails the BUILD, which fails the publish — only for as long as
 *     `.replit`'s `[deployment] build` runs it. An operator who publishes through some other path,
 *     or edits that line, is outside it entirely.
 *   • `git status --porcelain` counts UNTRACKED files as dirty, deliberately: an untracked file
 *     can be read by the build (a stray source module, a `.env`) and would ship unreviewed. The
 *     cost is that stray build output fails the check; the fix is `.gitignore`, not a looser rule.
 *   • It checks `package-lock.json` for `replit.local` only. It is not the lockfile-purity gate
 *     (`scripts/scrub-lockfile.cjs` + the CI `lockfile-purity` job); it is that rule's last
 *     chance, at the one moment where the polluted lockfile would reach production.
 *   • Branch protection, review state, CI status on the commit: all invisible here. "HEAD ==
 *     origin/main" means the commit is on the reviewed branch, not that it was reviewed well.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const LOCKFILE = path.join(ROOT, "package-lock.json");
const MIGRATION_REGISTRY = path.join(ROOT, "server", "migrations", "migration-files.ts");

/** The polluted-registry marker the lockfile must never carry (CLAUDE.md "Lockfile purity"). */
const POLLUTION_MARKER = "replit.local";

// ── the predicate ─────────────────────────────────────────────────────────────────────────────
// Pure over an already-gathered snapshot, so the self-test can drive every branch with no git,
// no network and no filesystem. Returns { failures: string[], warnings: string[] }.

/**
 * @param {{
 *   branch: string|null,          // `git rev-parse --abbrev-ref HEAD`; "HEAD" when detached, null when unknown
 *   porcelain: string|null,       // `git status --porcelain`; null when the command failed
 *   headSha: string|null,         // `git rev-parse HEAD`
 *   originSha: string|null,       // `git rev-parse refs/remotes/origin/main`
 *   lockfile: string|null,        // package-lock.json text; null when unreadable
 *   fetchFailed: boolean,
 * }} snapshot
 */
function evaluate(snapshot) {
  const failures = [];
  const warnings = [];

  if (snapshot.fetchFailed) {
    warnings.push(
      "`git fetch origin main` FAILED — comparing against the LOCAL refs/remotes/origin/main, " +
        "which may be stale. A stale ref can only make a current HEAD look wrong (safe) or hide " +
        "that this checkout is BEHIND origin/main (older reviewed code). Confirm by hand.",
    );
  }

  // 1 — on `main`
  if (snapshot.branch === null) {
    failures.push("could not determine the current branch (is this a git checkout?)");
  } else if (snapshot.branch === "HEAD") {
    failures.push("HEAD is DETACHED — a publish is made from `main`, never from a detached HEAD");
  } else if (snapshot.branch !== "main") {
    failures.push(
      `current branch is \`${snapshot.branch}\`, not \`main\` — lane work is published by merging it, ` +
        "never by publishing the lane checkout",
    );
  }

  // 2 — clean tree
  if (snapshot.porcelain === null) {
    failures.push("could not read `git status --porcelain` — refusing to assume the tree is clean");
  } else if (snapshot.porcelain.trim() !== "") {
    const entries = snapshot.porcelain.trim().split("\n").filter(Boolean);
    const untracked = entries.filter((l) => l.startsWith("??")).length;
    const tracked = entries.length - untracked;
    failures.push(
      `working tree is DIRTY — ${tracked} tracked change(s), ${untracked} untracked file(s). ` +
        "Every one of them would ship unreviewed; untracked counts because the build can read it",
    );
  }

  // 3 — HEAD == origin/main
  if (snapshot.headSha === null) {
    failures.push("could not resolve HEAD to a commit");
  } else if (snapshot.originSha === null) {
    failures.push(
      "could not resolve `refs/remotes/origin/main` — with no remote ref there is nothing to " +
        "compare against, so this cannot pass",
    );
  } else if (snapshot.headSha !== snapshot.originSha) {
    failures.push(
      `HEAD (${short(snapshot.headSha)}) is NOT origin/main (${short(snapshot.originSha)}) — ` +
        "this checkout would publish code that is not on the reviewed branch. This is the " +
        "2026-09-06 incident exactly",
    );
  }

  // 4 — lockfile purity
  if (snapshot.lockfile === null) {
    failures.push("could not read package-lock.json — refusing to assume it is clean");
  } else {
    const hits = countOccurrences(snapshot.lockfile, POLLUTION_MARKER);
    if (hits > 0) {
      failures.push(
        `package-lock.json holds ${hits} \`${POLLUTION_MARKER}\` URL(s) — run ` +
          "`node scripts/scrub-lockfile.cjs`, commit, and land it on main before publishing",
      );
    }
  }

  return { failures, warnings };
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

function short(sha) {
  return typeof sha === "string" && sha.length >= 7 ? sha.slice(0, 7) : String(sha);
}

/**
 * The last filename in the MIGRATION_FILES registry, for the operator to compare against the
 * deploy's `"Migrations complete"` boot line. §13 — null when it cannot be read, never a guess.
 */
function lastMigrationEntry(registryText) {
  if (typeof registryText !== "string") return null;
  const start = registryText.indexOf("MIGRATION_FILES");
  if (start === -1) return null;
  const matches = registryText.slice(start).match(/"[^"\n]+\.sql"/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1].replace(/"/g, "");
}

// ── gathering (impure; never reached by the self-test) ─────────────────────────────────────────

function git(args) {
  try {
    return String(
      execFileSync("git", args, { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }),
    ).trim();
  } catch {
    return null;
  }
}

function readFileOrNull(file) {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

function gather() {
  // Quiet and best-effort — a failure here is a warning, not a verdict (see the header).
  let fetchFailed = false;
  try {
    execFileSync("git", ["fetch", "--quiet", "origin", "main"], {
      cwd: ROOT,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    fetchFailed = true;
  }

  const headSha = git(["rev-parse", "HEAD"]);
  // `git fetch origin main` updates the remote-tracking ref opportunistically; FETCH_HEAD is the
  // fallback for a git that did not, and for a checkout with no remote-tracking ref configured.
  const originSha = git(["rev-parse", "refs/remotes/origin/main"]) ?? git(["rev-parse", "FETCH_HEAD"]);

  return {
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    porcelain: git(["status", "--porcelain"]),
    headSha: /^[0-9a-f]{40}$/i.test(headSha ?? "") ? headSha.toLowerCase() : null,
    originSha: /^[0-9a-f]{40}$/i.test(originSha ?? "") ? originSha.toLowerCase() : null,
    lockfile: readFileOrNull(LOCKFILE),
    fetchFailed,
  };
}

// ── committed self-test fixtures (§18d: a predicate change ships with fixtures) ────────────────

function selfTest() {
  const CLEAN = {
    branch: "main",
    porcelain: "",
    headSha: "a".repeat(40),
    originSha: "a".repeat(40),
    lockfile: '{"name":"rest-express","lockfileVersion":3}',
    fetchFailed: false,
  };
  const fail = (over) => evaluate({ ...CLEAN, ...over }).failures;

  const cases = [
    ["a clean checkout on main at origin/main passes", () => fail({}).length === 0],
    [
      "THE INCIDENT: a local commit ahead of origin/main fails",
      () => fail({ headSha: "b".repeat(40) }).some((e) => e.includes("NOT origin/main")),
    ],
    [
      "a lane branch fails, and names the branch",
      () => fail({ branch: "task-publish-preflight" }).some((e) => e.includes("task-publish-preflight")),
    ],
    [
      "a detached HEAD fails (CI's shape — which is why CI never runs strict)",
      () => fail({ branch: "HEAD" }).some((e) => e.includes("DETACHED")),
    ],
    [
      "a tracked modification fails",
      () => fail({ porcelain: " M server/index.ts\n" }).some((e) => e.includes("DIRTY")),
    ],
    [
      "an UNTRACKED file fails too — the build can read it",
      () => fail({ porcelain: "?? server/secret-patch.ts\n" }).some((e) => e.includes("1 untracked")),
    ],
    [
      "the dirty message separates tracked from untracked",
      () =>
        fail({ porcelain: " M a.ts\n?? b.ts\n?? c.ts\n" }).some(
          (e) => e.includes("1 tracked") && e.includes("2 untracked"),
        ),
    ],
    [
      "a polluted lockfile fails, with the count",
      () =>
        fail({ lockfile: 'x package-firewall.replit.local y replit.local z' }).some((e) =>
          e.includes("holds 2 `replit.local`"),
        ),
    ],
    [
      "an unreadable lockfile fails rather than being assumed clean",
      () => fail({ lockfile: null }).some((e) => e.includes("refusing to assume it is clean")),
    ],
    [
      "an unreadable status fails rather than being assumed clean",
      () => fail({ porcelain: null }).some((e) => e.includes("refusing to assume the tree is clean")),
    ],
    [
      "a missing origin/main ref fails — there is nothing to compare against",
      () => fail({ originSha: null }).some((e) => e.includes("refs/remotes/origin/main")),
    ],
    [
      "a missing HEAD fails",
      () => fail({ headSha: null }).some((e) => e.includes("could not resolve HEAD")),
    ],
    [
      "an unknown branch fails rather than passing over a non-checkout",
      () => fail({ branch: null }).some((e) => e.includes("current branch")),
    ],
    [
      "a failed fetch is a WARNING, not a failure — the comparison still runs",
      () => {
        const r = evaluate({ ...CLEAN, fetchFailed: true });
        return r.failures.length === 0 && r.warnings.some((w) => w.includes("may be stale"));
      },
    ],
    [
      "a failed fetch does NOT rescue a mismatched HEAD",
      () =>
        evaluate({ ...CLEAN, fetchFailed: true, headSha: "b".repeat(40) }).failures.some((e) =>
          e.includes("NOT origin/main"),
        ),
    ],
    [
      "every condition can fail at once, and all four are reported",
      () =>
        fail({
          branch: "fix/hotfix",
          porcelain: " M x.ts\n",
          headSha: "c".repeat(40),
          lockfile: "replit.local",
        }).length === 4,
    ],
    [
      "the migration registry's LAST entry is read, not its first",
      () =>
        lastMigrationEntry(
          'export const MIGRATION_FILES = [\n "001_a.sql",\n // "999_commented.sql" is prose\n "288_z.sql",\n] as const;',
        ) === "288_z.sql",
    ],
    [
      "a registry that names no migration reports nothing rather than guessing (§13)",
      () => lastMigrationEntry("export const MIGRATION_FILES = [] as const;") === null,
    ],
    ["an unreadable registry reports null, never a placeholder", () => lastMigrationEntry(null) === null],
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try {
      ok = fn() === true;
    } catch {
      ok = false;
    }
    console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(
      `\npublish-preflight SELF-TEST FAILED — ${failed} fixture case(s). The predicate is wrong; ` +
        "fix it before trusting a green run.",
    );
    process.exit(1);
  }
  console.log(`\npublish-preflight self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

// ── entry point ───────────────────────────────────────────────────────────────────────────────

function isStrict(argv, env) {
  if (argv.includes("--strict")) return true;
  const flag = env.REPLIT_DEPLOYMENT;
  return typeof flag === "string" && flag !== "" && flag !== "0" && flag.toLowerCase() !== "false";
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  if (!isStrict(process.argv, process.env)) {
    console.log(
      "publish-preflight: advisory mode (no --strict, no REPLIT_DEPLOYMENT) — skipping. " +
        "The production build runs it with --strict; see docs/RELEASE.md step 0.",
    );
    return;
  }

  const snapshot = gather();
  const { failures, warnings } = evaluate(snapshot);
  const lastMigration = lastMigrationEntry(readFileOrNull(MIGRATION_REGISTRY));

  console.log("publish-preflight (strict) — CLAUDE.md 'Branch and publish rule'");
  console.log(`  branch          ${snapshot.branch ?? "unknown"}`);
  console.log(`  HEAD            ${snapshot.headSha ?? "unknown"}`);
  console.log(`  origin/main     ${snapshot.originSha ?? "unknown"}`);
  // Printed on pass AND fail: the operator compares these two to the deploy's own boot log —
  // the `[build] commit …` line and `"Migrations complete"` with its applied count. This script
  // cannot make that comparison (see NEGATIVE SPACE); it can only hand over the left-hand side.
  console.log(`  last migration  ${lastMigration ?? "unknown (registry unreadable)"}`);

  for (const w of warnings) console.warn(`\n  ! ${w}`);

  if (failures.length > 0) {
    console.error("\npublish-preflight FAILED — this checkout must not be published:\n");
    for (const f of failures) console.error(`  • ${f}`);
    console.error(
      "\nFix the CHECKOUT, not this guard. There is no override flag:" +
        "\n    git checkout main && git fetch origin && git reset --hard origin/main" +
        "\nthen restart the app once, confirm the boot log, and republish (docs/RELEASE.md step 0)." +
        "\nOn 2026-09-06 a publish from a checkout carrying an unmerged local commit served 96c39f5" +
        "\nto production while origin/main had never seen it. Branch protection did not stop that," +
        "\nbecause a publish builds the WORKSPACE, not the remote.",
    );
    process.exit(1);
  }

  console.log(
    "\npublish-preflight: OK — clean `main` at origin/main, lockfile clean." +
      "\nAfter the publish, confirm the deploy log's `[build] commit` matches the HEAD above" +
      "\nand that `\"Migrations complete\"` names a count consistent with the registry entry above." +
      "\nDecline any database-migration/SQL step the publish offers (CLAUDE.md §20).",
  );
}

main();
