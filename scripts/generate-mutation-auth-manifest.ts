/**
 * Generates `generated/security/mutation-auth-manifest.json` + `mutation-auth-inventory.md` from the
 * CURRENT mount graph rooted at `server/routes.ts`.
 *
 *   --check      exit 1 when a RAIL drifted — the predicate is `scripts/mutation-auth/manifest-drift.ts`
 *                (method + normalized path + mount source + guard set). LINE NUMBERS ARE NOT IN THE
 *                PREDICATE (ledger `2026-09-16-ci-main-red-repairs`): the files keep `source:line`
 *                for humans, but a merge that only shifts lines is NOT drift and must not turn CI
 *                red. The check therefore reports "stale line numbers" as a NOTICE, never a failure;
 *                regenerate whenever convenient with `npm run generate:mutation-auth`.
 *   --self-test  §18d fixtures for the predicate: a line-only shift PASSES, an unmanifested rail
 *                FAILS, a lost rail FAILS, a changed guard set FAILS. Exit 1 on any fixture failing.
 *   (no flag)    write both files.
 */
import fs from "node:fs";
import path from "node:path";
import { extractMountedMutations } from "./mutation-auth/extractor.ts";
import { diffRails, hasDrift, type RailLike } from "./mutation-auth/manifest-drift.ts";

if (process.argv.includes("--self-test")) {
  const rail = (over: Partial<RailLike> = {}): RailLike => ({
    method: "POST", effectivePath: "/api/things/:id", source: "server/routes/things.routes.ts",
    risk: "user-data", expectedAuth: "required", expectedRoles: [], expectedBoundary: "resource-owner",
    expectedOwnership: "verified", ownershipApplies: true, ...over,
  });
  type Fixture = [label: string, ok: boolean, detail?: unknown];
  const results: Fixture[] = [];
  // (1) A line-only shift is NOT drift. `line` is not even in RailLike, so a manifest whose every
  //     entry moved 40 lines compares equal by construction; assert it explicitly anyway.
  const before = [{ ...rail(), line: 100 }, { ...rail({ method: "DELETE" }), line: 140 }];
  const after = [{ ...rail(), line: 140 }, { ...rail({ method: "DELETE" }), line: 180 }];
  results.push(["line-only shift passes", !hasDrift(diffRails(before, after))]);
  // (2) A NEW rail nobody manifested FAILS.
  const withNew = diffRails(before, [...after, rail({ effectivePath: "/api/things/:id/accept" })]);
  results.push(["unmanifested new rail fails", hasDrift(withNew) && withNew.added.length === 1 && withNew.removed.length === 0, withNew]);
  // (3) A LOST rail FAILS.
  const lost = diffRails(before, [after[0]]);
  results.push(["removed rail fails", hasDrift(lost) && lost.removed.length === 1 && lost.added.length === 0, lost]);
  // (4) The SAME method+path with a different guard set FAILS (that is exactly what an audit probes).
  const reguarded = diffRails(before, [{ ...rail({ expectedBoundary: "session-self", expectedOwnership: "self" }), line: 100 }, after[1]]);
  results.push(["changed guard set on same path fails", hasDrift(reguarded) && reguarded.added.length === 1 && reguarded.removed.length === 1, reguarded]);
  // (5) Role ORDER is not drift; a gained or lost role is.
  results.push(["role order is not drift", !hasDrift(diffRails([rail({ expectedRoles: ["a", "b"] })], [rail({ expectedRoles: ["b", "a"] })]))]);
  results.push(["gained role is drift", hasDrift(diffRails([rail({ expectedRoles: ["a"] })], [rail({ expectedRoles: ["a", "b"] })]))]);
  // (6) A lost SHADOW (duplicate registration of one method+path) is drift — the multiset matters.
  results.push(["lost duplicate registration is drift", hasDrift(diffRails([rail(), rail({ source: "server/routes.ts" })], [rail()]))]);
  const failed = results.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("SELF-TEST FAILED");
    for (const [label, , detail] of failed) console.error(`  ✗ ${label}`, detail ?? "");
    process.exit(1);
  }
  console.log(`self-test OK (${results.length} cases: line-only shift passes; new / removed / re-guarded rail fails; role order ignored; lost shadow is drift)`);
  process.exit(0);
}

const root = process.cwd();
const check = process.argv.includes("--check");
const result = extractMountedMutations(path.join(root, "server/routes.ts"), root);
const historicalComparisonCount = 546;
const grouped = new Map<string, typeof result.mutations>();
for (const mutation of result.mutations) {
  const key = `${mutation.method} ${mutation.effectivePath}`;
  grouped.set(key, [...(grouped.get(key) || []), mutation]);
}
const distinctMethodPaths = grouped.size;
const duplicateRegistrations = [...grouped.entries()]
  .filter(([, registrations]) => registrations.length > 1)
  .map(([methodPath, registrations]) => ({
    methodPath,
    registrations: registrations.map(({ source, line, rawPath }) => ({ source, line, rawPath })),
  }));
const uniqueEndpoints = [...grouped.entries()].map(([methodPath, registrations]) => {
  const first = registrations[0];
  return {
    method: first.method,
    normalizedPath: first.effectivePath,
    risk: first.risk,
    expectedAuth: first.expectedAuth,
    expectedRoles: first.expectedRoles,
    expectedBoundary: first.expectedBoundary,
    expectedOwnership: first.expectedOwnership,
    ownershipApplies: first.ownershipApplies,
    fixtureStatus: first.fixtureStatus,
    testStatus: first.testStatus,
    registrations: registrations.map(({ source, line, rawPath }) => ({ source, line, rawPath })),
  };
});
const categoryTotals = Object.fromEntries(["payments", "admin", "user-data", "other"].map((risk) =>
  [risk, uniqueEndpoints.filter((endpoint) => endpoint.risk === risk).length],
));
const boundaryTotals = Object.fromEntries(["admin-role", "session-self", "resource-owner", "signature", "public-or-system", "unknown"].map((boundary) =>
  [boundary, uniqueEndpoints.filter((endpoint) => endpoint.expectedBoundary === boundary).length],
));
const manifest = {
  schemaVersion: 1,
  generatedBy: "scripts/generate-mutation-auth-manifest.ts",
  entrypoint: "server/routes.ts",
  mutationCount: result.mutations.length,
  rawRegistrationCount: result.mutations.length,
  uniqueMethodNormalizedPathCount: distinctMethodPaths,
  // Kept for consumers of the first generated revision.
  distinctMethodPathCount: distinctMethodPaths,
  duplicateRegistrations,
  categoryTotals,
  boundaryTotals,
  historicalComparison: {
    count: historicalComparisonCount,
    delta: result.mutations.length - historicalComparisonCount,
    note: "The historical count is a comparison-only baseline; generation reads only the current source mount graph.",
  },
  diagnostics: result.diagnostics,
  mutations: result.mutations,
};
const json = `${JSON.stringify(manifest, null, 2)}\n`;
const markdown = [
  "# Mounted mutation authorization inventory",
  "",
  `Generated from \`server/routes.ts\`. **${manifest.rawRegistrationCount}** raw mounted mutation registrations and **${manifest.uniqueMethodNormalizedPathCount}** unique METHOD+normalizedPath pairs were found.`,
  "",
  `The unique-pair count is **${manifest.uniqueMethodNormalizedPathCount - historicalComparisonCount >= 0 ? "+" : ""}${manifest.uniqueMethodNormalizedPathCount - historicalComparisonCount}** from the historical 546 comparison clue. The generator does not read that clue: it follows the current source mount graph. Raw registrations retain currently mounted, later-shadowed registrations; duplicate registrations are listed in the JSON manifest. A changed count indicates current route additions/removals or mount-graph changes, not an automatic regression.`,
  "",
  `Category totals: payments ${categoryTotals.payments}; admin ${categoryTotals.admin}; user-data ${categoryTotals["user-data"]}; other ${categoryTotals.other}.`,
  `Boundary totals: admin-role ${boundaryTotals["admin-role"]}; session-self ${boundaryTotals["session-self"]}; resource-owner ${boundaryTotals["resource-owner"]}; signature ${boundaryTotals.signature}; public-or-system ${boundaryTotals["public-or-system"]}; unknown ${boundaryTotals.unknown}.`,
  "",
  "| Method | Normalized path | Risk | Boundary | Ownership applicable | Expected ownership | Registrations | Fixture | Test |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...uniqueEndpoints.map((endpoint) => `| ${endpoint.method} | \`${endpoint.normalizedPath}\` | ${endpoint.risk} | ${endpoint.expectedBoundary} | ${endpoint.ownershipApplies ? "yes" : "no"} | ${endpoint.expectedOwnership} | ${endpoint.registrations.map((r) => `\`${r.source}:${r.line}\`${r.rawPath === endpoint.normalizedPath ? "" : ` (${r.rawPath})`}`).join("<br>")} | ${endpoint.fixtureStatus} | ${endpoint.testStatus} |`),
  ...(result.diagnostics.length ? ["", "## Extraction diagnostics", "", ...result.diagnostics.map((d) => `- ${d}`)] : []),
  "",
].join("\n");
const outputs = [
  [path.join(root, "generated/security/mutation-auth-manifest.json"), json],
  [path.join(root, "generated/security/mutation-auth-inventory.md"), markdown],
] as const;
if (check) {
  // THE PREDICATE IS THE RAIL SET, NOT THE BYTES (see header; `scripts/mutation-auth/manifest-drift.ts`).
  const manifestFile = outputs[0][0];
  const previous = fs.existsSync(manifestFile)
    ? (JSON.parse(fs.readFileSync(manifestFile, "utf8")) as { mutations?: RailLike[] })
    : undefined;
  if (!previous?.mutations) {
    console.error(`Mutation authorization manifest missing or unreadable at ${path.relative(root, manifestFile)}. Run npm run generate:mutation-auth.`);
    process.exitCode = 1;
  } else {
    const drift = diffRails(previous.mutations, result.mutations);
    if (hasDrift(drift)) {
      console.error(`Mutation authorization manifest drift detected: ${drift.added.length} rail(s) not in the manifest, ${drift.removed.length} manifested rail(s) no longer mounted. Run npm run generate:mutation-auth.`);
      for (const k of drift.added) console.error(`  + ${k}`);
      for (const k of drift.removed) console.error(`  - ${k}`);
      process.exitCode = 1;
    } else {
      const bytesStale = outputs.some(([file, data]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== data);
      console.log(`Verified ${manifest.mutationCount} mounted mutation registrations — rail set unchanged.`);
      if (bytesStale) {
        console.log("::notice::mutation-auth manifest line numbers are stale (no rail changed). Not a failure — regenerate with npm run generate:mutation-auth when convenient.");
      }
    }
  }
} else {
  for (const [file, data] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  console.log(`Wrote ${manifest.mutationCount} mounted mutation registrations.`);
}
