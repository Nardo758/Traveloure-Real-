#!/usr/bin/env node
/**
 * Decision-ledger guard lint (ruling 26, sharpened by ruling 27).
 *
 * Parses the ledger for `[guarded: name, name2]` tags and verifies every
 * named guard actually RUNS IN CI — i.e. the guard name appears in at least one
 * .github/workflows/*.yml file. A script not wired into CI is not a guard
 * (ruling 27: "script-only = MISSING").
 *
 * The ledger is one file per ruling under `docs/decisions/` (sequenced
 * `<seq>-<id>.md`, then `docs/decisions/pending/<id>.md`) plus the preamble
 * `docs/DECISIONS.md` (rules, lane-local list, guard registry). A PR adds a
 * pending file and does not append a row to the preamble.
 *
 * EVERY [guarded:] TAG IS READ (GW-1, ledger `2026-10-12-gw1-guard-tags`). Until GW-1 only a tag that
 * stood ALONE in its cell was parsed, so 458 of 537 guarded rows — every row with a note after the tag —
 * were never checked, and nine of them named test files that had since been deleted. A tag at the head of
 * the cell is now read whatever follows it. In such a tag a part names a guard only when its first word is
 * guard-shaped; prose parts name nothing. A guard is wired when a workflow `run:` names it, when it is a
 * test file `scripts/check-test-files-wired.cjs` finds reachable (or a runner config passed by
 * `--config`/`-c` names it, or matches it by literal `testDir` + `testMatch`), or when it is a workflow job
 * id or workflow file. `[guarded: none …]`, `[retired with R<n> — surface removed]` and
 * `[unguarded since R<n> — re-pin needed]` are printed on every run, never failed. NEGATIVE SPACE: a guard named only inside a sentence is not read; `[tested: …]`
 * and a bare `[guarded]` are other notations and stay unread; the check is that the guard RUNS, never
 * that it covers the ruling.
 *
 * `deferred:<lane>` inside the tag exempts the guard with a WARNING — the named
 * lane owes the guard; the tag must be expired (removed) in the wave that lane
 * merges (ruling 21). Everything else missing from CI FAILS the lint.
 *
 * Also enforces append-only shape minimally: numeric ruling IDs must be unique.
 *
 * R-NUMBER RULES (ledger `2026-09-27-r-number-lint`, R155) — run over the WHOLE ledger, not only
 * new rows:
 *   (a) a row whose ruling column opens with the R heading `**R<n> —` must carry the citation
 *       column `numeric citation R<n>` as its LAST cell, naming the SAME <n>;
 *   (b) every `numeric citation R<n>` number appears on exactly ONE row;
 *   (c) no cited R-number reuses a FROZEN numeric row id (the 1–122 series, ruling 25 —
 *       "never reused"). The frozen set is read from the ledger's own numeric rows.
 *   (d) UNASSIGNED rows (ledger `2026-09-29-r-number-at-merge`): a row may be authored with the
 *       placeholder `**R? —` and `numeric citation R?`. It carries no number, so it cannot collide;
 *       the pair must still agree, and `scripts/assign-r-numbers.cjs --stamp` numbers it after
 *       merge by rewriting that pending file. `--require-assigned` (the post-merge stamp only) fails while any `R?`
 *       remains, so a forgotten assignment is seen on the first main build, never silently kept.
 *   (e) ORDER (ledger `2026-10-03-r-number-order`): from the first row citing R`R_ORDER_FLOOR` or
 *       above, every later numbered row must cite a HIGHER number than the one before it in file
 *       order, so the ledger reads R269, R270, R271 … top to bottom. `R?` rows are skipped (they
 *       carry no number yet); once numbered they must sit after every lower number. Rows above the
 *       floor's first row are history whose order was never enforced and is not checked — the
 *       floor is the stated limit, not an exemption list.
 *   NEGATIVE SPACE: a lane-LOCAL R series that predates the global numbering (the partner-demand
 *   lane's R1–R38) is not a global R-id; its rows are exempted BY NAME in the ledger's own
 *   `## Lane-local R numbering` section. The lint is silent while that list matches the ledger and
 *   FAILS when it goes stale (a listed row gone or no longer R-headed), so any change to the
 *   exemptions shows up as a reviewed diff, never as per-run noise. An R-number mentioned in prose
 *   (not as the row's opening heading) is not checked.
 *
 * Node built-ins only — no npm ci needed. Self-test: --self-test
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");

/**
 * Extract ONLY `run:` command text from workflow YAML (inline scalars and
 * `run: |` / `run: >` block scalars). A guard name appearing in a comment,
 * job name, or prose must NOT count as "in CI" — only an actual command does.
 */
function extractRunCommands(yamlText) {
  const out = [];
  const lines = yamlText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!m) continue;
    const [, indent, rest] = m;
    const stripped = rest.replace(/#.*$/, "").trim();
    if (stripped === "|" || stripped === ">" || stripped === "|-" || stripped === ">-" || stripped === "") {
      // block scalar: consume subsequent lines more indented than `run:`
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "") continue;
        const lead = lines[j].match(/^(\s*)/)[1];
        if (lead.length <= indent.length) break;
        out.push(lines[j].trim());
      }
    } else {
      out.push(stripped);
    }
  }
  return out.join("\n");
}

function collectWorkflowText(dir) {
  if (!fs.existsSync(dir)) return "";
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => extractRunCommands(fs.readFileSync(path.join(dir, f), "utf8")))
    .join("\n");
}

/**
 * A ledger row id. NEW rows use a DATE-SLUG key (`2026-08-16-ledger-ids`) because the old
 * "claim the next free number" rule made a collision structural: two lanes opened on the same
 * day both take the next integer, and the loser has to renumber AND chase every cross-reference
 * that named the number. Three such collisions happened in one night (rows 120/121/122). The
 * numeric series stays valid forever — those ids are cited across the briefs and must not move.
 */
// A dot is legal in a slug: `2026-08-31-landing-v2.5-close-out` is a real row. The
// class stays tight enough that a guard-registry line (`| no conflict markers |`) does not match.
const ID_ALT = String.raw`\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9.-]*|\d+|R-[A-Z]`;
const ROW_ID_RE = new RegExp(String.raw`^\|\s*(${ID_ALT})\s*\|\s*[\d-]+\s*\|\s*(\[[^\]]+\])\s*\|`);
const ROW_ID_PREFIX_RE = new RegExp(String.raw`^\|\s*(${ID_ALT})\s*\|`);
/**
 * EVERY ledger row, whatever its tag cell holds: an id cell then a date cell. `ROW_ID_RE` above only
 * matches a row whose third cell is the tag ALONE, and most rows carry text after the tag in that same
 * cell (`[guarded: …] (No migration …) |`), so 662 of 856 date-slug rows never parsed and every one of
 * them was invisible to the duplicate check (found Oct 10, 2026 when a stale duplicate of the FD-3 row
 * passed — ledger-dupes lane). Duplicates are counted over THIS match. The guard-wiring check still
 * reads only `ROW_ID_RE` rows — stated negative space, unchanged here.
 */
const ROW_ANY_RE = new RegExp(String.raw`^\|\s*(${ID_ALT})\s*\|\s*\d{4}-\d{2}-\d{2}\s*\|`);

/**
 * Ids already duplicated on main when the check above started seeing every row (Oct 10, 2026). The
 * ledger is append-only and ids 1–122 are frozen, so they are not rewritten here; each is PRINTED on
 * every run (never a silent baseline — the `fee-literal-debt` posture), and an entry that is no longer
 * duplicated FAILS, so this list only shrinks. Removing a copy is a decision-maker call.
 */
const KNOWN_DUPLICATE_IDS = {
  "113": "frozen numeric collision — the Workstation-vs-Catalog ruling (Aug 14) and the Replit-stream audit record (Aug 17)",
};

/** The bracketed tag at the head of a tag cell (balanced), or null. */
function leadingTag(cell) {
  if (!cell.startsWith("[")) return null;
  let depth = 0;
  for (let i = 0; i < cell.length; i++) {
    if (cell[i] === "[") depth++;
    if (cell[i] === "]" && --depth === 0) return cell.slice(0, i + 1);
  }
  return null;
}

/**
 * The guard NAMES in a tag whose content is written as prose (`a.test.ts T1–T4 (whole-directory job);
 * scripts/x.cjs`). The content is split at top-level `,` and `;`; a part names a guard only when its
 * first word is guard-shaped (a path, a file or a kebab/dotted name). Every other part is prose about
 * the guards and names nothing — NEGATIVE SPACE: a guard written only inside a sentence is not read.
 * A tag whose content opens with `none` is the row saying it has no guard; it is reported, not failed.
 */
function looseGuardNames(content) {
  const trimmed = content.trim();
  if (/^none\b/i.test(trimmed)) return { guards: [], deferred: null, none: true };
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of trimmed) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if ((ch === "," || ch === ";") && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  let deferred = null;
  const guards = [];
  for (const raw of parts.map((p) => p.trim()).filter(Boolean)) {
    if (/^deferred:/i.test(raw)) {
      deferred = raw.slice("deferred:".length).trim();
      continue;
    }
    const first = raw.split(/[\s(]/)[0].replace(/^`|`$/g, "");
    if (/^[\w./*@-]+$/.test(first) && /[/.-]/.test(first) && /[a-z]/i.test(first)) guards.push(first);
  }
  return { guards, deferred, none: false };
}

/**
 * Whether a named guard runs in CI. A name that appears in a workflow `run:` command is wired
 * (the original rule). A TEST FILE is also wired when `scripts/check-test-files-wired.cjs` finds
 * it reachable — a whole-directory job runs a file without naming it. A test file may be named by
 * its path or, when unique, by its basename; `.ts` and `.tsx` are the same file for this question.
 * A workflow file (`*.yml`) is wired when it exists. Anything else must appear in a `run:` command.
 */
const TEST_SUFFIXES = [".test.ts", ".test.tsx", ".db.test.ts", ".http.test.ts", ".vitest.ts", ".spec.ts"];

function globToRegex(glob) {
  return new RegExp(`^${glob.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, ".")}$`);
}

/**
 * A runner config a workflow `run:` passes by `--config`/`-c` RUNS a file when the config names it
 * literally (a vitest `include` list) or when the file sits under the config's literal `testDir` and
 * a literal `testMatch` glob matches its basename (a Playwright project). Computed values are not read.
 */
function configRuns(file, configs) {
  return configs.some(({ text }) => {
    if (text.includes(`"${file}"`) || text.includes(`'${file}'`)) return true;
    const dir = (text.match(/testDir:\s*['"]\.?\/?([^'"]+)['"]/) || [])[1];
    if (!dir || !file.startsWith(`${dir.replace(/\/$/, "")}/`)) return false;
    const globs = [...text.matchAll(/testMatch:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    return globs.some((g) => globToRegex(g).test(path.basename(file)));
  });
}

function guardIsWired(name, { workflowText, tests = [], reachable = new Set(), workflowFiles = [], jobIds = [], configs = [] }) {
  if (workflowText.includes(name)) return true;
  if (/\.ya?ml$/.test(name)) return workflowFiles.includes(path.basename(name));
  // A workflow job id or a workflow file named without its extension is a CI job, and a job runs.
  if (!name.includes("/") && (jobIds.includes(name) || workflowFiles.some((f) => f.replace(/\.ya?ml$/, "") === name))) return true;
  const isTestName = TEST_SUFFIXES.some((x) => name.endsWith(x));
  const variants = isTestName
    ? [name, name.replace(/\.ts$/, ".tsx"), name.replace(/\.tsx$/, ".ts")]
    : TEST_SUFFIXES.map((x) => `${name}${x}`);
  const hits = name.includes("/")
    ? variants.filter((v) => tests.includes(v))
    : tests.filter((t) => variants.includes(path.basename(t)));
  if (!hits.length) return false;
  return hits.every((t) => reachable.has(t) || configRuns(t, configs));
}

function parseLedger(text) {
  const entries = [];
  const ids = [];
  const allIds = [];
  const malformed = [];
  for (const line of text.split("\n")) {
    const any = line.match(ROW_ANY_RE);
    if (any) allIds.push(any[1]);
    // Table rows: | <id> | <date> | [tag] | ...
    // IDs come in three shapes: the DATE-SLUG key new rows use (2026-08-16-some-lane),
    // the frozen numeric series (1..122), and the closed Console Realign letters (R-A).
    // The slug alternative is listed FIRST so `\d+` cannot half-match a date-slug's year.
    // GW-1: a row whose guard was deleted and not re-pinned says so in its tag. It is reported on
    // every run (never a silent baseline) and is not a failure — the re-pin lane owes it.
    if (any) {
      const head = leadingTag(rowCells(line)[2] ?? "") || "";
      const unguarded = head.match(/^\[unguarded since (R\d+) — re-pin needed\]$/);
      const retired = head.match(/^\[retired with (R\d+) — surface removed\]$/);
      if (unguarded || retired) {
        ids.push(any[1]);
        entries.push({ id: any[1], guards: [], deferred: null, none: false, loose: true, unguardedSince: unguarded?.[1], retiredWith: retired?.[1] });
        continue;
      }
    }
    let row = line.match(ROW_ID_RE);
    let loose = false;
    if (!row && any) {
      // GW-1 (ledger `2026-10-12-gw1-guard-tags`): most rows carry text AFTER the tag in the same cell
      // (`[guarded: …] (note) |`). ROW_ID_RE only matched a tag alone in its cell, so 458 of 537 guarded
      // rows were never checked. Read a tag at the head of the cell, whatever follows it.
      const tag = leadingTag(rowCells(line)[2] ?? "");
      // Only the two tag shapes this lint owns; `[tested: …]` and a bare `[guarded]` are other
      // notations and stay unread, exactly as before (stated negative space).
      if (tag && /^\[(guarded:|advisory\])/i.test(tag)) {
        row = [null, any[1], tag];
        loose = true;
      }
    }
    if (!row) {
      // A table-ish line mentioning guarded/advisory that failed to parse is a
      // malformed ledger row — reject loudly rather than silently skipping it.
      if (ROW_ID_PREFIX_RE.test(line) && /\[(guarded|advisory)/i.test(line) === false && /guarded|advisory/i.test(line)) {
        malformed.push(line.trim().slice(0, 120));
      }
      continue;
    }
    const [, id, tag] = row;
    if (!/^\[(guarded:\s*[^\]]+|advisory)\]$/i.test(tag)) {
      malformed.push(line.trim().slice(0, 120));
      continue;
    }
    ids.push(id);
    const guarded = tag.match(/^\[guarded:\s*([^\]]+)\]$/i);
    if (guarded) {
      if (loose) {
        entries.push({ id, ...looseGuardNames(guarded[1]), loose: true });
      } else {
        const parts = guarded[1].split(",").map((s) => s.trim()).filter(Boolean);
        const deferred = parts.find((p) => p.toLowerCase().startsWith("deferred:"));
        const guards = parts.filter((p) => !p.toLowerCase().startsWith("deferred:"));
        entries.push({ id, guards, deferred: deferred ? deferred.slice("deferred:".length) : null, none: false, loose: false });
      }
    }
  }
  return { entries, ids, allIds, malformed };
}

/**
 * The lane-local R rows, read from the ledger's own `## Lane-local R numbering` section — the list
 * lives in the ledger, beside the rows it names, not in this script.
 */
function readLaneLocalRows(ledgerText) {
  const out = {};
  const m = ledgerText.match(/^## Lane-local R numbering[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const row = line.match(/^- `([^`]+)` — (.+)$/);
    if (row) out[row[1]] = row[2].trim();
  }
  return out;
}

/** The cells of one ledger table row (outer pipes stripped). */
function rowCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(" | ").map((c) => c.trim());
}

/** True when the heading or the citation cell still carries the `R?` placeholder. */
function isPlaceholderRow(line) {
  if (!ROW_ID_PREFIX_RE.test(line)) return false;
  const cells = rowCells(line);
  return /^\*\*R\? —/.test(cells[3] ?? "") || /^numeric citation R\?(?![\w])/.test(cells[cells.length - 1] ?? "");
}

/** The two placeholder sides, so a half-placeholder (one side numbered) can be refused. */
function placeholderSides(line) {
  const cells = rowCells(line);
  return {
    headQ: /^\*\*R\? —/.test(cells[3] ?? ""),
    citeQ: /^numeric citation R\?(?![\w])/.test(cells[cells.length - 1] ?? ""),
  };
}

/** Ordering is enforced from this R-number on (rule e). Earlier rows are unchecked history. */
const R_ORDER_FLOOR = 269;

function lintRNumbers(ledgerText, exempt = readLaneLocalRows(ledgerText)) {
  const failures = [];
  let orderStarted = false;
  let prevOrdered = null; // { n, id } of the last numbered row once ordering has started
  const exempted = [];
  const frozen = new Set();
  const cited = new Map(); // n -> [row ids]
  const unassigned = []; // row ids still carrying the R? placeholder
  for (const line of ledgerText.split("\n")) {
    const prefix = line.match(ROW_ID_PREFIX_RE);
    if (!prefix) continue;
    const id = prefix[1];
    if (/^\d+$/.test(id)) frozen.add(Number(id));
    const cells = rowCells(line);
    const body = cells[3] ?? "";
    const last = cells[cells.length - 1] ?? "";
    const head = body.match(/^\*\*R(\d+|\?) —/);
    const cite = last.match(/^numeric citation R(\d+|\?)(?![\w])/);
    if (head) {
      if (id in exempt) {
        exempted.push(`${id} (${exempt[id]})`);
      } else if (!cite) {
        failures.push(`Ruling ${id}: opens with R${head[1]} but its last column is not "numeric citation R${head[1]}" (R-rows require the citation column; a genuinely lane-local series is listed under "## Lane-local R numbering").`);
      } else if (cite[1] !== head[1]) {
        failures.push(`Ruling ${id}: heading says R${head[1]} but the citation column says R${cite[1]}.`);
      }
    }
    if (head?.[1] === "?" || cite?.[1] === "?") {
      unassigned.push(id);
      continue;
    }
    if (cite) {
      const n = Number(cite[1]);
      cited.set(n, [...(cited.get(n) ?? []), id]);
      if (!orderStarted && n >= R_ORDER_FLOOR) orderStarted = true;
      if (orderStarted) {
        if (prevOrdered && n <= prevOrdered.n) {
          failures.push(`Out-of-order R-number: ${id} cites R${n} after ${prevOrdered.id} (R${prevOrdered.n}) — from R${R_ORDER_FLOOR} on, rows must ascend in file order (ledger \`2026-10-03-r-number-order\`). Move the row, never renumber a merged one.`);
        }
        prevOrdered = { n, id };
      }
    }
  }
  // The list is only honest while it matches the ledger: a listed row that is gone, or no longer
  // opens with an R heading, is a stale exemption and fails.
  const headed = new Set();
  for (const line of ledgerText.split("\n")) {
    const prefix = line.match(ROW_ID_PREFIX_RE);
    if (prefix && /^\*\*R(\d+|\?) —/.test(rowCells(line)[3] ?? "")) headed.add(prefix[1]);
  }
  for (const id of Object.keys(exempt)) {
    if (!headed.has(id)) failures.push(`Lane-local R list names ${id}, but no ledger row with that id opens with an R heading — remove it from "## Lane-local R numbering".`);
  }
  for (const [n, ids] of cited) {
    if (ids.length > 1) failures.push(`Duplicate R-number R${n} cited by ${ids.length} rows: ${ids.join(", ")}.`);
    if (frozen.has(n)) failures.push(`R${n} (row ${ids.join(", ")}) reuses frozen numeric row id ${n} (ruling 25: never reused).`);
  }
  return { failures, exempted, unassigned, cited };
}

function lintLedger({ ledgerText, workflowText, requireAssigned = false, knownDuplicates = KNOWN_DUPLICATE_IDS, tests = [], reachable = new Set(), workflowFiles = [], jobIds = [], configs = [] }) {
  const failures = [];
  const warnings = [];
  const notes = [];
  const { entries, allIds: ids, malformed } = parseLedger(ledgerText);

  for (const m of malformed) failures.push(`Malformed ledger row (unparseable tag — fix, don't skip): ${m}`);

  // Every id shape, not just numeric: a duplicated date-slug is the same append-only violation,
  // and catching it HERE is the point of the scheme — CI fails instead of a human renumbering.
  const dupes = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  const newDupes = dupes.filter((d) => !Object.prototype.hasOwnProperty.call(knownDuplicates, d));
  if (newDupes.length) failures.push(`Duplicate ruling ids (append-only violated): ${newDupes.join(", ")}`);
  for (const [id, why] of Object.entries(knownDuplicates)) {
    if (dupes.includes(id)) notes.push(`Known duplicate id ${id} (baseline, not a pass): ${why}`);
    else failures.push(`Known-duplicate baseline entry ${id} is no longer duplicated — remove it from KNOWN_DUPLICATE_IDS (the list only shrinks).`);
  }

  if (entries.length === 0) failures.push("No [guarded: ...] entries parsed from the ledger — tag format drifted?");

  const r = lintRNumbers(ledgerText);
  failures.push(...r.failures);
  if (requireAssigned && r.unassigned.length) {
    failures.push(`Unassigned R-number (R?) on ${r.unassigned.length} row(s): ${r.unassigned.join(", ")} — the post-merge stamp (\`node scripts/assign-r-numbers.cjs --stamp\`) numbers \`docs/decisions/pending/\` (ledger \`2026-09-29-r-number-at-merge\`).`);
  }

  const wiring = { workflowText, tests, reachable, workflowFiles, jobIds, configs };
  for (const e of entries) {
    if (e.retiredWith) {
      notes.push(`Ruling ${e.id}: retired with ${e.retiredWith} — surface removed; the row stays as history.`);
      continue;
    }
    if (e.unguardedSince) {
      notes.push(`Ruling ${e.id}: UNGUARDED since ${e.unguardedSince} — re-pin needed.`);
      continue;
    }
    if (e.none) {
      notes.push(`Ruling ${e.id}: [guarded: none …] — the row states it has no guard.`);
      continue;
    }
    if (e.loose && e.guards.length === 0 && !e.deferred) {
      failures.push(`Ruling ${e.id}: [guarded] names no guard (no part of the tag starts with a guard name). Name the guard, or write [guarded: none — <why>].`);
      continue;
    }
    for (const g of e.guards) {
      const inCI = guardIsWired(g, wiring);
      if (inCI) continue;
      if (e.deferred) {
        warnings.push(`Ruling ${e.id}: guard "${g}" not in CI — DEFERRED to lane "${e.deferred}" (must expire when that lane merges).`);
      } else {
        failures.push(`Ruling ${e.id}: guard "${g}" is [guarded] but does not run in CI (no workflow \`run:\` names it, and it is not a reachable test file or a workflow file). Script-only = MISSING (ruling 27).`);
      }
    }
  }
  return { failures, warnings, notes, laneLocal: r.exempted.length, checked: entries.length };
}

function selfTest() {
  // Fixtures are synthetic ledgers: they start from an EMPTY known-duplicate baseline, never the real one.
  const lint = (o) => lintLedger({ knownDuplicates: {}, ...o });
  const ledgerText = [
    "| 1 | 2026-01-01 | [guarded: real-guard] | x | y |",
    "| 2 | 2026-01-01 | [guarded: ghost-guard] | x | y |",
    "| 3 | 2026-01-01 | [guarded: matrix-lint, deferred:some-lane] | x | y |",
    "| 4 | 2026-01-01 | [advisory] | x | y |",
    "| R-A | 2026-01-01 | [advisory] | x |",
    // The date-slug key new rows use — must parse exactly like the numeric series.
    "| 2026-01-01-some-lane | 2026-01-01 | [guarded: real-guard] | x | y |",
  ].join("\n");
  const workflowText = "run: node scripts/real-guard.cjs";
  const { failures, warnings } = lint({ ledgerText, workflowText });
  const ok =
    failures.length === 1 &&
    failures[0].includes("ghost-guard") &&
    warnings.length === 1 &&
    warnings[0].includes("matrix-lint");
  const dupe = lint({ ledgerText: ledgerText + "\n| 2 | 2026-01-01 | [advisory] | x | y |", workflowText });
  const ok2 = dupe.failures.some((f) => f.includes("Duplicate"));
  // §18d fixtures for the date-slug key (the whole point of the scheme).
  // (a) a slug row's [guarded] tag is linted like any other — a ghost guard on it still fails.
  const slugGhost = lint({
    ledgerText: "| 2026-01-01-slug-lane | 2026-01-01 | [guarded: ghost-guard] | x | y |",
    workflowText,
  });
  const ok6 = slugGhost.failures.some((f) => f.includes("2026-01-01-slug-lane") && f.includes("ghost-guard"));
  // (b) a DUPLICATED slug fails, exactly as a duplicated number does. This is the collision the
  //     scheme exists to make impossible-by-construction and CI-caught if it happens anyway.
  const slugDupe = lint({
    ledgerText: ledgerText + "\n| 2026-01-01-some-lane | 2026-01-01 | [advisory] | x | y |",
    workflowText,
  });
  const ok7 = slugDupe.failures.some((f) => f.includes("Duplicate") && f.includes("2026-01-01-some-lane"));
  // (c) a malformed slug row is REJECTED, not silently skipped — same posture as the numeric one.
  const slugBad = lint({
    ledgerText: ledgerText + "\n| 2026-01-01-bad-lane | 2026-01-01 | guarded: naked-tag | x | y |",
    workflowText,
  });
  const ok8 = slugBad.failures.some((f) => f.includes("Malformed"));
  // Negative: guard name only in a comment / job name must NOT count as in-CI.
  const yamlCommentOnly = [
    "jobs:",
    "  real-guard:",
    "    name: real-guard (prose mention of comment-guard)",
    "    steps:",
    "      # comment-guard is mentioned here but never run",
    "      - run: echo hello",
  ].join("\n");
  const runsOnly = require("module") && extractRunCommands(yamlCommentOnly);
  const ok3 = runsOnly.includes("echo hello") && !runsOnly.includes("comment-guard") && !runsOnly.includes("real-guard");
  // Block scalar extraction.
  const yamlBlock = ["      - run: |", "          node scripts/block-guard.cjs", "          echo done", "      - name: after"].join("\n");
  const ok4 = extractRunCommands(yamlBlock).includes("block-guard");
  // Malformed guarded row must FAIL, not be skipped.
  const bad = lint({
    ledgerText: ledgerText + "\n| 9 | 2026-01-01 | guarded: naked-tag | x | y |",
    workflowText,
  });
  const ok5 = bad.failures.some((f) => f.includes("Malformed"));
  // R-number rules (R155). (d) an R-row missing its citation column fails.
  const rNoCite = lintRNumbers("| 2026-01-01-r-lane | 2026-01-01 | [advisory] | **R200 — X.** body | some refs |", {});
  const ok9 = rNoCite.failures.some((f) => f.includes("R200") && f.includes("citation"));
  // (e) a mismatched heading/citation fails.
  const rMismatch = lintRNumbers("| 2026-01-01-r-lane | 2026-01-01 | [advisory] | **R200 — X.** body | numeric citation R201; refs |", {});
  const ok10 = rMismatch.failures.some((f) => f.includes("R200") && f.includes("R201"));
  // (f) the same R-number on two rows fails.
  const rDupe = lintRNumbers([
    "| 2026-01-01-a | 2026-01-01 | [advisory] | **R200 — A.** | numeric citation R200 |",
    "| 2026-01-02-b | 2026-01-02 | [advisory] | **R200 — B.** | numeric citation R200 |",
  ].join("\n"), {});
  const ok11 = rDupe.failures.some((f) => f.includes("Duplicate R-number R200"));
  // (g) an R-number reusing a frozen numeric row id fails.
  const rFrozen = lintRNumbers([
    "| 7 | 2026-01-01 | [advisory] | frozen row | refs |",
    "| 2026-01-02-b | 2026-01-02 | [advisory] | **R7 — B.** | numeric citation R7 |",
  ].join("\n"), {});
  const ok12 = rFrozen.failures.some((f) => f.includes("frozen numeric row id 7"));
  // (h) a well-formed R-row passes; an exempt lane-local row is reported, not failed.
  const rGood = lintRNumbers([
    "## Lane-local R numbering",
    "- `2026-01-02-local` — some lane R3",
    "## Next",
    "| 2026-01-01-a | 2026-01-01 | [advisory] | **R200 — A.** | numeric citation R200; refs |",
    "| 2026-01-02-local | 2026-01-02 | [advisory] | **R3 — LOCAL.** | lane refs |",
  ].join("\n"));
  // (i) a stale exemption (listed row is gone) fails.
  const rStale = lintRNumbers(["## Lane-local R numbering", "- `2026-01-09-gone` — some lane R9", ""].join("\n"));
  const ok13 = rGood.failures.length === 0 && rGood.exempted.length === 1
    && rStale.failures.some((f) => f.includes("2026-01-09-gone"));
  // (j) an R? row passes and is reported unassigned; a half-placeholder (R? heading, numbered
  // citation) fails; two R? rows never collide.
  const rQ = lintRNumbers([
    "| 2026-01-03-q | 2026-01-03 | [advisory] | **R? — Q.** | numeric citation R?; refs |",
    "| 2026-01-04-q2 | 2026-01-04 | [advisory] | **R? — Q2.** | numeric citation R? |",
  ].join("\n"), {});
  const rHalf = lintRNumbers("| 2026-01-05-h | 2026-01-05 | [advisory] | **R? — H.** | numeric citation R300 |", {});
  const ok14 = rQ.failures.length === 0 && rQ.unassigned.length === 2 && rHalf.failures.some((f) => f.includes("R?") && f.includes("R300"));
  // (k) --require-assigned turns an R? row into a failure.
  const qLedger = ledgerText + "\n| 2026-01-06-q | 2026-01-06 | [advisory] | **R? — Q.** | numeric citation R? |";
  const ok15 = lint({ ledgerText: qLedger, workflowText }).failures.length === lint({ ledgerText, workflowText }).failures.length
    && lint({ ledgerText: qLedger, workflowText, requireAssigned: true }).failures.some((f) => f.includes("Unassigned R-number"));
  // (l) ORDER: the exact sequence that once passed (R274, R273, R270, R269, R271, R272) now fails;
  // the ascending sequence passes; rows below the floor that precede it are unchecked history; an R?
  // row between numbered rows is skipped.
  const row = (slug, n) => `| 2026-01-01-${slug} | 2026-01-01 | [advisory] | **R${n} — X.** | numeric citation R${n} |`;
  const rBad = lintRNumbers([274, 273, 270, 269, 271, 272].map((n) => row(`o${n}`, n)).join("\n"), {});
  const rAsc = lintRNumbers([200, 150, 269, 270, "?", 271, 272].map((n) => row(`a${n}`, n)).join("\n"), {});
  const rLate = lintRNumbers([269, 271, 270].map((n) => row(`l${n}`, n)).join("\n"), {});
  const ok16 = rBad.failures.filter((f) => f.startsWith("Out-of-order")).length === 3
    && rAsc.failures.length === 0
    && rLate.failures.some((f) => f.includes("R270") && f.includes("R271"));
  // (m) ledger-dupes lane: a duplicate whose tag cell carries TEXT AFTER THE TAG (the shape most rows
  // have, which the old parse never saw), and a copy differing only in its R-number, both fail; a known
  // baseline id is reported, not failed; a baseline id that is no longer duplicated fails (it only shrinks).
  const tail = (r) => `| 2026-01-07-feat | 2026-01-07 | [guarded: real-guard] (note after the tag) | **${r} — F.** | numeric citation ${r} |`;
  const textDupe = lint({ ledgerText: [tail("R301"), tail("R301")].join("\n"), workflowText, knownDuplicates: {} });
  const rOnlyDupe = lint({ ledgerText: [tail("R301"), tail("R?")].join("\n"), workflowText, knownDuplicates: {} });
  const known = lint({ ledgerText: [tail("R301"), tail("R?")].join("\n"), workflowText, knownDuplicates: { "2026-01-07-feat": "fixture" } });
  const stale = lint({ ledgerText: tail("R301"), workflowText, knownDuplicates: { "2026-01-07-feat": "fixture" } });
  const ok17 = textDupe.failures.some((f) => f.includes("Duplicate ruling ids") && f.includes("2026-01-07-feat"))
    && rOnlyDupe.failures.some((f) => f.includes("Duplicate ruling ids") && f.includes("2026-01-07-feat"))
    && !known.failures.some((f) => f.includes("Duplicate ruling ids")) && known.notes.some((n) => n.includes("2026-01-07-feat"))
    && stale.failures.some((f) => f.includes("no longer duplicated"));
  // (n) GW-1: a [guarded:] tag with TEXT AFTER IT is checked like any other. A ghost guard fails; a
  // reachable test file, a job id, a workflow named without its extension and a file a runner config
  // names all pass; prose parts name nothing; a row naming no guard fails; `none …` and
  // `[unguarded since Rn — re-pin needed]` are reported, not failed; `[tested: …]` stays unread.
  const loose = (id, tag) => `| 2026-02-01-${id} | 2026-02-01 | ${tag} (a note after the tag) | x | y |`;
  const wiring = {
    tests: ["server/__tests__/reached.test.ts", "server/__tests__/orphan.test.ts", "client/src/lib/__tests__/named.test.ts", "server/__tests__/cfg.vitest.ts"],
    reachable: new Set(["server/__tests__/reached.test.ts", "client/src/lib/__tests__/named.test.ts"]),
    workflowFiles: ["some-gate.yml"],
    jobIds: ["some-job"],
    configs: [{ file: "vitest.cfg.ts", text: 'include: ["server/__tests__/cfg.vitest.ts"]' }],
  };
  const gw = (tag) => lint({ ledgerText: loose("g", tag), workflowText, ...wiring });
  const gwPass = [
    "[guarded: real-guard]",
    "[guarded: server/__tests__/reached.test.ts T1–T4 (whole-directory job)]",
    "[guarded: named (by basename, no suffix); some-job; some-gate]",
    "[guarded: some-gate.yml, server/__tests__/cfg.vitest.ts]",
    "[guarded: real-guard, both wired into `build.yml`]",
  ].every((t) => gw(t).failures.length === 0);
  const gwFail = [
    "[guarded: ghost-guard]",
    "[guarded: server/__tests__/orphan.test.ts]",
    "[guarded: server/__tests__/deleted.test.ts]",
    "[guarded: verified by hand]",
  ].every((t) => gw(t).failures.length === 1);
  const gwNone = gw("[guarded: none — and that is the finding]");
  const gwUng = gw("[unguarded since R354 — re-pin needed]");
  const gwRet = gw("[retired with R354 — surface removed]");
  const gwTested = lint({ ledgerText: [loose("g", "[guarded: real-guard]"), loose("t", "[tested: `x.test.ts` — 5 proofs]")].join("\n"), workflowText, ...wiring });
  const ok18 = gwPass && gwFail
    && gwNone.failures.length === 0 && gwNone.notes.some((n) => n.includes("no guard"))
    && gwUng.failures.length === 0 && gwUng.notes.some((n) => n.includes("UNGUARDED since R354"))
    && gwRet.failures.length === 0 && gwRet.notes.some((n) => n.includes("retired with R354"))
    && gwTested.failures.length === 0;
  // (o) a dotted slug is a row id (`2026-08-31-landing-v2.5-close-out`); a registry line is not.
  const ok19 = ROW_ID_PREFIX_RE.test("| 2026-08-31-landing-v2.5-close-out | 2026-08-31 | [advisory] | x | y |")
    && !ROW_ID_PREFIX_RE.test("| no conflict markers in tracked files | x |");
  if (!ok || !ok2 || !ok3 || !ok4 || !ok5 || !ok6 || !ok7 || !ok8 || !ok9 || !ok10 || !ok11 || !ok12 || !ok13 || !ok14 || !ok15 || !ok16 || !ok17 || !ok18 || !ok19) {
    console.error("SELF-TEST FAILED", {
      ok, ok2, ok3, ok4, ok5, ok6, ok7, ok8, ok9, ok10, ok11, ok12, ok13, ok14, ok15, ok16, ok17, ok18, ok19, gwPass, gwFail,
      textDupe: textDupe.failures, rOnlyDupe: rOnlyDupe.failures, known: known.failures, stale: stale.failures, rBad: rBad.failures, rAsc: rAsc.failures, rLate: rLate.failures,
      failures, warnings, dupe: dupe.failures, bad: bad.failures,
      slugGhost: slugGhost.failures, slugDupe: slugDupe.failures, slugBad: slugBad.failures,
    });
    process.exit(1);
  }
  console.log("self-test OK (comment/job-name negatives, block scalars, malformed rows, date-slug ids incl. duplicate + malformed + a dotted slug, R-number citation/duplicate/frozen-reuse, lane-local list incl. stale, R? placeholder + --require-assigned, R-number order from the floor, duplicate ids on rows with text after the tag + R-only copies + printed shrinking baseline, [guarded:] tags with text after them incl. reachable tests, job ids, runner configs, prose parts, none, retired and unguarded)");
  process.exit(0);
}

module.exports = {
  lintRNumbers,
  rowCells,
  readLaneLocalRows,
  ROW_ID_PREFIX_RE,
  KNOWN_DUPLICATE_IDS,
  isPlaceholderRow,
  placeholderSides,
  ID_ALT,
};
if (require.main !== module) return;

if (process.argv.includes("--self-test")) selfTest();

const { assembleLedgerText } = require("./ledger-files.cjs");
const ledgerText = assembleLedgerText();
const workflowText = collectWorkflowText(WORKFLOW_DIR);
const requireAssigned = process.argv.includes("--require-assigned");
const wired = require("./check-test-files-wired.cjs");
// The wiring script's own test set, plus the two kinds it does not collect: `e2e/` specs and
// `*.vitest.ts` files. The inventory decides their reachability by the same predicate.
const tests = [...wired.collectTests(), ...wired.collectTests(ROOT, ["e2e"])];
for (const dir of ["server", "shared", "client"]) {
  (function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.vitest\.tsx?$/.test(ent.name)) tests.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  })(path.join(ROOT, dir));
}
const reachable = new Set(
  wired.inventory({
    tests,
    workflowCommands: wired.workflowCommands(),
    packageScripts: JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts || {},
  }).reachable,
);
const workflowFiles = fs.readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));
const jobIds = workflowFiles.flatMap((f) => {
  const text = fs.readFileSync(path.join(WORKFLOW_DIR, f), "utf8");
  const jobs = text.split(/^jobs:\s*$/m)[1] || "";
  return [...jobs.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
});
const configs = [...new Set([...workflowText.matchAll(/(?:--config|-c)[ =](\S+)/g)].map((m) => m[1]))]
  .filter((c) => fs.existsSync(path.join(ROOT, c)))
  .map((c) => ({ file: c, text: fs.readFileSync(path.join(ROOT, c), "utf8") }));
const { failures, warnings, notes, laneLocal, checked } = lintLedger({ ledgerText, workflowText, requireAssigned, tests, reachable, workflowFiles, jobIds, configs });

for (const n of notes) console.warn(`NOTE  ${n}`);
for (const w of warnings) console.warn(`WARN  ${w}`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  process.exit(1);
}
console.log(`decision-guards lint OK (${checked} [guarded]/[unguarded] row(s) checked; ${warnings.length} deferred warning(s); ${laneLocal} lane-local R row(s) per "## Lane-local R numbering")`);
