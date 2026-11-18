/**
 * F1 - A NON-GET ROUTE MUST SAY WHETHER IT IS A WRITE (source test).
 *
 * `authorizeTripLogistics` defaults to READ access, so a write route that forgets the option silently admits a
 * PENDING advisor (ruling of Aug 7: a pending advisor may read a plan and may not change it). This test reads
 * the server sources and fails on any call inside a POST/PUT/PATCH/DELETE route that passes no
 * `requireWriteAccess` option at all.
 *
 * A `false` is allowed - some non-GET routes only compute - but it must carry a reason comment in the two lines
 * above the call. It deliberately does NOT judge whether a route writes: the source cannot know that. It only
 * demands that the choice be explicit. A synthetic fixture proves the matcher can fail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ROUTE_RE = /(?:router|app)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/;
const NL = String.fromCharCode(10);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function closingParen(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export interface Finding {
  file: string;
  line: number;
  method: string;
  route: string;
  problem: "no-option" | "false-without-reason";
}

export function scanSource(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split(NL);
  const offsets: number[] = [];
  let acc = 0;
  for (const l of lines) {
    offsets.push(acc);
    acc += l.length + 1;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("authorizeTripLogistics(")) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    if (line.includes("function authorizeTripLogistics")) continue;

    let route: { method: string; route: string } | null = null;
    for (let j = i; j >= 0; j--) {
      const m = ROUTE_RE.exec(lines[j]);
      if (m) {
        route = { method: m[1].toUpperCase(), route: m[2] };
        break;
      }
    }
    if (!route || route.method === "GET") continue;

    const callStart = offsets[i] + line.indexOf("authorizeTripLogistics(");
    const open = text.indexOf("(", callStart);
    const close = closingParen(text, open);
    if (close === -1) continue;
    const args = text.slice(open, close);

    if (!args.includes("requireWriteAccess")) {
      findings.push({ file, line: i + 1, method: route.method, route: route.route, problem: "no-option" });
    } else if (args.includes("requireWriteAccess: false")) {
      const above = [lines[i - 1] ?? "", lines[i - 2] ?? ""].join(" ");
      if (!/F1 Phase 0/.test(above)) {
        findings.push({ file, line: i + 1, method: route.method, route: route.route, problem: "false-without-reason" });
      }
    }
  }
  return findings;
}

test("A1: every non-GET call states requireWriteAccess, and a false states why", () => {
  const files = walk(path.join(ROOT, "server"));
  const findings: Finding[] = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (!text.includes("authorizeTripLogistics(")) continue;
    findings.push(...scanSource(path.relative(ROOT, f), text));
  }
  const describe = findings.map((f) => `${f.problem}: ${f.method} ${f.route} at ${f.file}:${f.line}`).join(NL);
  assert.deepEqual(findings, [], `non-GET calls that do not state the choice:${NL}${describe}`);
});

test("A2: the matcher would catch a new route that forgets the option", () => {
  const fixture = [
    'router.post("/api/trips/:id/anchors", async (req, res) => {',
    "  const denied = await authorizeTripLogistics(req.params.id, userId, 'POST anchors');",
    "});",
  ].join(NL);
  const found = scanSource("fixture.ts", fixture);
  assert.equal(found.length, 1);
  assert.equal(found[0].problem, "no-option");
});

test("A3: a false without its reason is a finding, a false with one is not", () => {
  const bare = [
    'router.post("/api/trips/:id/validate-schedule", async (req, res) => {',
    "  const denied = await authorizeTripLogistics(t, u, 'POST', { requireWriteAccess: false });",
    "});",
  ].join(NL);
  assert.equal(scanSource("bare.ts", bare)[0]?.problem, "false-without-reason");

  const reasoned = [
    'router.post("/api/trips/:id/validate-schedule", async (req, res) => {',
    "  // Computes conflicts from rows it reads; writes nothing (F1 Phase 0).",
    "  const denied = await authorizeTripLogistics(t, u, 'POST', { requireWriteAccess: false });",
    "});",
  ].join(NL);
  assert.deepEqual(scanSource("reasoned.ts", reasoned), []);
});
