"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const guard = path.join(__dirname, "check-agent-memory.cjs");

test("clean index passes; force-added synthetic notes fail without reading contents", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-guard-"));
  // Isolate from any Git variables inherited from hooks or the task runner.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  const git = (...args) => execFileSync("git", args, {
    cwd: dir, env, stdio: "pipe",
  });
  const write = (name, text) => {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  const run = (cwd = dir, override = env) => spawnSync(process.execPath, [guard], {
    cwd, env: override, encoding: "utf8",
  });
  try {
    git("init", "--quiet");
    write(".gitignore", ".agents/memory/\n");
    write(".agents/skills/example/SKILL.md", "Synthetic shared skill\n");
    write(".agents/agent_assets_metadata.toml", "# Synthetic asset metadata\n");
    write(".agents/memory-archive/example.md", "Synthetic allowed sibling\n");
    const note = ".agents/memory/synthetic note\nwith newline.md";
    const sentinel = "SYNTHETIC_NOTE_CONTENT_MUST_NOT_BE_LOGGED";
    write(note, sentinel);
    write(".agents/memory/nested/synthetic.md", sentinel);
    git("add", ".gitignore", ".agents/skills", ".agents/agent_assets_metadata.toml",
      ".agents/memory-archive");
    git("check-ignore", "--quiet", note);
    assert.equal(run().status, 0, "ignored notes and allowed agent files must pass");
    assert.equal(run(path.join(dir, ".agents/skills")).status, 0,
      "the check must also work from a subdirectory");

    // Copy only this synthetic repository's index. Never touch the real index
    // or read any local working notes.
    const disposableIndex = path.join(dir, "disposable-index");
    fs.copyFileSync(path.join(dir, ".git/index"), disposableIndex);
    const disposableEnv = { ...env, GIT_INDEX_FILE: disposableIndex };
    execFileSync("git", ["add", "--force", "--", note,
      ".agents/memory/nested/synthetic.md"], {
      cwd: dir, env: disposableEnv, stdio: "pipe",
    });
    const failed = run(path.join(dir, ".agents/skills"), disposableEnv);
    assert.equal(failed.status, 1, "force-added memory paths must fail");
    assert.match(failed.stderr, /2 prohibited/);
    assert.ok(!`${failed.stdout}${failed.stderr}`.includes(sentinel),
      "diagnostics must not print note contents");
    assert.equal(run().status, 0, "the original clean index must remain unchanged");

    // A tracked note missing from the worktree must still be detected.
    fs.rmSync(path.join(dir, ".agents/memory"), { recursive: true });
    assert.equal(run(dir, disposableEnv).status, 1);
    assert.equal(run(os.tmpdir()).status, 2, "Git inspection failures must fail closed");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
