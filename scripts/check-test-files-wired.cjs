#!/usr/bin/env node
/**
 * CI test-file reachability inventory.
 *
 * UNDERSTOOD INVOCATION SHAPES
 * - `tsx --test <file|directory|glob>` (including `npx tsx` and env prefixes)
 * - `vitest run <file|directory|glob>` (including `npx vitest`)
 * - `playwright test [file|directory|glob|path-substring]`, `--project`, and
 *   `-c|--config <config>`; a selector-free invocation reaches the config's
 *   statically declared `testDir`/`testMatch`
 * - direct paths, directory prefixes, basic shell globs (`*`, `**`, `?`)
 * - `npm test`, `npm run <script>`, and recursively referenced npm scripts
 * - YAML inline and block-scalar `run:` commands, shell continuations, and
 *   multiple commands separated by newlines, `&&`, or `;`
 *
 * CANNOT DETECT
 * - generated/eval'd commands, shell variables that contain selectors, custom
 *   test launchers, reusable workflows/actions, matrix-expanded selectors, or
 *   test discovery changed at runtime
 * - config values that are computed rather than literal `testDir`/`testMatch`
 * - shell glob features beyond `*`, `**`, and `?`
 *
 * This is intentionally an advisory inventory: current orphans are printed and
 * the normal scan exits 0. `--self-test` is the predicate gate and exits nonzero
 * on a broken fixture.
 *
 * Node built-ins only. Self-test: node scripts/check-test-files-wired.cjs --self-test
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");
const TEST_ROOTS = ["server", "shared", "client", "playwright"];
const TEST_RE = /\.(?:test\.ts|test\.tsx|spec\.ts)$/;

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

function commandSegments(command) {
  return command
    .replace(/\\\s*\n/g, " ")
    .split(/\n|&&|;/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
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

function selectorMatches(file, selector, kind) {
  const clean = posix(selector.replace(/^[("'`]+|[)"'`,]+$/g, ""));
  if (!clean || clean === ".") return true;
  if (clean.includes("*") || clean.includes("?")) return globRegex(clean).test(file);
  if (file === clean || file.startsWith(clean.replace(/\/$/, "") + "/")) return true;
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
  let index = tokens.findIndex((word) => ["tsx", "vitest", "playwright"].includes(word));
  if (index < 0) return null;
  const kind = tokens[index];
  const args = tokens.slice(index + 1);
  if (kind === "tsx" && !args.includes("--test")) return null;
  if (kind === "vitest" && args[0] !== "run") return null;
  if (kind === "playwright" && args[0] !== "test") return null;
  return { kind, args: args.slice(kind === "tsx" ? 0 : 1) };
}

function runnerSelectors(parsed) {
  const selectors = [];
  let config = null;
  const valueOptions = new Set([
    "-c", "--config", "--project", "--workers", "--max-workers", "--grep",
    "--grep-invert", "--reporter", "--shard", "--repeat-each", "--retries",
    "--test-timeout", "--timeout",
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

function inventory({ root = ROOT, tests, workflowCommands, packageScripts }) {
  const reachable = new Set();
  const pending = [...workflowCommands];
  const seenScripts = new Set();

  while (pending.length) {
    for (const segment of commandSegments(pending.shift())) {
      const words = shellWords(segment);
      const npm = words.findIndex((word) => word === "npm");
      if (npm >= 0) {
        const action = words[npm + 1];
        const script = action === "test" ? "test" : action === "run" ? words[npm + 2] : null;
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
        if (!effective.some((selector) => selectorMatches(file, selector, parsed.kind))) continue;
        if (playwrightConfig?.testMatches.length) {
          const withinDir = posix(path.relative(playwrightConfig.testDir, file));
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

function workflowCommands(dir = WORKFLOW_DIR) {
  return walk(dir, (file) => /\.ya?ml$/.test(file))
    .flatMap((file) => extractRunCommands(fs.readFileSync(path.join(dir, file), "utf8")));
}

function selfTest() {
  const tests = [
    "server/direct.test.ts",
    "shared/directory/covered.test.ts",
    "client/unreferenced.test.ts",
  ];
  const result = inventory({
    root: ROOT,
    tests,
    workflowCommands: [
      "npx tsx --test server/direct.test.ts",
      "npx vitest run shared/directory",
    ],
    packageScripts: {},
  });
  const expectedReachable = ["server/direct.test.ts", "shared/directory/covered.test.ts"];
  const expectedOrphans = ["client/unreferenced.test.ts"];
  const ok =
    JSON.stringify(result.reachable) === JSON.stringify(expectedReachable) &&
    JSON.stringify(result.orphans) === JSON.stringify(expectedOrphans);
  if (!ok) {
    console.error("SELF-TEST FAILED", { result, expectedReachable, expectedOrphans });
    process.exit(1);
  }
  console.log("self-test OK (direct file, directory reachability, unreferenced orphan)");
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
process.exit(0);