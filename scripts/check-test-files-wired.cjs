#!/usr/bin/env node
/**
 * CI test-file reachability inventory — AND THE RATCHET OVER IT.
 *
 * THE RATCHET (ruled 2026-09-15, ledger `2026-09-15-orphan-ratchet`; punchlist D-44)
 * `scripts/test-orphan-baseline.txt` records EXACTLY the orphan set of the day it was
 * written. It is RECORDED DEBT, NOT AN ALLOWLIST: a listed suite is still owed
 * repair-or-delete under `2026-09-14-test-files-wired-orphans` ("a suite leaves the
 * orphan list by being RUN, or by being GONE — never by being named an exception").
 * The normal scan compares the live orphan set against that file and EXITS 1 on
 * either direction of drift:
 *   (a) an orphan that is NOT in the baseline  -> NEW ORPHAN;
 *   (b) a baseline path that is now REACHABLE,
 *       or that no longer exists               -> STALE BASELINE ENTRY.
 * So the file can only ever SHRINK, and the recorded debt is always true — it can
 * neither quietly grow nor quietly rot. The full orphan inventory is still printed
 * on every run, exactly as before.
 *
 * UNDERSTOOD INVOCATION SHAPES
 * - `tsx --test <file|directory|glob>` (including `npx tsx` and env prefixes)
 * - `node --test <file|directory|glob>`
 * - `vitest run <file|directory|glob>` (including `npx vitest`)
 * - `playwright test [file|directory|glob|path-substring]`, `--project`, and
 *   `-c|--config <config>`; a selector-free invocation reaches the config's
 *   statically declared `testDir`/`testMatch`
 * - direct paths, directory prefixes, basic shell globs (`*`, `**`, `?`)
 * - `npm test`, `npm run <script>`, and recursively referenced npm scripts
 * - YAML inline and block-scalar `run:` commands, shell continuations, and
 *   multiple commands separated by newlines, `&&`, `||`, `;`, `|` or a redirect
 *
 * WHAT COUNTS AS AN INVOCATION (the 2026-09-15 repair — see CANNOT DETECT)
 * A selector is read ONLY from a command segment whose LEADING command is a
 * runner. A `run:` block is split into lines; heredoc bodies and `#` comment
 * lines are dropped; each line is split at top-level `&&`, `||`, `;`, `|`,
 * `<`, `>`, `>>`, `(` and `)` with quotes respected; leading `NAME=value`
 * assignments and wrapper commands (`npx`, `pnpm`, `yarn`, `env`, `time`, …)
 * are skipped to find that leading command. A runner name appearing anywhere
 * else — inside an `echo`/`printf` string, a `::error::` annotation, a comment
 * or a heredoc — yields NO selectors.
 *
 * CANNOT DETECT
 * - generated/eval'd commands, shell variables that contain selectors, custom
 *   test launchers, reusable workflows/actions, matrix-expanded selectors, or
 *   test discovery changed at runtime
 * - config values that are computed rather than literal `testDir`/`testMatch`
 * - shell glob features beyond `*`, `**`, and `?`
 * - PROSE THAT NAMES A RUNNER WAS A BLIND SPOT UNTIL 2026-09-15 (V-30). A
 *   failure-summary `echo` containing "npx tsx --test server/__tests__/<file>"
 *   was parsed as a real invocation, and the sentence's later words — among
 *   them the bare noun `server` — became directory-prefix selectors, so every
 *   suite under `server/` read as reachable (477/507 reachable, 30 orphans;
 *   the truth was 274 reachable, 233 orphans). The parser now ASSUMES a
 *   selector appears only in a real invocation, on a line that is not an
 *   echo/printf/annotation/comment/heredoc body, at the head of its own
 *   command segment. That assumption is the predicate: a runner invoked
 *   through a shell construct this tokenizer does not model (an `eval`, a
 *   `$(...)` substitution, a `for`-loop body written on one line after `do`)
 *   is NOT read, and its selectors are missed rather than invented.
 * - A BARE DIRECTORY-PREFIX SELECTOR MUST NAME A DIRECTORY THAT EXISTS in the
 *   repository, which removes prose nouns (`against`, `local`, `dev`) but NOT
 *   a real root name such as `server`. It is a second filter, not the fix:
 *   the invocation-position rule above is what removes `server`.
 * - `TEST_ROOTS` IS `server`, `shared`, `client`, `playwright` — `e2e/` IS NOT
 *   SCANNED, so no `e2e/` spec is counted as reachable OR as an orphan (the
 *   ten `e2e/specs/*.spec.ts` files are invisible to this inventory). They do
 *   have a real, schedule-only CI reach through `playwright.e2e.config.ts`'s
 *   `testDir` (`npm run test:e2e:staging`), so adding the root would move both
 *   the numerator and the denominator. RULED 2026-09-15 (`2026-09-15-orphan-ratchet`):
 *   the root STAYS OUT and the limit stays STATED — widening the inventory is a
 *   decision about what it MEASURES, and the ratchet does not make it. An `e2e/`
 *   spec is therefore invisible to the ratchet as well: it can be added, wired or
 *   orphaned without this guard noticing either way.
 * - THE RATCHET DOES NOT MAKE A BASELINE ROW ACCEPTABLE. It catches exactly two
 *   things — a NEW unreachable test file, and a baseline row that has gone stale
 *   (wired, or deleted). It says nothing about the 233 rows it carries: each is
 *   still an unrun suite, still owed repair-or-delete, and a green run here means
 *   only that the debt did not grow. It also cannot see a suite reached through a
 *   construct the tokenizer does not model (see the two entries above), so a
 *   "NEW ORPHAN" line can in principle be a file this parser simply cannot follow;
 *   the answer to that is to make the invocation legible, never to list the file
 *   in the baseline.
 *
 * `--self-test` is the predicate gate: it proves BOTH the reachability reader and
 * the ratchet comparison, and exits nonzero on a broken fixture. The 2026-09-13
 * advisory exit-0 posture is GONE as of the ratchet — the scan exits 1 on drift —
 * but nothing about WHAT the scan measures changed with it.
 *
 * Node built-ins only. Self-test: node scripts/check-test-files-wired.cjs --self-test
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");
const TEST_ROOTS = ["server", "shared", "client", "playwright"];
const BASELINE_PATH = path.join(ROOT, "scripts", "test-orphan-baseline.txt");
const BASELINE_REL = "scripts/test-orphan-baseline.txt";
const TEST_RE = /\.(?:test\.ts|test\.tsx|spec\.ts)$/;

/** Commands that merely wrap another command; the runner is what follows. */
const WRAPPERS = new Set([
  "npx", "pnpm", "yarn", "bun", "bunx", "exec", "env", "time", "sudo",
  "xvfb-run", "cross-env", "dotenv", "command", "--",
]);
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
const RUNNERS = new Set(["tsx", "node", "vitest", "playwright"]);

function posix(value) {
  return value.replaceAll(path.sep, "/").replace(/^\.\//, "");
}

function walk(dir, predicate, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate, base));
    else if (predicate(full)) out.push(posix(path.relative(base, full)));
  }
  return out;
}

function collectTests(root = ROOT, roots = TEST_ROOTS) {
  return roots
    .flatMap((dir) =>
      walk(path.join(root, dir), (file) => TEST_RE.test(file), root),
    )
    .sort();
}

function extractRunCommands(yamlText) {
  const commands = [];
  const lines = yamlText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!match) continue;
    const [, indent, rest] = match;
    const value = rest.trim();
    if (!["", "|", ">", "|-", ">-"].includes(value)) {
      commands.push(value.replace(/\s+#.*$/, ""));
      continue;
    }
    const block = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) {
        block.push("");
        continue;
      }
      const leading = lines[j].match(/^(\s*)/)[1].length;
      if (leading <= indent.length) break;
      block.push(lines[j].trim());
    }
    commands.push(block.join("\n"));
  }
  return commands;
}

function shellWords(text) {
  const words = [];
  const re = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  let match;
  while ((match = re.exec(text))) words.push(match[1] ?? match[2] ?? match[3]);
  return words;
}

/**
 * Drop heredoc bodies and comment lines, join shell continuations, and return
 * the remaining executable lines of a `run:` script.
 */
function scriptLines(command) {
  const joined = command.replace(/\\[ \t]*\n[ \t]*/g, " ");
  const out = [];
  let heredoc = null;
  for (const raw of joined.split("\n")) {
    const line = raw.trim();
    if (heredoc !== null) {
      if (line === heredoc) heredoc = null;
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const opener = line.match(/<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (opener) {
      heredoc = opener[2];
      continue;
    }
    out.push(line);
  }
  return out;
}

/** Split one shell line at top-level control operators, respecting quotes. */
function splitSegments(line) {
  const segments = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\" && quote === '"') {
        current += ch + (line[++i] ?? "");
        continue;
      }
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "\\") {
      current += ch + (line[++i] ?? "");
      continue;
    }
    if (ch === "&" || ch === "|" || ch === ";" || ch === ">" || ch === "<" || ch === "(" || ch === ")") {
      segments.push(current);
      current = "";
      if ((ch === "&" || ch === "|" || ch === ">") && line[i + 1] === ch) i++;
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

function commandSegments(command) {
  return scriptLines(command).flatMap((line) => splitSegments(line));
}

/** The first token that is a command name, skipping assignments and wrappers. */
function commandHead(words) {
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (ASSIGNMENT_RE.test(word)) continue;
    if (WRAPPERS.has(word)) continue;
    return { name: word, index: i };
  }
  return null;
}

function globRegex(glob) {
  let out = "^";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
        continue;
      }
      out += ".*";
      i++;
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else out += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${out}$`);
}

function realDirExists(root) {
  return (candidate) => {
    const full = path.resolve(root, candidate);
    if (!full.startsWith(root)) return false;
    try {
      return fs.statSync(full).isDirectory();
    } catch {
      return false;
    }
  };
}

function selectorMatches(file, selector, kind, dirExists = () => true) {
  const clean = posix(selector.replace(/^[("'`]+|[)"'`,]+$/g, ""));
  if (!clean || clean === ".") return true;
  if (clean.includes("*") || clean.includes("?")) return globRegex(clean).test(file);
  if (file === clean) return true;
  const asDir = clean.replace(/\/$/, "");
  if (file.startsWith(asDir + "/") && dirExists(asDir)) return true;
  // Playwright treats non-option arguments as regular expressions matched
  // against the complete test-file path.
  if (kind === "playwright") {
    try {
      return new RegExp(clean).test(file);
    } catch {
      return file.includes(clean);
    }
  }
  return false;
}

function literalPlaywrightConfig(configPath, root) {
  const relative = posix(configPath || "playwright.config.ts");
  const full = path.resolve(root, relative);
  if (!fs.existsSync(full)) return { testDir: "playwright/tests", testMatches: [] };
  const source = fs.readFileSync(full, "utf8");
  const configDir = path.dirname(relative);
  const dirMatch = source.match(/\btestDir\s*:\s*["']([^"']+)["']/);
  const testDir = dirMatch
    ? posix(path.normalize(path.join(configDir, dirMatch[1])))
    : "playwright/tests";
  const matches = [];
  const scalar = source.match(/\btestMatch\s*:\s*["']([^"']+)["']/);
  if (scalar) matches.push(scalar[1]);
  const array = source.match(/\btestMatch\s*:\s*\[([\s\S]*?)\]/);
  if (array) {
    for (const item of array[1].matchAll(/["']([^"']+)["']/g)) matches.push(item[1]);
  }
  return { testDir, testMatches: matches };
}

function parseRunner(tokens) {
  const head = commandHead(tokens);
  if (!head || !RUNNERS.has(head.name)) return null;
  const kind = head.name;
  const args = tokens.slice(head.index + 1);
  if ((kind === "tsx" || kind === "node") && !args.includes("--test")) return null;
  if (kind === "vitest" && args[0] !== "run") return null;
  if (kind === "playwright" && args[0] !== "test") return null;
  return { kind, args: kind === "tsx" || kind === "node" ? args : args.slice(1) };
}

function runnerSelectors(parsed) {
  const selectors = [];
  let config = null;
  const valueOptions = new Set([
    "-c", "--config", "--project", "--workers", "--max-workers", "--grep",
    "--grep-invert", "--reporter", "--shard", "--repeat-each", "--retries",
    "--test-timeout", "--timeout", "--root", "--loader", "--import",
    "--require", "-r",
  ]);
  for (let i = 0; i < parsed.args.length; i++) {
    const arg = parsed.args[i];
    if (arg === "--test" || arg === "run") continue;
    if (arg === "-c" || arg === "--config") {
      config = parsed.args[++i] || null;
      continue;
    }
    if (arg.startsWith("--config=")) {
      config = arg.slice("--config=".length);
      continue;
    }
    if (valueOptions.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith("-") || arg.includes("$")) continue;
    selectors.push(arg);
  }
  return { selectors, config };
}

function inventory({ root = ROOT, tests, workflowCommands, packageScripts, dirExists }) {
  const isDir = dirExists || realDirExists(root);
  const reachable = new Set();
  const pending = [...workflowCommands];
  const seenScripts = new Set();

  while (pending.length) {
    for (const segment of commandSegments(pending.shift())) {
      const words = shellWords(segment);
      const head = commandHead(words);
      if (head && head.name === "npm") {
        const action = words[head.index + 1];
        const script =
          action === "test" ? "test" : action === "run" ? words[head.index + 2] : null;
        if (script && packageScripts[script] && !seenScripts.has(script)) {
          seenScripts.add(script);
          pending.push(packageScripts[script]);
        }
      }

      const parsed = parseRunner(words);
      if (!parsed) continue;
      const { selectors, config } = runnerSelectors(parsed);
      let effective = selectors;
      let playwrightConfig = null;
      if (parsed.kind === "playwright") {
        playwrightConfig = literalPlaywrightConfig(config, root);
        if (!effective.length) effective = [playwrightConfig.testDir];
      }
      for (const file of tests) {
        if (!effective.some((selector) => selectorMatches(file, selector, parsed.kind, isDir))) continue;
        if (playwrightConfig?.testMatches.length) {
          const withinDir = posix(path.relative(playwrightConfig.testDir, file));
          // testMatch is matched against a path RELATIVE to testDir, which is not
          // a repository path, so the directory-existence filter does not apply.
          if (!playwrightConfig.testMatches.some((match) => selectorMatches(withinDir, match, "tsx"))) continue;
        }
        reachable.add(file);
      }
    }
  }

  return {
    reachable: [...reachable].sort(),
    orphans: tests.filter((file) => !reachable.has(file)),
  };
}

/**
 * Read the recorded-debt baseline: one repo-relative path per line, `#` comments
 * and blank lines ignored. Order is irrelevant to the comparison (the file is kept
 * sorted for readability and diff sanity).
 */
function readBaseline(file = BASELINE_PATH) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

/**
 * Compare the live inventory against the recorded debt. PURE — no file system, no
 * process exit; the caller decides what to do with the two lists.
 *
 * A baseline entry is STALE when it is no longer an orphan, for either reason:
 * the suite is now reachable (someone wired it — the debt shrank and the file must
 * say so), or it is no longer in the inventory at all (deleted, renamed, or moved
 * out of `TEST_ROOTS`). Both must be removed in the same PR that caused them.
 */
function ratchet({ tests, reachable, orphans, baseline }) {
  const baselineSet = new Set(baseline);
  const orphanSet = new Set(orphans);
  const reachableSet = new Set(reachable);
  const testSet = new Set(tests);

  const newOrphans = orphans.filter((file) => !baselineSet.has(file));
  const stale = [];
  for (const entry of baseline) {
    if (orphanSet.has(entry)) continue;
    stale.push({
      path: entry,
      reason: reachableSet.has(entry)
        ? "now REACHABLE from a workflow command"
        : testSet.has(entry)
          ? "no longer an orphan"
          : "no longer EXISTS in the test inventory",
    });
  }
  return { newOrphans, stale };
}

function workflowCommands(dir = WORKFLOW_DIR) {
  return walk(dir, (file) => /\.ya?ml$/.test(file))
    .flatMap((file) => extractRunCommands(fs.readFileSync(path.join(dir, file), "utf8")));
}

function selfTest() {
  const tests = [
    "server/direct.test.ts",
    "server/__tests__/prose-only.test.ts",
    "shared/directory/covered.test.ts",
    "client/unreferenced.test.ts",
  ];
  // Synthetic tree: every ancestor directory of a fixture test file "exists".
  const dirs = new Set();
  for (const file of tests) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const dirExists = (candidate) => dirs.has(candidate);

  const cases = [
    {
      // Baseline (the original two fixtures): a direct file selector and a
      // directory selector are both reachable; an unreferenced test is an orphan.
      name: "direct file + directory reachability, unreferenced orphan",
      commands: [
        "npx tsx --test server/direct.test.ts",
        "npx vitest run shared/directory",
      ],
      reachable: ["server/direct.test.ts", "shared/directory/covered.test.ts"],
      orphans: ["server/__tests__/prose-only.test.ts", "client/unreferenced.test.ts"],
    },
    {
      // V-30 (a): a runner named only inside an echo string yields NO selectors.
      // This is the `publish-gate-and-fundamentals-gate.yml` failure-summary line:
      // the sentence's bare noun `server` must not become a directory prefix.
      name: "prose echo naming a runner yields no selectors",
      commands: [
        'echo "One or more suites failed. Run solo: npx tsx --test server/__tests__/<file> against a local dev server for reproduction." >> "$GITHUB_STEP_SUMMARY"',
      ],
      reachable: [],
      orphans: tests,
    },
    {
      // V-30 (b): a REAL invocation followed by `&& echo "…tsx --test server…"`
      // contributes its own selector and nothing from the echo.
      name: "real invocation plus trailing prose echo yields only the real selector",
      commands: [
        'npx tsx --test server/direct.test.ts && echo "rerun with npx tsx --test server/__tests__/<file>"',
      ],
      reachable: ["server/direct.test.ts"],
      orphans: [
        "server/__tests__/prose-only.test.ts",
        "shared/directory/covered.test.ts",
        "client/unreferenced.test.ts",
      ],
    },
    {
      // V-30 (c): the same shape as (a) in the other two prose carriers — a
      // `::error::` annotation and a `#` comment line inside a block scalar.
      name: "annotation and comment lines yield no selectors",
      commands: [
        '::error::rerun npx tsx --test server locally\n# npx vitest run shared/directory',
      ],
      reachable: [],
      orphans: tests,
    },
    {
      // V-30 (d): a heredoc body that contains a runner line is data, not a command.
      name: "heredoc body yields no selectors",
      commands: [
        "cat > /tmp/x.yml <<'YAML'\nrun: npx tsx --test server/direct.test.ts\nYAML",
      ],
      reachable: [],
      orphans: tests,
    },
    {
      // A bare selector that names no existing directory matches nothing, even
      // when it is a prefix-shaped word.
      name: "non-existent directory prefix matches nothing",
      commands: ["npx tsx --test nosuchdir"],
      reachable: [],
      orphans: tests,
    },
    {
      // Redirections and pipes end the selector list.
      name: "redirect target is not a selector",
      commands: ["npx tsx --test server/direct.test.ts > /tmp/out.log 2>&1 | tail -5"],
      reachable: ["server/direct.test.ts"],
      orphans: [
        "server/__tests__/prose-only.test.ts",
        "shared/directory/covered.test.ts",
        "client/unreferenced.test.ts",
      ],
    },
  ];

  // RATCHET fixtures (2026-09-15, `2026-09-15-orphan-ratchet`). The comparison is
  // pure, so these need no file system: each case states an inventory outcome and a
  // baseline, and asserts exactly which of the two failure lists is non-empty.
  // `wired` is the tree AFTER someone wired `client/unreferenced.test.ts`.
  const allOrphans = [
    "server/direct.test.ts",
    "server/__tests__/prose-only.test.ts",
    "shared/directory/covered.test.ts",
    "client/unreferenced.test.ts",
  ];
  const wiredReachable = ["client/unreferenced.test.ts"];
  const wiredOrphans = allOrphans.filter((file) => file !== "client/unreferenced.test.ts");

  const ratchetCases = [
    {
      // The steady state: the baseline names exactly today's orphans. Debt did not
      // grow, no row went stale, the run is green.
      name: "ratchet — unchanged inventory passes",
      tests,
      reachable: [],
      orphans: allOrphans,
      baseline: allOrphans,
      newOrphans: [],
      stale: [],
    },
    {
      // A test file that no workflow reaches and the baseline does not carry. This
      // is the whole point of the ratchet: the debt may not grow silently.
      name: "ratchet — a NEW orphan fails",
      tests,
      reachable: [],
      orphans: allOrphans,
      baseline: allOrphans.filter((file) => file !== "client/unreferenced.test.ts"),
      newOrphans: ["client/unreferenced.test.ts"],
      stale: [],
    },
    {
      // Someone wired a baseline suite but left the line in place. The debt list is
      // now a lie in the flattering direction, so it fails until the line is removed.
      name: "ratchet — a baseline entry that became REACHABLE fails",
      tests,
      reachable: wiredReachable,
      orphans: wiredOrphans,
      baseline: allOrphans,
      newOrphans: [],
      stale: ["client/unreferenced.test.ts"],
    },
    {
      // Someone deleted a baseline suite and left the line in place. Same failure,
      // the other honest exit from the orphan list (`2026-09-14-test-files-wired-orphans`).
      name: "ratchet — a baseline entry whose file is GONE fails",
      tests: tests.filter((file) => file !== "client/unreferenced.test.ts"),
      reachable: [],
      orphans: wiredOrphans,
      baseline: allOrphans,
      newOrphans: [],
      stale: ["client/unreferenced.test.ts"],
    },
    {
      // The only way the file is meant to move: a suite was wired AND its line was
      // removed in the same change. The ratchet is silent — it never blocks a shrink.
      name: "ratchet — a correctly shrunk baseline passes",
      tests,
      reachable: wiredReachable,
      orphans: wiredOrphans,
      baseline: wiredOrphans,
      newOrphans: [],
      stale: [],
    },
  ];

  let failed = 0;
  for (const testCase of cases) {
    const result = inventory({
      root: ROOT,
      tests,
      workflowCommands: testCase.commands,
      packageScripts: {},
      dirExists,
    });
    const ok =
      JSON.stringify(result.reachable) === JSON.stringify([...testCase.reachable].sort()) &&
      JSON.stringify(result.orphans) === JSON.stringify(testCase.orphans);
    if (!ok) {
      failed++;
      console.error(`SELF-TEST FAILED: ${testCase.name}`, {
        result,
        expectedReachable: [...testCase.reachable].sort(),
        expectedOrphans: testCase.orphans,
      });
    } else {
      console.log(`self-test OK — ${testCase.name}`);
    }
  }

  for (const testCase of ratchetCases) {
    const result = ratchet({
      tests: testCase.tests,
      reachable: testCase.reachable,
      orphans: testCase.orphans,
      baseline: testCase.baseline,
    });
    const ok =
      JSON.stringify(result.newOrphans) === JSON.stringify(testCase.newOrphans) &&
      JSON.stringify(result.stale.map((entry) => entry.path)) === JSON.stringify(testCase.stale);
    if (!ok) {
      failed++;
      console.error(`SELF-TEST FAILED: ${testCase.name}`, {
        result,
        expectedNewOrphans: testCase.newOrphans,
        expectedStale: testCase.stale,
      });
    } else {
      console.log(`self-test OK — ${testCase.name}`);
    }
  }

  const total = cases.length + ratchetCases.length;
  if (failed) {
    console.error(`SELF-TEST FAILED: ${failed} of ${total} fixture(s)`);
    process.exit(1);
  }
  console.log(
    `self-test OK (${total}/${total} fixtures — ${cases.length} reachability, ${ratchetCases.length} ratchet)`,
  );
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const tests = collectTests();
const result = inventory({
  tests,
  workflowCommands: workflowCommands(),
  packageScripts: packageJson.scripts || {},
});

console.log(`test-files-wired: ${result.reachable.length}/${tests.length} reachable; ${result.orphans.length} orphan(s)`);
for (const orphan of result.orphans) console.log(`ORPHAN ${orphan}`);

if (!fs.existsSync(BASELINE_PATH)) {
  console.error(
    `\nMISSING BASELINE: ${BASELINE_REL} does not exist. It is the recorded orphan debt this guard ratchets against; restore it rather than deleting it.`,
  );
  process.exit(1);
}

const baseline = readBaseline();
const drift = ratchet({
  tests,
  reachable: result.reachable,
  orphans: result.orphans,
  baseline,
});

for (const file of drift.newOrphans) {
  console.error(`NEW ORPHAN (unreachable test file not in the baseline) ${file}`);
}
for (const entry of drift.stale) {
  console.error(
    `STALE BASELINE ENTRY (remove it from ${BASELINE_REL} in this PR) ${entry.path} — ${entry.reason}`,
  );
}

if (drift.newOrphans.length || drift.stale.length) {
  console.error(
    `\ntest-orphan-ratchet FAILED: ${drift.newOrphans.length} new orphan(s), ${drift.stale.length} stale baseline entry(ies).`,
  );
  console.error(
    `A NEW ORPHAN is wired into a workflow or deleted — never added to ${BASELINE_REL}, which may only SHRINK (ledger 2026-09-14-test-files-wired-orphans: a suite leaves the orphan list by being RUN or by being GONE, never by being named an exception).`,
  );
  console.error(
    `A STALE BASELINE ENTRY is a line to delete in the same PR that wired or removed that suite.`,
  );
  process.exit(1);
}

console.log(
  `test-orphan-ratchet: OK — baseline: ${baseline.length} recorded orphan(s) (debt, not exempt)`,
);
process.exit(0);
