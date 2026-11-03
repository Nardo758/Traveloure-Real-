#!/usr/bin/env node
/**
 * check-tests-after-top-level-await.cjs — no server test file registers tests after a top-level `await`
 * (TI-1, ledger `2026-11-03-ti1-tests-after-top-level-await`).
 *
 * Why: the server suites run under `node --test --test-force-exit`. A file that registers a test, then
 * reaches a top-level `await`, then registers more, loses every test after that `await`: the runner starts
 * on the tests it already has and force-exits when they finish, before the rest are registered. Nothing
 * fails — the hidden tests just never run. Found on #1844, where `cn1-concierge-listing.db.test.ts` ran 3 of
 * its 8 tests in CI (`await import("pg")` sat between them). A file that awaits BEFORE registering any test
 * is fine: the runner waits for the module before it has anything to run.
 *
 * The predicate, per `server/__tests__/**\/*.test.ts(x)`:
 *   1. find the first test registration at top level (`test(`/`it(`/`describe(`/`suite(` with a string or
 *      template first argument, `.skip`/`.only`/`.todo` included);
 *   2. find the first top-level `await` after it (an `await` or `for await` not inside any function body);
 *   3. fail when any `test(`/`it(` registration (at any depth) comes after that `await`, and say how many.
 *
 * "Inside a function" is decided by a small dependency-free lexer (the guard batch runs without `npm ci`):
 * strings, template literals, comments and regex literals are skipped; a `{` opens a function body when it
 * follows `=>`, or follows `)` whose `(` is not a control head (`if`/`for`/`while`/`switch`/`catch`/`with`);
 * an arrow's expression body counts as a function until the expression ends.
 *
 * SCOPE: server only. Client tests run without `--test-force-exit`, so the same layout there runs every test.
 *
 * STATED NEGATIVE SPACE (§18d): this reads source text. It does not see a test registered through a helper
 * whose name is not one of the four above, registrations built from a non-literal title, or an `await`
 * hidden inside a top-level getter/IIFE it cannot recognise as a function. It does not know which files a
 * workflow runs or with which flags; it checks every server test file.
 *
 * `--self-test` runs committed fixtures (the TI-1 experiment) and exits nonzero if the predicate drifts.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const ROOT = path.join(REPO, "server", "__tests__");
const REG = new Set(["test", "it", "describe", "suite"]);
const LEAF = new Set(["test", "it"]);
const CONTROL = new Set(["if", "for", "while", "switch", "catch", "with"]);
const TYPE_LITERAL_PREV = new Set([":", "<", "|", "&", ",", "("]);
const REGEX_PREV = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^", "return", "typeof", "case", "do", "else", "=>", "in", "of", "new", "delete", "void", "throw", "await", "yield"]);

/** Pure. Tokens: identifiers/keywords, punctuation; strings/templates/comments/regex collapsed to "STR". */
function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  const prevSig = () => (toks.length ? toks[toks.length - 1].t : null);
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      const s = i; i++;
      while (i < n && src[i] !== c) { if (src[i] === "\\") i++; i++; }
      i++; toks.push({ t: "STR", pos: s }); continue;
    }
    if (c === "`") {
      const s = i; i++;
      let depth = 0;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (depth === 0 && src[i] === "`") { i++; break; }
        if (src[i] === "$" && src[i + 1] === "{") { depth++; i += 2; continue; }
        if (depth > 0 && src[i] === "}") { depth--; i++; continue; }
        i++;
      }
      toks.push({ t: "STR", pos: s }); continue;
    }
    if (c === "/" && (prevSig() === null || REGEX_PREV.has(prevSig()))) {
      const s = i; i++;
      let cls = false;
      while (i < n && (cls || src[i] !== "/") && src[i] !== "\n") { if (src[i] === "\\") i++; else if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; i++; }
      i++; while (i < n && /[a-z]/i.test(src[i])) i++;
      toks.push({ t: "STR", pos: s }); continue;
    }
    if (/[A-Za-z_$]/.test(c)) { const s = i; while (i < n && /[\w$]/.test(src[i])) i++; toks.push({ t: src.slice(s, i), pos: s }); continue; }
    if (/[0-9]/.test(c)) { const s = i; while (i < n && /[\w.]/.test(src[i])) i++; toks.push({ t: "NUM", pos: s }); continue; }
    if (c === "=" && src[i + 1] === ">") { toks.push({ t: "=>", pos: i }); i += 2; continue; }
    toks.push({ t: c, pos: i }); i++;
  }
  return toks;
}

/** Pure. { awaits: [pos] top-level only, regs: [{pos, leaf, topLevel}] } for one file's source. */
function scan(src) {
  const toks = tokenize(src);
  const stack = []; // entries: { kind: "fn" | "block" | "paren" | "bracket" | "arrowExpr", head?: string }
  const fnDepth = () => stack.filter((s) => s.kind === "fn" || s.kind === "arrowExpr").length;
  const parenHeads = []; // for "(": the token before it
  const awaits = [];
  const regs = [];
  const closeArrowExprs = () => { while (stack.length && stack[stack.length - 1].kind === "arrowExpr") stack.pop(); };
  // A `{` at this stack depth opens a function body: set after `function`, and after a `(...)` whose head is not a
  // control keyword (a method or a function's parameter list), so a TypeScript return type in between (`): T {`)
  // does not hide the body. Cleared by a statement separator at that depth.
  let pendingFnDepth = null;
  let angle = 0; // `<…>` depth while a signature is pending, so a comma inside generics does not clear it
  for (let k = 0; k < toks.length; k++) {
    const tok = toks[k].t;
    const prev = k > 0 ? toks[k - 1].t : null;
    const next = k + 1 < toks.length ? toks[k + 1].t : null;
    if (tok === "=>") {
      if (next !== "{") stack.push({ kind: "arrowExpr" });
      continue;
    }
    if (tok === "function") { pendingFnDepth = stack.length; angle = 0; continue; }
    if (tok === "(") { stack.push({ kind: "paren", head: k > 0 ? toks[k - 1].t : null }); continue; }
    if (tok === "[") { stack.push({ kind: "bracket" }); continue; }
    if (tok === "{") {
      let kind = "block";
      if (pendingFnDepth !== null && TYPE_LITERAL_PREV.has(prev)) {
        // a type literal inside a signature's return type (`): Promise<{ a: T }> {`) — not the body
        stack.push({ kind: "type" });
        continue;
      }
      if (prev === "=>") kind = "fn";
      else if (pendingFnDepth !== null && pendingFnDepth === stack.length) kind = "fn";
      pendingFnDepth = null;
      stack.push({ kind });
      continue;
    }
    if (tok === ")" || tok === "]" || tok === "}") {
      closeArrowExprs();
      const top = stack.pop();
      if (tok === ")" && top && top.kind === "paren") {
        const head = top.head;
        // `name(...)`, `function name(...)`, `async (...)`, `function (...)`: a method or function signature may follow.
        if (head !== null && /^[A-Za-z_$][\w$]*$/.test(head) && !CONTROL.has(head)) { pendingFnDepth = stack.length; angle = 0; }
        else if (pendingFnDepth !== null && pendingFnDepth > stack.length) pendingFnDepth = null;
      }
      continue;
    }
    if (pendingFnDepth !== null && tok === "<") angle++;
    if (pendingFnDepth !== null && tok === ">" && angle > 0) angle--;
    if (tok === ";" && pendingFnDepth === stack.length) { pendingFnDepth = null; angle = 0; }
    if (tok === "," && pendingFnDepth === stack.length && angle === 0) pendingFnDepth = null;
    if (tok === "," || tok === ";") {
      // an arrow expression body ends at a separator at its own level
      while (stack.length && stack[stack.length - 1].kind === "arrowExpr") stack.pop();
      continue;
    }
    if (tok === "await" && fnDepth() === 0) { awaits.push(toks[k].pos); continue; }
    if (REG.has(tok) && prev !== "." && prev !== "function") {
      let j = k + 1;
      if (toks[j] && toks[j].t === "." && toks[j + 1] && /^(skip|only|todo)$/.test(toks[j + 1].t)) j += 2;
      if (toks[j] && toks[j].t === "(" && toks[j + 1] && toks[j + 1].t === "STR") {
        regs.push({ pos: toks[k].pos, leaf: LEAF.has(tok), topLevel: fnDepth() === 0 });
      }
    }
  }
  return { awaits, regs };
}

/** Pure. null when the file is safe, else { line, before, hidden }. */
function hiddenAfterAwait(src) {
  const { awaits, regs } = scan(src);
  const first = regs.find((r) => r.topLevel);
  if (!first) return null;
  const tla = awaits.find((p) => p > first.pos);
  if (tla === undefined) return null;
  const hidden = regs.filter((r) => r.leaf && r.pos > tla).length;
  if (hidden === 0) return null;
  const before = regs.filter((r) => r.leaf && r.pos < tla).length;
  return { line: src.slice(0, tla).split("\n").length, before, hidden };
}

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out.sort();
}

function selfTest() {
  const cases = [
    ["await before any test (runner waits)", `import { test } from "node:test";\nconst x = await new Promise((r) => setTimeout(() => r(1), 50));\ntest("a1", () => {});\ntest("a2", () => {});\n`, null],
    ["test, top-level await, two tests", `import { test } from "node:test";\ntest("b1", () => {});\nconst x = await new Promise((r) => setTimeout(() => r(1), 50));\ntest("b2", () => {});\ntest("b3", () => {});\n`, { before: 1, hidden: 2 }],
    ["test, await import, a describe with two its on one line", `import { test, describe, it } from "node:test";\ntest("c1", () => {});\nconst x = await import("node:fs");\ndescribe("d", () => { it("c2", () => {}); it("c3", () => {}); });\n`, { before: 1, hidden: 2 }],
    ["an await inside a top-level loop", `import { test } from "node:test";\ntest("d1", async () => { await Promise.resolve(); });\nfor (const k of [1, 2]) {\n  await Promise.resolve(k);\n}\ntest("d2", () => {});\n`, { before: 1, hidden: 1 }],
    ["awaits only inside test bodies", `import { test } from "node:test";\ntest("e1", async () => { await f(); });\ntest("e2", async function () { await g(); });\nconst h = async () => await f();\ntest("e3", () => {});\n`, null],
    ["an await inside if-block at top level", `import { test } from "node:test";\ntest("f1", () => {});\nif (process.env.X) {\n  await Promise.resolve();\n}\ntest("f2", () => {});\n`, { before: 1, hidden: 1 }],
    ["awaits in strings, comments and templates", "import { test } from \"node:test\";\ntest(\"g1\", () => {});\n// await later\nconst s = \"await x\";\nconst t = `await ${1}`;\n/* await */\ntest(\"g2\", () => {});\n", null],
    ["the #1844 shape: pg awaited between tests", `import { test, before } from "node:test";\ntest("h1", () => {});\ntest("h2", () => {});\nconst { Pool } = await import("pg");\nbefore(async () => { await x(); });\ntest("h3", async () => {});\n`, { before: 2, hidden: 1 }],
    ["a method shorthand body is a function", `import { test } from "node:test";\ntest("i1", () => {});\nconst o = { async run() { await f(); } };\ntest("i2", () => {});\n`, null],
    ["a typed return Promise<void> on a helper", `import { test } from "node:test";\ntest("j1", () => {});\nasync function h(dir: string | null, run: (b: string) => Promise<void>): Promise<void> {\n  await new Promise<void>((r) => r());\n}\ntest("j2", () => {});\n`, null],
    ["an object-literal return type", `import { test } from "node:test";\ntest("k1", () => {});\nasync function price(): Promise<{ tier: string; cents: number }> {\n  const t = await f();\n  return t;\n}\ntest("k2", () => {});\n`, null],
    ["a generic return type with a comma", `import { test } from "node:test";\ntest("l1", () => {});\nasync function m(): Promise<Record<string, string | null>> {\n  const r = await f();\n  return r;\n}\ntest("l2", () => {});\n`, null],
  ];
  let failed = 0;
  for (const [name, src, want] of cases) {
    const got = hiddenAfterAwait(src);
    const ok = want === null ? got === null : got !== null && got.before === want.before && got.hidden === want.hidden;
    console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
    if (!ok) failed++;
  }
  if (failed) {
    console.error(`tests-after-top-level-await self-test: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log(`tests-after-top-level-await self-test: ${cases.length}/${cases.length} fixture cases pass.`);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;
  const files = listFiles(dir);
  const bad = [];
  for (const f of files) {
    const r = hiddenAfterAwait(fs.readFileSync(f, "utf8"));
    if (r) bad.push({ file: path.relative(REPO, f), ...r });
  }
  if (bad.length) {
    console.error("tests-after-top-level-await guard FAILED — these tests never run under --test-force-exit:");
    for (const b of bad) console.error(`  • ${b.file}: top-level await at line ${b.line}; ${b.before} test(s) registered before it, ${b.hidden} hidden after it. Make the import static, or move the await into before().`);
    process.exit(1);
  }
  console.log(`tests-after-top-level-await guard: OK — ${files.length} server test file(s); none registers tests after a top-level await.`);
}

if (require.main === module) main();
module.exports = { hiddenAfterAwait, tokenize, scan };
