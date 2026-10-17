#!/usr/bin/env node
"use strict";

// Scope: reports/agent-memory-index-only.md. Inspect index paths, never note
// contents. Ignore rules alone cannot stop `git add --force`.
const { execFileSync } = require("node:child_process");

function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const paths = execFileSync("git", ["ls-files", "-z", "--full-name"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).split("\0").filter(Boolean);
  const count = paths.filter((name) => name.startsWith(".agents/memory/")).length;
  if (count) {
    console.error(
      `Agent-memory guard FAILED: ${count} prohibited .agents/memory/ index path(s). ` +
      "Remove these paths from the index, preserving local notes; do not commit backups. " +
      "See reports/agent-memory-index-only.md. No note contents were read.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("Agent-memory guard passed: no .agents/memory/ paths in the Git index.");
}

try {
  main();
} catch {
  // Fail closed without dumping Git output or environment details.
  console.error("Agent-memory guard could not inspect the Git index.");
  process.exitCode = 2;
}
