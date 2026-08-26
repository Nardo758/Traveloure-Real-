import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export type AdminMutation = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  source: string;
  risk: string;
};

/**
 * These are the mounted sources which define privileged mutation surfaces.
 * Keep this list deliberately small: it is an inventory of effective routes,
 * not every historical route-looking string in the repository.
 */
const EFFECTIVE_ROUTE_SOURCES = [
  "server/routes.ts",
  "server/routes/admin.routes.ts",
  "server/routes/admin-markets.routes.ts",
  "server/routes/demand.routes.ts",
  "server/routes/service-requests.routes.ts",
  "server/routes/ea.routes.ts",
  // These three mutations are intentionally outside /api/admin, but use a
  // local requireAdmin guard and therefore belong in this authorization audit.
  "server/routes/content.routes.ts",
] as const;

const ROUTE_RE =
  /(?:router|app)\.(post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

function privilegedRisk(routePath: string, source: string): string | undefined {
  if (routePath.startsWith("/api/admin/")) {
    return "platform-admin write; routes.ts mounts the default-deny /api/admin adminApiGuard before this router";
  }
  if (routePath.startsWith("/api/ea/")) {
    return "EA-console write; ea.routes.ts applies isEA to /api/ea, which rejects ordinary authenticated users";
  }
  if (
    source === "server/routes/content.routes.ts" &&
    (routePath.startsWith("/api/travelpulse/ai/") || routePath === "/api/discovery/scan")
  ) {
    return "out-of-prefix privileged write; content.routes.ts applies a DB-backed requireAdmin guard";
  }
  return undefined;
}

/**
 * Discover literal mutation registrations rather than duplicating paths by
 * hand. A newly registered privileged route becomes a test case immediately;
 * the coverage assertion below also makes the discovered/tested relationship
 * explicit in test output.
 */
export function discoverAdminMutations(root = process.cwd()): AdminMutation[] {
  const found: AdminMutation[] = [];
  for (const source of EFFECTIVE_ROUTE_SOURCES) {
    const text = fs.readFileSync(path.join(root, source), "utf8");
    for (const match of Array.from(text.matchAll(ROUTE_RE))) {
      const routePath = match[2];
      const risk = privilegedRisk(routePath, source);
      if (!risk) continue;
      found.push({
        method: match[1].toUpperCase() as AdminMutation["method"],
        path: routePath,
        source,
        risk,
      });
    }
  }
  return found.sort((a, b) =>
    `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
  );
}

export function mutationKey(mutation: Pick<AdminMutation, "method" | "path">): string {
  return `${mutation.method} ${mutation.path}`;
}

/**
 * Do not allow a test manifest to silently fall behind route registration.
 */
export function assertCasesCoverDiscoveredInventory(
  cases: readonly Pick<AdminMutation, "method" | "path" | "risk">[],
  discovered: readonly Pick<AdminMutation, "method" | "path">[] = discoverAdminMutations(),
): void {
  const caseKeys = new Set(cases.map(mutationKey));
  const discoveredKeys = new Set(discovered.map(mutationKey));
  const omitted = Array.from(discoveredKeys).filter((key) => !caseKeys.has(key));
  const stale = Array.from(caseKeys).filter((key) => !discoveredKeys.has(key));

  assert.deepEqual(
    omitted,
    [],
    `Admin mutation authorization test omissions: ${omitted.join(", ")}`,
  );
  assert.deepEqual(
    stale,
    [],
    `Admin mutation authorization test cases without a live inventory entry: ${stale.join(", ")}`,
  );
  for (const testCase of cases) {
    assert.ok(testCase.risk.length > 0, `${mutationKey(testCase)} needs explicit risk evidence`);
  }
}