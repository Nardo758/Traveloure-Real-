#!/usr/bin/env node
/**
 * CI guard support (required-suites-ran.yml): did a workflow's own `on.pull_request.paths` /
 * `paths-ignore` filters match this PR's changed files?
 *
 * WHY THIS EXISTS: a required suite that never produced a check-run is only a bug when its `paths:` filter
 * WOULD have matched. `ci-skip-rules.cjs --decide` answers a different question ("would the run be skipped
 * once triggered"), so it is the wrong oracle for the missing case — on #2008 it said `run=true` for suites
 * whose `paths:` never match a client-only file.
 *
 * Glob rules mirror GitHub's, in the one way that matters here:
 *   `**`      any number of path segments (including none)
 *   `*`       any run of characters except `/`
 *   `?`       one character except `/`
 *   `!` at the START of a `paths:` entry negates it, and entries are evaluated IN ORDER (later wins), the
 *   same ordered rule `ci-skip-rules.cjs` uses for its own canonicalPaths.
 * Unlike GitHub (whose `paths:` uses minimatch with `dot: true`), a leading dot is matched by `*`/`**` here —
 * `dot: true` is exactly what GitHub does, so this is the same behaviour, written out.
 *
 * USAGE (two ways, both print one word):
 *   node scripts/ci/paths-match.cjs <workflow-file> <file> [<file> ...]
 *   printf '%s\n' <file>... | node scripts/ci/paths-match.cjs --stdin <workflow-file>
 *
 *   match    at least one changed file matches what the workflow watches → it SHOULD have run
 *   nomatch  nothing it watches changed → its paths filter legitimately kept it from running
 *   nopaths  the workflow declares no paths/paths-ignore (it runs on every PR) → it SHOULD have run
 */
const fs = require("node:fs");
const path = require("node:path");

/** One glob → RegExp. Anchored, `/`-aware, dot-matching. */
function globToRegExp(glob) {
  let out = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` swallows a whole directory prefix; a bare `**` swallows everything.
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(out + "$");
}

/** Ordered evaluation: later entries win. `!` entries un-match. */
function matchesAny(patterns, file) {
  let matched = false;
  for (const raw of patterns) {
    const negated = raw.startsWith("!");
    const glob = negated ? raw.slice(1) : raw;
    if (globToRegExp(glob).test(file)) matched = !negated;
  }
  return matched;
}

/**
 * The paths/paths-ignore lists from the workflow's `on.pull_request`. Text-based (`—` this repo has no YAML
 * library in CI) and deliberately narrow: it reads the block the suite workflows actually use.
 */
function readPaths(root, workflowFile) {
  const text = fs.readFileSync(path.join(root, ".github/workflows", workflowFile), "utf8").split(/\r?\n/);
  let onIndent = -1;
  let prIndent = -1;
  const lists = { paths: [], "paths-ignore": [] };
  let current = null;

  for (let i = 0; i < text.length; i++) {
    const line = text[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;

    if (onIndent < 0) {
      if (/^on:\s*$/.test(line)) onIndent = indent;
      continue;
    }
    if (indent <= onIndent && !/^on:/.test(line)) break; // left the `on:` block

    if (prIndent < 0) {
      if (line.trim() === "pull_request:" && indent === onIndent + 2) prIndent = indent;
      continue;
    }
    if (indent <= prIndent) break; // left the pull_request block

    const key = line.trim();
    if (key === "paths:" || key === "paths-ignore:") {
      current = key === "paths:" ? "paths" : "paths-ignore";
      continue;
    }
    const item = /^\s*-\s*'([^']*)'\s*$/.exec(line) || /^\s*-\s*"([^"]*)"\s*$/.exec(line);
    if (item && current) lists[current].push(item[1]);
    else if (!item && current && /^\s*[A-Za-z_-]+:/.test(line)) current = null; // another key ends the list
  }
  return lists;
}

function main() {
  const argv = process.argv.slice(2);
  const root = path.resolve(__dirname, "..", "..");
  const useStdin = argv[0] === "--stdin";
  const workflowFile = useStdin ? argv[1] : argv[0];
  if (!workflowFile) {
    console.error("usage: paths-match.cjs [--stdin] <workflow-file> [<file> ...]");
    process.exit(2);
  }
  const files = useStdin
    ? fs.readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean)
    : argv.slice(1);

  const { paths, "paths-ignore": ignore } = readPaths(root, workflowFile);
  if (paths.length === 0 && ignore.length === 0) {
    console.log("nopaths");
    return;
  }
  if (paths.length > 0) {
    console.log(files.some((f) => matchesAny(paths, f)) ? "match" : "nomatch");
    return;
  }
  // Only paths-ignore: the workflow runs unless EVERY changed file is ignored.
  console.log(files.every((f) => matchesAny(ignore, f)) ? "nomatch" : "match");
}

if (require.main === module) main();
module.exports = { globToRegExp, matchesAny, readPaths };
