#!/usr/bin/env node
/**
 * Coverage-matrix lint (journey-suite Wave 1; brief §1/§6, DECISIONS.md ruling 21/27).
 *
 * The matrix (docs/testing/coverage-matrix.md) is the single answer to "is X
 * tested?" Every surface×action cell claims ≥1 test id or is explicitly marked
 * deferred/n-a. This lint is the machine check that ruling 21 promised as the
 * journey-suite's guard #1; landing it in CI expires the standing ledger
 * warning `[matrix-lint deferred:journey-suite-wave-1]`.
 *
 * Rules enforced:
 *   1. Cell completeness — every claim cell in every matrix table (EXCEPT the
 *      "Existing-coverage absorption" and "Deferred-tag register" sections) must
 *      contain ≥1 of: a test id (J\d+(\.\d+)?, F-[a-z0-9-]+, N\d+, N-[a-z-]+,
 *      EX:), a deferred:<lane> tag, or n/a:<reason>. Empty/unmarked ⇒ FAIL,
 *      with the section + action identified.
 *   2. Test-id existence — every J/F/N id in a cell that carries NO deferred:
 *      tag must have the literal annotation `matrix-id: <ID>` in at least one
 *      test file under e2e/, playwright/, server/__tests__/, scripts/journeys/.
 *      Missing ⇒ FAIL. Cells WITH a deferred: tag are exempt (pre-claims).
 *   3. Deferred-tag register — a `## Deferred-tag register` table lists each
 *      deferred:<lane> tag with status open|merged. A tag used in a cell but
 *      absent from the register ⇒ FAIL (unknown tag). A tag whose register
 *      status is `merged` yet still present in any cell ⇒ FAIL (its lane landed;
 *      the deferred test must now be built — ruling 21).
 *
 * Node built-ins only — no npm ci needed. Self-test: --self-test
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MATRIX = path.join(ROOT, "docs", "testing", "coverage-matrix.md");
const TEST_DIRS = ["e2e", "playwright", path.join("server", "__tests__"), path.join("scripts", "journeys")];

// Sections whose tables are NOT claim tables (excluded from cell completeness /
// id-existence). Matched by the heading text (case-insensitive substring).
const EXCLUDED_SECTIONS = ["existing-coverage absorption", "deferred-tag register"];
const REGISTER_HEADING = "deferred-tag register";

const TEST_ID_RE = /\b(?:J\d+(?:\.\d+)?|F-[a-z0-9-]+|N\d+|N-[a-z-]+)\b/g;
const DEFERRED_RE = /deferred:([a-z0-9-]+)/gi;

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}
function splitRow(line) {
  // Drop leading/trailing pipe, split on unescaped pipes.
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}
function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * Parse the matrix into:
 *   - claimCells: [{ section, action, claim }] for every data row in a claim table
 *   - register:   Map<tag, status>
 */
function parseMatrix(text) {
  const lines = text.split("\n");
  const claimCells = [];
  const register = new Map();
  let section = "(preamble)";
  let excluded = false;
  let inRegister = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      section = h[1].trim();
      const low = section.toLowerCase();
      excluded = EXCLUDED_SECTIONS.some((s) => low.includes(s));
      inRegister = low.includes(REGISTER_HEADING);
      i++;
      continue;
    }
    if (!isTableRow(line)) {
      i++;
      continue;
    }
    // Table block starts here. First row = header, optional separator, then data.
    const header = splitRow(line);
    i++;
    // Skip a separator row if present.
    if (i < lines.length && isTableRow(lines[i]) && isSeparatorRow(splitRow(lines[i]))) i++;
    while (i < lines.length && isTableRow(lines[i])) {
      const cells = splitRow(lines[i]);
      if (isSeparatorRow(cells)) {
        i++;
        continue;
      }
      if (inRegister) {
        // Register row: | tag | status | ... |
        const tag = (cells[0] || "").replace(/^deferred:/i, "").trim().toLowerCase();
        const status = (cells[1] || "").trim().toLowerCase();
        if (tag && (status === "open" || status === "merged")) register.set(tag, status);
      } else if (!excluded) {
        // Claim table: last column is the claim; first column is the action.
        const action = cells[0] || "";
        const claim = cells[cells.length - 1] || "";
        claimCells.push({ section, action, claim });
      }
      i++;
    }
  }
  return { claimCells, register };
}

function collectTestAnnotations(root) {
  const found = new Set();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walk(full);
      } else if (entry.isFile()) {
        let txt;
        try {
          txt = fs.readFileSync(full, "utf8");
        } catch {
          continue;
        }
        const re = /matrix-id:\s*([A-Za-z0-9.\-]+)/g;
        let m;
        while ((m = re.exec(txt))) found.add(m[1]);
      }
    }
  };
  for (const d of TEST_DIRS) walk(path.join(root, d));
  return found;
}

function extractDeferredTags(claim) {
  const tags = [];
  let m;
  DEFERRED_RE.lastIndex = 0;
  while ((m = DEFERRED_RE.exec(claim))) tags.push(m[1].toLowerCase());
  return tags;
}
function extractTestIds(claim) {
  const ids = new Set();
  let m;
  TEST_ID_RE.lastIndex = 0;
  while ((m = TEST_ID_RE.exec(claim))) ids.add(m[0]);
  return [...ids];
}
function hasAnyClaimMark(claim) {
  if (/deferred:[a-z0-9-]+/i.test(claim)) return true;
  if (/n\/a:/i.test(claim)) return true;
  if (/\bEX:/.test(claim)) return true;
  TEST_ID_RE.lastIndex = 0;
  return TEST_ID_RE.test(claim);
}

function lint({ matrixText, testIds }) {
  const failures = [];
  const { claimCells, register } = parseMatrix(matrixText);

  if (claimCells.length === 0) failures.push("No claim cells parsed from the matrix — table format drifted?");
  if (register.size === 0) failures.push("No Deferred-tag register parsed — add a `## Deferred-tag register` table with tag/status columns.");

  const usedTags = new Set();

  for (const { section, action, claim } of claimCells) {
    const where = `[${section}] "${action}"`;

    // Rule 1: completeness.
    if (!hasAnyClaimMark(claim)) {
      failures.push(`Unmarked/empty cell — ${where}: no test id, deferred: tag, or n/a: marker. (${JSON.stringify(claim)})`);
      continue;
    }

    const deferred = extractDeferredTags(claim);
    for (const t of deferred) usedTags.add(t);

    // Rule 3a: unknown tag (not in register).
    for (const t of deferred) {
      if (!register.has(t)) {
        failures.push(`Unknown deferred tag "deferred:${t}" — ${where}: not listed in the Deferred-tag register.`);
      }
    }

    // Rule 3b: merged tag still present in a cell.
    for (const t of deferred) {
      if (register.get(t) === "merged") {
        failures.push(
          `Deferred tag "deferred:${t}" is status=merged in the register but still tags ${where} — the lane landed; build the deferred test and drop the tag (ruling 21).`,
        );
      }
    }

    // Rule 2: id existence — ONLY for cells with NO deferred tag (deferred = exempt pre-claim).
    if (deferred.length === 0) {
      for (const id of extractTestIds(claim)) {
        if (!testIds.has(id)) {
          failures.push(
            `Missing test annotation "matrix-id: ${id}" — ${where}: claimed but no test file under {${TEST_DIRS.join(", ")}} carries the annotation.`,
          );
        }
      }
    }
  }

  return { failures, register, usedTags };
}

function selfTest() {
  const testIds = new Set(["J1.1", "N1", "F-real-1"]);

  const goodMatrix = [
    "# Matrix",
    "## 1. Surface A",
    "| Action | Claim |",
    "|---|---|",
    "| do a thing | J1.1 |",
    "| a negative | N1 |",
    "| a breadth spec | F-real-1 |",
    "| unbuilt feature | deferred:some-lane |",
    "| not applicable | n/a:no-route |",
    "| absorbed | EX: some/existing.test.ts |",
    "",
    "## Existing-coverage absorption",
    "| Existing suite | Disposition |",
    "|---|---|",
    "| foo.spec.ts | this row has no test id and must be IGNORED |",
    "",
    "## Deferred-tag register",
    "| deferred tag | status | notes |",
    "|---|---|---|",
    "| deferred:some-lane | open | a lane |",
    "| deferred:landed-lane | merged | a lane that landed |",
  ].join("\n");

  const r1 = lint({ matrixText: goodMatrix, testIds });
  const ok1 = r1.failures.length === 0;

  // Unmarked cell fails.
  const unmarked = goodMatrix.replace("| do a thing | J1.1 |", "| do a thing |  |");
  const r2 = lint({ matrixText: unmarked, testIds });
  const ok2 = r2.failures.some((f) => f.includes("Unmarked/empty") && f.includes("do a thing"));

  // Missing test-id annotation fails (id not in testIds, no deferred tag).
  const missing = goodMatrix.replace("| do a thing | J1.1 |", "| do a thing | J9.9 |");
  const r3 = lint({ matrixText: missing, testIds });
  const ok3 = r3.failures.some((f) => f.includes("matrix-id: J9.9"));

  // Deferred cell with a non-existent id must NOT fail existence (exempt).
  const deferredExempt = goodMatrix.replace("| do a thing | J1.1 |", "| do a thing | J9.9 → deferred:some-lane |");
  const r4 = lint({ matrixText: deferredExempt, testIds });
  const ok4 = !r4.failures.some((f) => f.includes("matrix-id: J9.9"));

  // Unknown deferred tag fails.
  const unknownTag = goodMatrix.replace("| unbuilt feature | deferred:some-lane |", "| unbuilt feature | deferred:ghost-lane |");
  const r5 = lint({ matrixText: unknownTag, testIds });
  const ok5 = r5.failures.some((f) => f.includes("deferred:ghost-lane") && f.includes("Unknown"));

  // Merged tag still in a cell fails.
  const mergedStillUsed = goodMatrix.replace("| a negative | N1 |", "| a negative | N1 → deferred:landed-lane |");
  const r6 = lint({ matrixText: mergedStillUsed, testIds });
  const ok6 = r6.failures.some((f) => f.includes("deferred:landed-lane") && f.includes("merged"));

  // Absorption-section rows must be ignored (no false "unmarked" failure).
  const ok7 = !r1.failures.some((f) => f.includes("this row has no test id"));

  // Register with no table fails.
  const noReg = goodMatrix.replace(/## Deferred-tag register[\s\S]*$/, "");
  const r8 = lint({ matrixText: noReg, testIds });
  const ok8 = r8.failures.some((f) => f.includes("Deferred-tag register"));

  const cases = { ok1, ok2, ok3, ok4, ok5, ok6, ok7, ok8 };
  if (!Object.values(cases).every(Boolean)) {
    console.error("SELF-TEST FAILED", cases);
    console.error("r1", r1.failures);
    if (!ok2) console.error("r2", r2.failures);
    if (!ok3) console.error("r3", r3.failures);
    if (!ok4) console.error("r4", r4.failures);
    if (!ok5) console.error("r5", r5.failures);
    if (!ok6) console.error("r6", r6.failures);
    if (!ok8) console.error("r8", r8.failures);
    process.exit(1);
  }
  console.log(
    "self-test OK (completeness · id-existence · deferred-exempt · unknown-tag · merged-tag · absorption-ignored · register-required)",
  );
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();

const matrixText = fs.readFileSync(MATRIX, "utf8");
const testIds = collectTestAnnotations(ROOT);
const { failures, register, usedTags } = lint({ matrixText, testIds });

// Report unused registered tags as a non-failing note (drift signal, not a gate).
for (const [tag, status] of register) {
  if (!usedTags.has(tag)) console.warn(`WARN  registered tag "deferred:${tag}" (status=${status}) is not used by any cell — stale register entry?`);
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`\ncoverage-matrix lint: ${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`coverage-matrix lint OK (${register.size} deferred tag(s) registered; all claim cells marked & existing ids annotated)`);
