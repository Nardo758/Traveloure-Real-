/**
 * Deterministic, endpoint-level authorization coverage accounting.  This does
 * not infer coverage from route names: every disposition is assigned from the
 * generated mounted-route manifest and the deliberately narrow live suites.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type Risk = "payments" | "admin" | "user-data" | "other";
type Boundary = "admin-role" | "session-self" | "resource-owner" | "signature" | "public-or-system" | "unknown";
type Endpoint = { method: string; effectivePath: string; source: string; line: number; risk: Risk; expectedBoundary: Boundary };
type Manifest = { mutations: Endpoint[] };
type EvidenceSuite = { id: string; context: string; passed: boolean; skipped: boolean; endpointKeys: string[] };
type Evidence = { schemaVersion: number; manifestSha256: string; timestamp: string; suites: EvidenceSuite[] };

const root = process.cwd();
const check = process.argv.includes("--check");
const evidencePath = process.env.MUTATION_AUTH_EVIDENCE_PATH ?? path.join(root, "generated/security/mutation-auth-evidence.json");
const outputDir = process.env.MUTATION_AUTH_COVERAGE_OUTPUT_DIR ?? path.join(root, "generated/security");
const keyOf = (endpoint: Pick<Endpoint, "method" | "effectivePath">) => `${endpoint.method} ${endpoint.effectivePath}`;

// These endpoints are intentionally *not* promoted from a session test to an
// authorization proof. They are the 30 session-self endpoints explicitly
// excluded by expert-provider-mutation-auth.test.ts and require real handler
// resources before a wrong-role/owner result is meaningful.
const handlerFixtureExclusions = new Set([
  "POST /api/expert/ai-tasks/:taskId/approve", "POST /api/expert/ai-tasks/:taskId/regenerate",
  "POST /api/expert/ai-tasks/:taskId/reject", "POST /api/expert/ai-tasks/delegate",
  "POST /api/expert/assignments/:assignmentId/accept", "POST /api/expert/bookings/:id/complete",
  "PATCH /api/expert/bookings/:id/status", "PATCH /api/expert/ready-made/:id",
  "POST /api/expert/ready-made/:id/build-review", "POST /api/expert/ready-made/:id/submit",
  "POST /api/expert/ready-made/:id/withdraw", "POST /api/expert/reviews/:id/respond",
  "PATCH /api/expert/role", "POST /api/expert/trips/:tripId/vendors",
  "DELETE /api/expert/vendors/:vendorId", "PUT /api/expert/vendors/:vendorId",
  "DELETE /api/provider/availability/:id", "PATCH /api/provider/availability/:id",
  "POST /api/provider/blackout-dates", "POST /api/provider/bookings/:id/complete",
  "PATCH /api/provider/bookings/:id/status", "POST /api/provider/bundles",
  "DELETE /api/provider/bundles/:id", "PATCH /api/provider/bundles/:id",
  "POST /api/provider/properties", "DELETE /api/provider/properties/:id",
  "PATCH /api/provider/properties/:id", "POST /api/provider/properties/:id/rooms",
  "DELETE /api/provider/rooms/:id", "PATCH /api/provider/rooms/:id",
]);
const tripFixturePaths = [
  "POST /api/trips/:tripId/participants", "POST /api/trips/:tripId/contracts",
  "POST /api/trips/:tripId/contracts/:contractId/documents", "POST /api/trips/:tripId/transactions",
  "POST /api/trips/:tripId/transactions/split", "POST /api/trips/:tripId/budget/calculate-split",
  "POST /api/trips/:tripId/itinerary-items", "POST /api/trips/:tripId/itinerary/reorder",
  "POST /api/trips/:tripId/itinerary/optimize-order", "POST /api/trips/:tripId/activate-transport",
  "POST /api/trips/:tripId/emergency-contacts", "POST /api/trips/:tripId/emergency/initialize",
  "POST /api/trips/:tripId/alerts", "POST /api/trips/:tripId/anchors", "POST /api/trips/:tripId/day-boundaries",
  "POST /api/trips/:tripId/validate-schedule", "POST /api/trips/:tripId/anchors/:anchorId/impacts",
  "POST /api/trips/:tripId/anchor-suggestions", "POST /api/trips/:tripId/analytics/infer",
  "PATCH /api/trips/:tripId/itinerary-items/:itemId", "DELETE /api/trips/:tripId/itinerary-items/:itemId",
  "PATCH /api/trips/:tripId/expert-traveler-note", "POST /api/trips/:tripId/changes",
  "DELETE /api/trips/:tripId/changes/:changeId", "POST /api/trips/:tripId/items/:itemId/route",
  "POST /api/trips/:tripId/finalize", "POST /api/trips/:tripId/reopen",
  "POST /api/trips/:tripId/transport-legs/generate", "PATCH /api/trips/:tripId/transport-legs/:legId",
  "DELETE /api/trips/:tripId/transport-legs/:legId",
];
const resourceFixtureSet = new Set([
  "PATCH /api/trips/:id", "DELETE /api/trips/:id", ...tripFixturePaths,
  "POST /api/optimization-payments", "POST /api/optimization-payments/confirm",
]);

function disposition(endpoint: Endpoint, contexts: Map<string, Set<string>>, evidenceState: string) {
  const key = keyOf(endpoint);
  const has = (context: string) => contexts.get(context)?.has(key) === true;
  if (endpoint.risk === "admin" && endpoint.expectedBoundary === "admin-role")
    return has("admin")
      ? { tested: true, reason: "Fresh admin live-matrix evidence records both unauthenticated and wrong-role rejection." }
      : { tested: false, reason: `Not run: ${evidenceState || "fresh admin live-matrix evidence for this endpoint is absent"}.` };
  if (resourceFixtureSet.has(key))
    return (key === "POST /api/optimization-payments/confirm" ? has("optimization-confirm") : has("resource-owner"))
      ? { tested: true, reason: key === "POST /api/optimization-payments/confirm"
        ? "Fresh mocked-Stripe confirmation ownership evidence (three tests)."
        : "Fresh real-resource User A → User B ownership evidence." }
      : { tested: false, reason: `Not run: ${evidenceState || `fresh ${key.endsWith("/confirm") ? "optimization-confirm" : "resource-owner"} endpoint evidence is absent`}.` };
  if ((endpoint.risk === "payments" || endpoint.risk === "user-data") && endpoint.expectedBoundary === "signature")
    return has("unauthenticated")
      ? { tested: true, reason: "Fresh unsigned-request evidence for the payment/user-data signature boundary." }
      : { tested: false, reason: `Not run: ${evidenceState || "fresh unsigned-request endpoint evidence is absent"}.` };
  if ((endpoint.risk === "payments" || endpoint.risk === "user-data") && endpoint.expectedBoundary === "session-self" && !handlerFixtureExclusions.has(key))
    return has("unauthenticated")
      ? { tested: true, reason: "Fresh unauthenticated session-boundary evidence." }
      : { tested: false, reason: `Not run: ${evidenceState || "fresh unauthenticated endpoint evidence is absent"}.` };
  if (handlerFixtureExclusions.has(key))
    return { tested: false, reason: "Explicitly excluded in expert-provider-mutation-auth.test.ts; handler-owned real fixture is required before authorization can be claimed." };
  if (endpoint.expectedBoundary === "public-or-system")
    return { tested: false, reason: "Public-or-system boundary is intentionally outside the strict protected-endpoint test set." };
  if (endpoint.risk === "other")
    return { tested: false, reason: "Other-category endpoint is intentionally outside the strict tested set." };
  if (endpoint.expectedBoundary === "resource-owner")
    return { tested: false, reason: "Resource-owner endpoint is not one of the 32 trip or two optimization real-fixture endpoints." };
  if (endpoint.expectedBoundary === "signature")
    return { tested: false, reason: "Signature endpoint is outside the payments/user-data unsigned-request scope." };
  return { tested: false, reason: "Endpoint is outside the strict endpoint-level tested criteria." };
}

const manifestFile = path.join(root, "generated/security/mutation-auth-manifest.json");
const manifestBytes = fs.readFileSync(manifestFile);
const manifestSha256 = crypto.createHash("sha256").update(manifestBytes).digest("hex");
const manifest = JSON.parse(manifestBytes.toString("utf8")) as Manifest;
let evidence: Evidence | undefined;
let evidenceState = "";
if (!fs.existsSync(evidencePath)) {
  evidenceState = "evidence artifact is missing";
} else {
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8")) as Evidence;
    if (evidence.manifestSha256 !== manifestSha256) evidenceState = "evidence manifest SHA-256 is stale";
  } catch {
    evidenceState = "evidence artifact is invalid";
  }
}
const contexts = new Map<string, Set<string>>();
if (evidence && !evidenceState) {
  for (const suite of evidence.suites) {
    if (suite.passed && !suite.skipped) contexts.set(suite.context, new Set(suite.endpointKeys));
  }
}
const endpoints = [...new Map(manifest.mutations.map((item) => [keyOf(item), item])).values()]
  .sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
if (new Set(endpoints.map(keyOf)).size !== endpoints.length) throw new Error("Duplicate endpoint keys in coverage input");
const rows = endpoints.map((endpoint) => ({ ...endpoint, key: keyOf(endpoint), ...disposition(endpoint, contexts, evidenceState) }));
if (rows.length !== manifest.mutations.reduce((keys, item) => keys.add(keyOf(item)), new Set<string>()).size) throw new Error("Manifest endpoint disposition mismatch");
if (rows.some((row) => row.tested === undefined || !row.reason)) throw new Error("Every manifest endpoint needs a disposition");
const totals = (items: typeof rows) => ({ tested: items.filter((item) => item.tested).length, total: items.length });
const overall = totals(rows);
const categories = Object.fromEntries((["payments", "admin", "user-data", "other"] as Risk[]).map((risk) => [risk, totals(rows.filter((row) => row.risk === risk))]));
if (rows.filter((row) => handlerFixtureExclusions.has(row.key)).length !== 30) throw new Error("Expected exactly 30 handler-fixture exclusions");

const report = {
  schemaVersion: 1, generatedBy: "scripts/generate-mutation-auth-coverage.ts",
  manifest: "generated/security/mutation-auth-manifest.json", manifestSha256,
  evidence: { path: path.relative(root, evidencePath), state: evidenceState || "fresh", timestamp: evidence?.timestamp ?? null },
  totals: { ...overall, remaining: overall.total - overall.tested, categories },
  endpoints: rows,
};
const evidenceSummary = evidence?.suites.map((suite) =>
  `- \`${suite.id}\`: **${suite.passed && !suite.skipped ? "passed" : suite.skipped ? "skipped" : "failed"}**, ${suite.endpointKeys.length} exact endpoint keys, context \`${suite.context}\`.`,
) ?? ["- No evidence suites were recorded."];
const markdown = [
  "# Mutation authorization coverage report", "",
  "Generated deterministically from `generated/security/mutation-auth-manifest.json` by `scripts/generate-mutation-auth-coverage.ts`.",
  "", `## Coverage summary`, "", `- **Tested: ${overall.tested}/${overall.total}**; remaining: **${overall.total - overall.tested}**.`,
  `- Admin: **${categories.admin.tested}/${categories.admin.total}**; payments: **${categories.payments.tested}/${categories.payments.total}**; user-data: **${categories["user-data"].tested}/${categories["user-data"].total}**; other: **${categories.other.tested}/${categories.other.total}**.`,
  "", "## Methodology and live evidence", "",
  "- Every unique `METHOD effectivePath` in the manifest receives exactly one tested/untested disposition; duplicate registrations are normalized to one reachable endpoint.",
  `- Evidence state: **${evidenceState || "fresh"}**; manifest SHA-256: \`${manifestSha256}\`; run timestamp: ${evidence?.timestamp ?? "not run"}.`,
  ...evidenceSummary,
  "- An endpoint is tested only when a passing, non-skipped suite in the fresh evidence artifact names that exact endpoint in its required context. Route classification alone never promotes coverage.",
  "- Totals are a strict endpoint union, not a sum of evidence dimensions. Endpoints with both unauthenticated and cross-owner evidence are counted once.",
  "- The confirmed optimization-confirm ownership bug is fixed: missing or mismatched Stripe `metadata.userId` is rejected before DB/revenue writes.",
  "- Payments/user-data signature endpoints (2) are counted only for unsigned-request coverage. Session-self payments/user-data endpoints are counted from fresh unauthenticated evidence, except the 30 explicit handler-fixture exclusions below; only those exclusions are **not tested**.",
  "", "## Remaining risk", "",
  "Untested endpoints below need endpoint-appropriate coverage. In particular, excluded expert/provider workflows require real handler-owned resources; public/system routes and all other-category routes have no authorization assertion in this strict report.",
  "", "## Untested endpoints", "",
  "| Endpoint | Risk | Boundary | Source | Exact reason |", "| --- | --- | --- | --- | --- |",
  ...rows.filter((row) => !row.tested).map((row) => `| ${row.key} | ${row.risk} | ${row.expectedBoundary} | ${row.source}:${row.line} | ${row.reason} |`),
  "",
].join("\n");
const outputs = [
  [path.join(outputDir, "mutation-auth-coverage.json"), `${JSON.stringify(report, null, 2)}\n`],
  [path.join(outputDir, "mutation-auth-coverage.md"), markdown],
] as const;
for (const [file, content] of outputs) {
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) throw new Error(`${path.relative(root, file)} is stale; run npm run generate:mutation-auth-coverage`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}