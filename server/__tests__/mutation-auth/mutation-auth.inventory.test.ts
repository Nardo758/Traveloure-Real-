/**
 * Task #1675 — mutation authorization inventory.
 *
 * This is deliberately a source inventory, rather than a list of guessed IDs.
 * It enumerates every Express mutation declaration in the live route directories
 * and gives every declaration a disposition.  The companion HTTP suite only
 * promotes an endpoint to TESTED after exercising a real User B-owned fixture.
 *
 * Run (inventory only, no server or database required):
 *   npx tsx --test server/__tests__/mutation-auth/mutation-auth.inventory.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

type Disposition = {
  status: "TESTED" | "UNTESTED";
  reason: string;
};

const ROOT = process.cwd();
const ROUTE_ROOTS = [
  "server/routes.ts",
  "server/routes",
  // This router is registered by the Replit integration, but does not live in
  // server/routes. Include it so chat mutations cannot disappear from the audit.
  "server/replit_integrations/chat/routes.ts",
];

// Includes shared-route declarations (for example api.trips.update.path) as
// well as literal Express paths. Keeping the symbolic route in the report is
// intentional: it names the canonical endpoint even when its path is defined
// in shared/routes rather than duplicated in a router.
const declaration = /\b(?:router|app)\.(post|put|patch|delete)\(\s*(?:(["'`])([^"'`]+)\2|(api\.[A-Za-z0-9_.]+\.path))/g;

function routeFiles(entry: string): string[] {
  const absolute = path.join(ROOT, entry);
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [absolute];
  return fs.readdirSync(absolute, { recursive: true })
    .filter((file) => typeof file === "string" && file.endsWith(".ts") && !file.split(path.sep).includes("__tests__"))
    .map((file) => path.join(absolute, file as string));
}

function disposition(method: string, endpoint: string): Disposition {
  // These are the only endpoint declarations promoted by the focused HTTP
  // proof in mutation-auth.http.test.ts. Their fixture is a real User B trip.
  if (
    (method === "PATCH" || method === "DELETE") &&
    (endpoint === "/api/trips/:id" || endpoint === "api.trips.update.path" || endpoint === "api.trips.delete.path")
  ) {
    return {
      status: "TESTED",
      reason: "Unauthenticated and User A → real User B trip requests; persisted User B row is compared before/after.",
    };
  }

  // All remaining routes are intentionally explicit debt, not silently omitted.
  // Reasons are categorized by the safety constraint that prevented a safe
  // isolated proof in this first framework pass.
  if (/stripe|payment|payout|checkout|wallet|credits|identity|onboard/i.test(endpoint)) {
    return { status: "UNTESTED", reason: "Would create a payment/identity provider side effect; excluded to avoid external calls." };
  }
  if (/generate|ai|publish|email|notification|instagram|webhook|bulk-invite|invite/i.test(endpoint)) {
    return { status: "UNTESTED", reason: "Can invoke AI, social, email, webhook, or other outbound integration; excluded to avoid external calls." };
  }
  if (/^\/api\/admin\//.test(endpoint)) {
    return { status: "UNTESTED", reason: "Admin-owned surface, not a User A/User B user-owned-resource authorization case." };
  }
  if (/^\/api\/(auth|contact|search|cross-sell-events)/.test(endpoint)) {
    return { status: "UNTESTED", reason: "Account/public telemetry mutation; no independently owned User B resource identifier." };
  }
  if (endpoint.includes(":")) {
    return { status: "UNTESTED", reason: "User-owned or role-owned identifier route; needs a dedicated schema-valid User B fixture and no-side-effect proof." };
  }
  return { status: "UNTESTED", reason: "Session-scoped/create mutation; no User B resource identifier to target in this framework pass." };
}

test("task #1675 inventory gives every literal effective mutation a disposition", () => {
  const entries: Array<{ source: string; method: string; endpoint: string; disposition: Disposition }> = [];
  for (const root of ROUTE_ROOTS) {
    for (const file of routeFiles(root)) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(declaration)) {
        const endpoint = match[3] ?? match[4];
        if (!endpoint) continue;
        entries.push({
          source: path.relative(ROOT, file),
          method: match[1].toUpperCase(),
          endpoint,
          disposition: disposition(match[1].toUpperCase(), endpoint),
        });
      }
    }
  }

  assert.ok(entries.length > 0, "route scan unexpectedly found no literal mutation declarations");
  assert.ok(entries.every((entry) => entry.disposition.status && entry.disposition.reason.length > 0));

  // The log is intentionally machine-readable: CI artifacts provide the exact,
  // source-qualified tested/untested inventory without pretending a random ID
  // 404 establishes ownership.
  console.log(`[mutation-auth inventory] ${JSON.stringify(entries)}`);
});