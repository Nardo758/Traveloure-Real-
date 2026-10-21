#!/usr/bin/env node
/**
 * Ledger layout guard (was the union-merge guard; ledger `2026-10-21-ledger-one-file`).
 *
 * GitHub's mergeability check ignores `.gitattributes` merge drivers, so
 * `docs/DECISIONS.md merge=union` still left every open PR CONFLICTING after each
 * append. Rulings are now one file each. This guard holds that shape:
 *
 *   · `docs/DECISIONS.md` carries no ledger row (it is the preamble);
 *   · `.gitattributes` does not declare a union driver for it;
 *   · `docs/decisions/NNNNN-<id>.md` is one LF line whose row id is `<id>`;
 *   · `docs/decisions/pending/<id>.md` is the same, and both R? sides agree
 *     (a PR adds a pending file; the stamp moves it to the next seq);
 *   · a half-placeholder is refused;
 *   · duplicate ids fail, except the frozen pair of id 113 (exactly two files);
 *   · no other file sits in `docs/decisions/`.
 *
 * --self-test proves a default (non-union) merge of two new pending files is
 * clean, and that two appends to one shared file still conflict — which is why
 * the row is a new file. It also runs the dup-slug lint's own self-test.
 *
 * Node built-ins only.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const {
  ROW_ID_PREFIX_RE,
  KNOWN_DUPLICATE_IDS,
  placeholderSides,
  ID_ALT,
} = require("./check-decision-guards.cjs");
const { PREAMBLE_REL, DIR_REL, PENDING_REL, SEQ_NAME_RE, loadEntries, readPreamble } = require("./ledger-files.cjs");

const ROOT = path.resolve(__dirname, "..");
const ID_RE = new RegExp(`^(?:${ID_ALT})$`);
const UNION_LINE_RE = /^\s*docs\/DECISIONS\.md\s+merge=union\s*$/m;

function lintShape(root, { knownDuplicates = KNOWN_DUPLICATE_IDS } = {}) {
  const problems = [];
  const attrsPath = path.join(root, ".gitattributes");
  const attrs = fs.existsSync(attrsPath) ? fs.readFileSync(attrsPath, "utf8") : "";
  if (UNION_LINE_RE.test(attrs)) {
    problems.push(".gitattributes still declares docs/DECISIONS.md merge=union — GitHub ignores it; do not bring it back");
  }
  const preamble = readPreamble(root);
  for (const line of preamble.split("\n")) {
    if (ROW_ID_PREFIX_RE.test(line)) {
      problems.push(`${PREAMBLE_REL} still contains a ledger row (${line.slice(0, 80)}) — add docs/decisions/pending/<id>.md instead`);
      break;
    }
  }
  const dir = path.join(root, DIR_REL);
  if (!fs.existsSync(dir)) {
    problems.push(`${DIR_REL}/ is missing`);
    return problems;
  }
  for (const name of fs.readdirSync(dir)) {
    if (name === "pending" || SEQ_NAME_RE.test(name)) continue;
    problems.push(`unexpected file in ${DIR_REL}/: ${name}`);
  }
  const pendingDir = path.join(root, PENDING_REL);
  if (fs.existsSync(pendingDir)) {
    for (const name of fs.readdirSync(pendingDir)) {
      if (!name.endsWith(".md")) problems.push(`unexpected file in ${PENDING_REL}/: ${name}`);
    }
  }
  const entries = loadEntries(root);
  if (!entries.length) problems.push("no decision files");
  const seqs = new Set();
  const counts = {};
  for (const e of entries) {
    if (!e.ok) {
      problems.push(`${e.rel}: ${e.reason}`);
      continue;
    }
    if (!ID_RE.test(e.idFromName)) problems.push(`${e.rel}: filename id is not a ledger id`);
    if (e.id !== e.idFromName) problems.push(`${e.rel}: row id ${e.id || "(none)"} does not match the filename`);
    if (e.seq != null) {
      if (seqs.has(e.seq)) problems.push(`duplicate seq ${e.seq}`);
      seqs.add(e.seq);
    }
    const sides = placeholderSides(e.line);
    if (sides.headQ !== sides.citeQ) problems.push(`${e.rel}: heading and citation disagree on R?`);
    if (e.pending && !(sides.headQ && sides.citeQ)) {
      problems.push(`${e.rel}: a pending file is authored as R? on the heading and the citation; the stamp moves it`);
    }
    if (e.id) counts[e.id] = (counts[e.id] || 0) + 1;
  }
  for (const [id, n] of Object.entries(counts)) {
    if (n === 1) continue;
    if (Object.prototype.hasOwnProperty.call(knownDuplicates, id) && n === 2) continue;
    problems.push(`duplicate ruling id ${id} appears in ${n} files`);
  }
  for (const id of Object.keys(knownDuplicates)) {
    if ((counts[id] || 0) !== 2) {
      problems.push(`known duplicate id ${id} must stay a pair of files (found ${counts[id] || 0})`);
    }
  }
  return problems;
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

/** Default merge (no union driver) of two branches. `shared` appends one file; otherwise each branch adds its own. */
function simulateMerge({ shared }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-files-"));
  try {
    git(dir, ["init", "-q", "-b", "main"]);
    fs.mkdirSync(path.join(dir, "docs", "decisions", "pending"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "DECISIONS.md"), "# preamble\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "base"]);
    const pending = path.join(dir, "docs", "decisions", "pending");
    if (shared) {
      git(dir, ["checkout", "-q", "-b", "laneB"]);
      fs.appendFileSync(path.join(dir, "docs", "DECISIONS.md"), "| 2026-08-21-lane-b | d | [advisory] | B |\n");
      git(dir, ["commit", "-qam", "laneB"]);
      git(dir, ["checkout", "-q", "main"]);
      fs.appendFileSync(path.join(dir, "docs", "DECISIONS.md"), "| 2026-08-21-lane-a | d | [advisory] | A |\n");
      git(dir, ["commit", "-qam", "main"]);
    } else {
      git(dir, ["checkout", "-q", "-b", "laneB"]);
      fs.mkdirSync(pending, { recursive: true });
      fs.writeFileSync(path.join(pending, "2026-08-21-lane-b.md"), "| 2026-08-21-lane-b | d | [advisory] | B |\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-qm", "laneB"]);
      git(dir, ["checkout", "-q", "main"]);
      fs.mkdirSync(pending, { recursive: true });
      fs.writeFileSync(path.join(pending, "2026-08-21-lane-a.md"), "| 2026-08-21-lane-a | d | [advisory] | A |\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-qm", "main"]);
    }
    let clean = true;
    try {
      git(dir, ["merge", "-q", "--no-edit", "laneB"]);
    } catch (_e) {
      clean = false;
    }
    return { dir, clean };
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

function writeMini(root, files, preamble, attrs) {
  fs.rmSync(path.join(root, DIR_REL), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, DIR_REL), { recursive: true });
  fs.writeFileSync(path.join(root, ".gitattributes"), attrs);
  fs.writeFileSync(path.join(root, PREAMBLE_REL), preamble);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body.endsWith("\n") ? body : `${body}\n`);
  }
}

function selfTest() {
  const problems = [];
  const distinct = simulateMerge({ shared: false });
  try {
    if (!distinct.clean) problems.push("A: two new pending files conflicted under the default merge");
    const a = path.join(distinct.dir, "docs/decisions/pending/2026-08-21-lane-a.md");
    const b = path.join(distinct.dir, "docs/decisions/pending/2026-08-21-lane-b.md");
    if (!fs.existsSync(a) || !fs.existsSync(b)) problems.push("A: a pending file was dropped");
    if (fs.readFileSync(path.join(distinct.dir, "docs/DECISIONS.md"), "utf8").includes("<<<<<<<")) {
      problems.push("A: the preamble picked up conflict markers");
    }
  } finally {
    fs.rmSync(distinct.dir, { recursive: true, force: true });
  }
  const shared = simulateMerge({ shared: true });
  try {
    if (shared.clean) problems.push("B: two appends to one ledger file merged clean — the shared-line conflict this guard exists for did not reproduce");
  } finally {
    fs.rmSync(shared.dir, { recursive: true, force: true });
  }

  const mini = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-shape-"));
  try {
    const row = (id, head, cite) => `| ${id} | 2026-01-01 | [advisory] | ${head} | ${cite} |`;
    const base = {
      "docs/decisions/00001-113.md": row("113", "one", "refs"),
      "docs/decisions/00002-113.md": row("113", "two", "refs"),
      "docs/decisions/pending/2026-01-03-q.md": row("2026-01-03-q", "**R? — Q.**", "numeric citation R?"),
    };
    writeMini(mini, base, "# preamble\n", "# no union\n");
    const happy = lintShape(mini);
    if (happy.length) problems.push(`C: well-formed tree failed: ${happy.join(" | ")}`);

    writeMini(mini, base, "# preamble\n| 9 | 2026-01-01 | [advisory] | stray |\n", "# no union\n");
    if (!lintShape(mini).some((p) => p.includes(PREAMBLE_REL))) problems.push("D: a row in the preamble was accepted");

    writeMini(mini, { ...base, "docs/decisions/00003-2026-01-04-nope.md": row("2026-01-04-other", "x", "y") }, "# preamble\n", "# no union\n");
    if (!lintShape(mini).some((p) => p.includes("does not match"))) problems.push("E: a filename/id mismatch was accepted");

    writeMini(
      mini,
      { ...base, "docs/decisions/00003-2026-01-04-dup.md": row("2026-01-04-dup", "x", "y"), "docs/decisions/00004-2026-01-04-dup.md": row("2026-01-04-dup", "x", "y") },
      "# preamble\n",
      "# no union\n",
    );
    if (!lintShape(mini).some((p) => p.includes("2026-01-04-dup"))) problems.push("F: a new duplicate id was accepted");

    writeMini(mini, { "docs/decisions/00001-113.md": row("113", "only", "refs") }, "# preamble\n", "# no union\n");
    if (!lintShape(mini).some((p) => p.includes("113"))) problems.push("G: a single frozen id 113 was accepted");

    writeMini(mini, base, "# preamble\n", "docs/DECISIONS.md merge=union\n");
    if (!lintShape(mini).some((p) => p.includes("merge=union"))) problems.push("H: the union driver was accepted");

    writeMini(mini, { ...base, "docs/decisions/pending/2026-01-05-h.md": row("2026-01-05-h", "**R? — H.**", "numeric citation R300") }, "# preamble\n", "# no union\n");
    if (!lintShape(mini).some((p) => p.includes("disagree"))) problems.push("I: a half-placeholder pending file was accepted");
  } finally {
    fs.rmSync(mini, { recursive: true, force: true });
  }

  try {
    execFileSync("node", [path.join(ROOT, "scripts", "check-decision-guards.cjs"), "--self-test"], { stdio: "pipe" });
  } catch (_e) {
    problems.push("J: scripts/check-decision-guards.cjs --self-test failed — the dup-slug safety net is broken");
  }

  if (problems.length) {
    console.error("SELF-TEST FAILED");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log("self-test OK (two pending files merge clean; a shared append still conflicts; preamble rows, union driver, id mismatch, new dupes, a broken 113 pair and half-placeholders fail; dup-slug lint still passes its self-test)");
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

const problems = lintShape(ROOT);
if (problems.length) {
  for (const p of problems) console.error(`FAIL  ${p}`);
  process.exit(1);
}
const entries = loadEntries(ROOT);
const pending = entries.filter((e) => e.pending).length;
console.log(`ledger-files OK (${entries.length - pending} sequenced file(s), ${pending} pending; ${PREAMBLE_REL} has no row; no union driver)`);
