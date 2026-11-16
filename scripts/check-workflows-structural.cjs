#!/usr/bin/env node
/**
 * WORKFLOW STRUCTURAL GUARD (lane 1) — static, dependency-free, advisory.
 *
 * WHY: a workflow that fails to PARSE produces no jobs, so the required contexts its jobs provide are
 * simply ABSENT. GitHub then shows a stale-looking check and blocks the PR; re-running and re-pushing
 * both fail, because nothing was wrong with the checks. #2028 hit this three times (runs 43762114570,
 * 43764782929, 43771237933 all reported jobs = 0).
 *
 * THE THREE CORRUPTIONS THIS CATCHES (each was made by hand in one session):
 *   1. a step's `- name:` at a deeper indent than its siblings, so it parses as a child of the step above;
 *   2. a step NAME containing an unquoted ": " (e.g. `email x (N3: the gate ...)`), which YAML reads as a key;
 *   3. a step left with TWO `run:` keys after an edit removed or stole a line.
 *   Plus (4) tab indentation, which YAML forbids where these files use spaces.
 *
 * RULE -> CAUSE MAP (every rule answers to one of the four; nothing speculative is encoded):
 *   R1 step-without-command  -> 1 and 3 (a name with no run:/uses: is what both leave behind)
 *   R2 duplicate-command     -> 3
 *   R3 unquoted-colon        -> 2
 *   R4 tab-indent            -> 4
 *   R5 inconsistent-siblings -> 1
 *
 * THE FIVE LIMITS (stated, not implied):
 *   1. It cannot see SEMANTIC theft: a step that kept exactly one `run:` but now runs the wrong command.
 *   2. It cannot see a DELETED step: valid YAML, one fewer suite, no signal anywhere.
 *   3. It cannot see a workflow that parses but fails at runtime (e.g. a step needing `npm ci` in a job
 *      that has none).
 *   4. It cannot see SKIPPED work: `if:`/`paths:` can make a workflow green with nothing run. That is
 *      #2007's guard, not this one.
 *   5. It cannot see required-context drift: a job renamed while the ruleset still requires the old name.
 *   6. It cannot see a CLONED step that swallowed its neighbour: copying a step block without its `env:` can
 *      leave the neighbour's env, name and comment attached to the copy and the neighbour with none - every
 *      step still has exactly one `run:`, so the structure is legal and only the CI log shows it.
 *
 * It is ADVISORY (not a required context). Workflows only — the two `.github/actions/<dir>/action.yml`
 * composite actions are reported, not checked.
 */
const fs = require("fs");
const path = require("path");

const RULES = {
  R1: "step-without-command",
  R2: "duplicate-command",
  R3: "unquoted-colon",
  R4: "tab-indent",
  R5: "inconsistent-siblings",
};

function indentOf(line) {
  const m = line.match(/^[ \t]*/);
  return m ? m[0].length : 0;
}

/** A line that is only a comment or blank. */
const inert = (line) => /^\s*(#.*)?$/.test(line);

/**
 * Scan one workflow's text. Returns [{ line, rule, message }].
 * Deliberately structural: it never tries to be a YAML parser.
 */
function scanWorkflow(text, file = "(inline)") {
  const lines = text.split(/\r?\n/);
  const findings = [];
  const add = (i, rule, message) => findings.push({ file, line: i + 1, rule, message });

  // R4 — tabs in indentation, anywhere.
  lines.forEach((line, i) => {
    const lead = line.match(/^[ \t]*/)[0];
    if (lead.includes("\t")) add(i, "R4", "tab in indentation; these files indent with spaces");
  });

  // Locate every `steps:` block and scan its list items.
  const stepsIndent = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inert(line)) continue;
    const ind = indentOf(line);
    // leave any steps block we have left behind
    while (stepsIndent.length && ind <= stepsIndent[stepsIndent.length - 1].indent) stepsIndent.pop();
    const stepsKey = line.match(/^(\s*)steps:\s*$/);
    if (stepsKey) {
      stepsIndent.push({ indent: stepsKey[1].length, itemIndent: null, lastItem: null });
      continue;
    }
    if (!stepsIndent.length) continue;
    const ctx = stepsIndent[stepsIndent.length - 1];

    // A list item of this steps block.
    const item = line.match(/^(\s*)- (.*)$/);
    if (item) {
      const itemIndent = item[1].length;
      if (ctx.itemIndent === null) ctx.itemIndent = itemIndent;
      else if (itemIndent !== ctx.itemIndent) {
        // R5 — the shape corruption 1 leaves behind.
        add(i, "R5", `list item at indent ${itemIndent}, but this list's items sit at ${ctx.itemIndent}`);
      }
      // R3 — an unquoted scalar containing ": " in the item's own name line.
      const nameInline = (item[2] || "").match(/^name:\s*(.*)$/);
      if (nameInline) {
        const value = nameInline[1];
        if (value && !/^['"]/.test(value.trim()) && /:(\s|$)/.test(value)) {
          add(i, "R3", 'unquoted "name:" value contains ": " — YAML reads it as a key');
        }
      }
      ctx.lastItem = { index: i, indent: itemIndent, run: 0, uses: 0, name: !!nameInline };
      continue;
    }

    // Keys inside the current step item.
    if (!ctx.lastItem) continue;
    if (ind <= ctx.lastItem.indent) continue;
    const key = line.match(/^\s*(run|uses|name):/);
    if (!key) continue;
    if (key[1] === "run") ctx.lastItem.run += 1;
    if (key[1] === "uses") ctx.lastItem.uses += 1;
    if (key[1] === "run" && ctx.lastItem.run === 2) add(i, "R2", "second `run:` in one step (duplicate key)");
    if (key[1] === "uses" && ctx.lastItem.uses === 2) add(i, "R2", "second `uses:` in one step (duplicate key)");
    if (ctx.lastItem.run && ctx.lastItem.uses) add(i, "R2", "step carries both `run:` and `uses:` — one command per step");
  }

  // R1 — a step item with neither run: nor uses:. Recomputed in a second pass, because the item's block
  // ends only when the next item or a dedent arrives.
  const blocks = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inert(line)) continue;
    const ind = indentOf(line);
    const item = line.match(/^(\s*)- /);
    if (cur && ((item && ind === cur.indent) || ind < cur.indent)) {
      blocks.push(cur);
      cur = null;
    }
    if (item && isInSteps(lines, i)) {
      // A step may declare its command ON the item line (`- run: ...`, `- uses: ...`), which is the
      // commonest shape in this repo — count it, or every such step looks command-less.
      const inlineKey = (lines[i].match(/^\s*- (run|uses):/) || [])[1];
      cur = { start: i, indent: ind, run: inlineKey === "run" ? 1 : 0, uses: inlineKey === "uses" ? 1 : 0 };
      continue;
    }
    if (!cur) continue;
    if (ind <= cur.indent) continue;
    const key = line.match(/^\s*(run|uses):/);
    if (key && key[1] === "run") cur.run += 1;
    if (key && key[1] === "uses") cur.uses += 1;
  }
  if (cur) blocks.push(cur);
  for (const b of blocks) {
    if (b.run === 0 && b.uses === 0) add(b.start, "R1", "step has neither `run:` nor `uses:`");
  }

  return findings;
}

/** Is line index `i` a list item directly inside a `steps:` block? */
function isInSteps(lines, i) {
  const ind = indentOf(lines[i]);
  // Walk up PAST same-indent siblings (the earlier steps) to the nearest shallower line; only that ancestor
  // decides the list's owner. Returning false on a same-indent line was the bug: it made this answer true
  // for a block's FIRST step only, so every later step escaped R1.
  for (let j = i - 1; j >= 0; j--) {
    const line = lines[j];
    if (inert(line)) continue;
    if (indentOf(line) < ind) return /^\s*steps:\s*$/.test(line);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Self-test: the three corruptions verbatim must FAIL; real constructs must PASS.
// ---------------------------------------------------------------------------
const BAD = [
  {
    label: "corruption 1 — name indented deeper than its siblings",
    expect: ["R5"],
    text: [
      "jobs:",
      "  g:",
      "    steps:",
      "      - name: slip own-your-plan pin",
      "        if: ${{ !cancelled() }}",
      "        run: npx tsx --test a.test.ts",
      "        - name: email do-not-contact",
      "        run: npx tsx --test b.test.ts",
    ].join("\n"),
  },
  {
    label: "corruption 2 — unquoted colon in a step name",
    expect: ["R3"],
    text: [
      "jobs:",
      "  g:",
      "    steps:",
      "      - name: email do-not-contact (N3: the gate refuses transactional mail)",
      "        run: npx tsx --test a.test.ts",
    ].join("\n"),
  },
  {
    label: "corruption 3 — two run: keys in one step",
    expect: ["R2"],
    text: ["jobs:", "  g:", "    steps:", "      - name: x", "        run: a", "        run: b"].join("\n"),
  },
  {
    label: "corruption 3 (second shape) — run: and uses: on one step",
    expect: ["R2"],
    text: ["jobs:", "  g:", "    steps:", "      - name: x", "        uses: actions/checkout@v5.1.0", "        run: a"].join("\n"),
  },
  {
    label: "tabs in indentation",
    expect: ["R4"],
    text: ["jobs:", "  g:", "    steps:", "\t- name: x", "\t  run: y"].join("\n"),
  },
  {
    label: "R1 — command-less step in FIRST position",
    expect: ["R1"],
    text: [
      "jobs:",
      "  g:",
      "    steps:",
      "      - name: Skip rules self-test",
      "      - name: real",
      "        run: node x.cjs",
    ].join("\n"),
  },
  {
    label: "R1 — command-less step in MIDDLE position",
    expect: ["R1"],
    text: [
      "jobs:",
      "  g:",
      "    steps:",
      "      - name: first",
      "        run: node a.cjs",
      "      - name: Skip rules self-test",
      "      - name: last",
      "        run: node c.cjs",
    ].join("\n"),
  },
  {
    label: "R1 — command-less step in LAST position",
    expect: ["R1"],
    text: [
      "jobs:",
      "  g:",
      "    steps:",
      "      - name: first",
      "        run: node a.cjs",
      "      - name: trailing comment-only step",
    ].join("\n"),
  },
];

const GOOD = {
  "heredoc run block containing the word run:": [
    "jobs:",
    "  g:",
    "    steps:",
    "      - name: write a file",
    "        run: |",
    "          echo run: not a key",
    "          echo uses: neither",
  ].join("\n"),
  "uses step with a with: map": [
    "jobs:",
    "  g:",
    "    steps:",
    "      - uses: actions/checkout@v5.1.0",
    "        with:",
    "          fetch-depth: 0",
  ].join("\n"),
  "if: expression carrying a colon": [
    "jobs:",
    "  g:",
    "    steps:",
    "      - name: gate",
    "        if: ${{ !cancelled() && needs.changes.outputs.run != 'false' }}",
    "        run: node scripts/x.cjs",
  ].join("\n"),
  "matrix list beside steps (a different list)": [
    "jobs:",
    "  g:",
    "    strategy:",
    "      matrix:",
    "        os: [ubuntu-26.04]",
    "        include:",
    "          - os: ubuntu-26.04",
    "            node: 20",
    "    steps:",
    "      - name: g",
    "        run: node x.cjs",
  ].join("\n"),
  "name with an em dash": [
    "jobs:",
    "  g:",
    "    steps:",
    "      - name: boot-log-gate — no secret values",
    "        run: node scripts/x.cjs",
  ].join("\n"),
  "several real steps, none command-less": [
    "jobs:",
    "  g:",
    "    steps:",
    "      - uses: actions/checkout@v5.1.0",
    "      - name: one",
    "        run: node a.cjs",
    "      - name: two",
    "        run: node b.cjs",
  ].join("\n"),
};

function selfTest() {
  let failed = 0;
  for (const fixture of BAD) {
    const found = scanWorkflow(fixture.text);
    const rules = [...new Set(found.map((f) => f.rule))].sort();
    const want = [...fixture.expect].sort();
    const same = rules.length === want.length && rules.every((r, k) => r === want[k]);
    if (!same) {
      failed += 1;
      console.error(`  SELF-TEST FAIL (expected ${want.join(", ")}, got ${rules.join(", ") || "nothing"}): ${fixture.label}`);
    } else {
      console.log(`  ok  FAILS on ${want.join(", ")} and nothing else — ${fixture.label}`);
    }
  }
  for (const [label, fixture] of Object.entries(GOOD)) {
    const found = scanWorkflow(fixture);
    if (found.length > 0) {
      failed += 1;
      console.error(`  SELF-TEST FAIL (false positive): ${label} → ${found.map((f) => `${f.rule}@${f.line}`).join(", ")}`);
    } else {
      console.log(`  ok  PASSES as required — ${label}`);
    }
  }
  if (failed) {
    console.error(`self-test: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log(`self-test: ${BAD.length} corruptions rejected (each on its own rule), ${Object.keys(GOOD).length} constructs accepted.`);
}

// ---------------------------------------------------------------------------
const root = process.cwd();
const dir = path.join(root, ".github", "workflows");
const compositeDir = path.join(root, ".github", "actions");

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  if (!fs.existsSync(dir)) {
    console.error(`workflow structure: no ${path.relative(root, dir)} — nothing to check`);
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort();
  const findings = [];
  for (const f of files) findings.push(...scanWorkflow(fs.readFileSync(path.join(dir, f), "utf8"), `.github/workflows/${f}`));
  const composites = fs.existsSync(compositeDir)
    ? fs.readdirSync(compositeDir, { withFileTypes: true }).filter((d) => d.isDirectory())
        .filter((d) => fs.existsSync(path.join(compositeDir, d.name, "action.yml"))).length
    : 0;
  if (findings.length === 0) {
    console.log(`workflow structure: OK — ${files.length} workflow file(s), 0 findings.`);
    console.log(`workflow structure: ${composites} composite action.yml file(s) NOT checked (workflows only, by ruling).`);
    return;
  }
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${RULES[f.rule]}  ${f.message}`);
  console.error(`workflow structure: ${findings.length} finding(s) in ${files.length} workflow file(s)`);
  process.exit(1);
}

main();
