import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifestPath = path.join(root, "generated/security/mutation-auth-manifest.json");
const manifestBytes = fs.readFileSync(manifestPath);
const manifestSha256 = crypto.createHash("sha256").update(manifestBytes).digest("hex");
const logDir = path.join(root, "generated/security/evidence-logs");
fs.mkdirSync(logDir, { recursive: true });

const specifications = [
  { id: "admin", context: "admin", file: "server/__tests__/mutation-auth/admin-mutation-auth.test.ts", live: true },
  { id: "highrisk-unauthenticated", context: "unauthenticated", file: "server/__tests__/mutation-auth/non-admin-payments-user-data-mutation-auth.http.test.ts", live: true },
  { id: "expert-provider-wrong-role", context: "wrong-role", file: "server/__tests__/mutation-auth/expert-provider-mutation-auth.test.ts", live: true },
  { id: "resource-ownership", context: "resource-owner", file: "server/__tests__/mutation-auth/mutation-auth.http.test.ts", live: true },
  { id: "optimization-confirm", context: "optimization-confirm", file: "server/__tests__/optimization-confirm-ownership.test.ts", live: false },
] as const;

function evidenceKeys(output: string): string[] {
  const keys = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    // node:test's TAP reporter escapes JSON nested inside string fields, so
    // retain the explicit endpoint field without attempting to parse the
    // entire diagnostic line. Exclusion records are deliberately ignored.
    const explicit = line.match(/"endpoint":"([^"]+)"/);
    if (explicit && (
      line.includes('"kind":"probe"') ||
      line.includes("[mutation-auth evidence") ||
      line.includes('"audit":"optimization-confirm-ownership"')
    )) keys.add(explicit[1]);
    const candidates = [line, line.replace(/^\[mutation-auth evidence(?:-summary)?\]\s*/, "")];
    for (const candidate of candidates) {
      const start = candidate.indexOf("{");
      if (start < 0) continue;
      try {
        const value = JSON.parse(candidate.slice(start));
        if (typeof value.endpoint === "string" && (
          value.kind === "probe" ||
          line.includes("[mutation-auth evidence") ||
          value.audit === "optimization-confirm-ownership"
        )) keys.add(value.endpoint);
        if (Array.isArray(value.evidence)) {
          for (const row of value.evidence) if (typeof row.endpoint === "string") keys.add(row.endpoint);
        }
      } catch {
        // TAP diagnostics and application output are retained in the log; only
        // explicit JSON evidence records are summarized.
      }
    }
  }
  return [...keys].sort();
}

const suites = specifications.map((specification) => {
  const command = `npx tsx --test ${specification.file}`;
  const result = spawnSync("npx", ["tsx", "--test", specification.file], {
    cwd: root,
    env: { ...process.env, ...(specification.live ? { MUTATION_AUTH_AUDIT_OK: "1" } : {}) },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  fs.writeFileSync(path.join(logDir, `${specification.id}.log`), output);
  const skipped = /# SKIP|ℹ skipped [1-9]/.test(output);
  const passed = result.status === 0 && !skipped;
  return {
    id: specification.id,
    context: specification.context,
    command: `${specification.live ? "MUTATION_AUTH_AUDIT_OK=1 " : ""}${command}`,
    passed,
    skipped,
    exitStatus: result.status,
    endpointKeys: passed ? evidenceKeys(output) : [],
    log: `generated/security/evidence-logs/${specification.id}.log`,
  };
});
const evidence = {
  schemaVersion: 1,
  generatedBy: "scripts/run-mutation-auth-live-audit.ts",
  manifestSha256,
  timestamp: new Date().toISOString(),
  passed: suites.every((suite) => suite.passed),
  suites,
};
fs.writeFileSync(path.join(root, "generated/security/mutation-auth-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
for (const suite of suites) console.log(`${suite.passed ? "PASS" : suite.skipped ? "SKIP" : "FAIL"} ${suite.id}: ${suite.endpointKeys.length} endpoints`);
if (!evidence.passed) process.exitCode = 1;