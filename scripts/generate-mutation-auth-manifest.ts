import fs from "node:fs";
import path from "node:path";
import { extractMountedMutations } from "./mutation-auth/extractor.ts";

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
let drift = false;
for (const [file, data] of outputs) {
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
  if (previous !== data) {
    drift = true;
    if (!check) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
  }
}
if (check && drift) {
  console.error("Mutation authorization manifest drift detected. Run npm run generate:mutation-auth.");
  process.exitCode = 1;
} else {
  console.log(`${check ? "Verified" : "Wrote"} ${manifest.mutationCount} mounted mutation registrations.`);
}