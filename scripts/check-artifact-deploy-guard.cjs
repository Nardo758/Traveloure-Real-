#!/usr/bin/env node
/**
 * Artifact deployment override guard.
 *
 * Replit's artifact deployment configuration can redirect production to a
 * backend-less static build. Production deploys come from the committed tree,
 * so inspect tracked paths rather than the filesystem (which may contain
 * ignored dependencies or generated output).
 *
 * Self-test: --self-test
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FORBIDDEN_SEGMENT = ".replit-artifact";

function isArtifactOverridePath(filePath) {
  return filePath.split("/").includes(FORBIDDEN_SEGMENT);
}

function findArtifactOverridePaths(trackedPaths) {
  return trackedPaths.filter(isArtifactOverridePath);
}

function getTrackedPaths() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function runGuard() {
  const violations = findArtifactOverridePaths(getTrackedPaths());
  if (violations.length > 0) {
    console.error("FAIL: tracked .replit-artifact/ paths are forbidden:");
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  console.log("artifact-deploy-guard OK (no tracked .replit-artifact/ paths)");
}

function selfTest() {
  const clean = findArtifactOverridePaths([
    ".github/workflows/build.yml",
    "artifacts/traveloure/src/pages/experts.tsx",
    "scripts/check-artifact-deploy-guard.cjs",
    "docs/.replit-artifact-not-a-directory",
  ]);
  assert.deepEqual(clean, []);

  const violations = findArtifactOverridePaths([
    "artifacts/traveloure/.replit-artifact/artifact.toml",
    "artifacts/mockup-sandbox/.replit-artifact/artifact.toml",
    ".replit-artifact/artifact.toml",
    "artifacts/.replit-artifact-backup/artifact.toml",
  ]);
  assert.deepEqual(violations, [
    "artifacts/traveloure/.replit-artifact/artifact.toml",
    "artifacts/mockup-sandbox/.replit-artifact/artifact.toml",
    ".replit-artifact/artifact.toml",
  ]);

  console.log("artifact-deploy-guard self-test OK");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  runGuard();
}