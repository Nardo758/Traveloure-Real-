/**
 * Unauthenticated, real-HTTP authorization audit for the non-admin payment
 * and user-data mutation surface.
 *
 * The static manifest checks are always safe. The HTTP portion is deliberately
 * opt-in and must target an already-running local server:
 *
 *   MUTATION_AUTH_AUDIT_OK=1 npx tsx --test \
 *     server/__tests__/mutation-auth/non-admin-payments-user-data-mutation-auth.http.test.ts
 *
 * This suite never creates a user, logs in, or sends a cookie. A request is
 * useful evidence only when middleware rejects it before its mutation handler.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

type Method = "POST" | "PUT" | "PATCH" | "DELETE";
type Boundary = "admin-role" | "session-self" | "resource-owner" | "signature" | "public-or-system";
type Risk = "payments" | "user-data" | "admin" | "other";

type ManifestMutation = {
  method: Method;
  path: string;
  effectivePath: string;
  source: string;
  line: number;
  risk: Risk;
  expectedBoundary: Boundary;
};

type MutationManifest = {
  uniqueMethodNormalizedPathCount: number;
  mutations: ManifestMutation[];
};

const LIVE_AUDIT = process.env.MUTATION_AUTH_AUDIT_OK === "1";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const MANIFEST_PATH = path.join(process.cwd(), "generated/security/mutation-auth-manifest.json");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as MutationManifest;

const endpointKey = (mutation: Pick<ManifestMutation, "method" | "effectivePath">) =>
  `${mutation.method} ${mutation.effectivePath}`;

// These endpoints reject a request that omits Stripe-Signature before invoking
// their webhook processors. Keep exact statuses so a changed rejection is
// recorded as an intentional audit update rather than silently accepted.
const SIGNATURE_REJECTION_STATUS: Readonly<Record<string, number>> = {
  "POST /api/bookings/webhooks/stripe": 400,
  "POST /api/webhooks/stripe": 400,
};

const uniqueNonAdminPaymentsAndUserData = (() => {
  const seen = new Set<string>();
  return manifest.mutations.filter((mutation) => {
    const key = endpointKey(mutation);
    if (seen.has(key)) return false;
    seen.add(key);
    return (
      (mutation.risk === "payments" || mutation.risk === "user-data") &&
      mutation.expectedBoundary !== "admin-role"
    );
  });
})();

const publicOrSystemExclusions = uniqueNonAdminPaymentsAndUserData
  .filter((mutation) => mutation.expectedBoundary === "public-or-system")
  .map((mutation) => ({
    endpoint: endpointKey(mutation),
    reason:
      "Excluded: manifest classifies this endpoint as public-or-system, so an unauthenticated " +
      "request is not authorization-required evidence.",
  }));

const probes = uniqueNonAdminPaymentsAndUserData.filter(
  (mutation) => mutation.expectedBoundary !== "public-or-system",
);

function concretePath(template: string): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_all, name: string) =>
    encodeURIComponent(`mutation-auth-${name}`),
  );
}

function productionDatabaseSelected(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  const productionDatabaseUrl = process.env.PROD_DATABASE_URL;
  return process.env.NODE_ENV === "production" ||
    Boolean(databaseUrl && productionDatabaseUrl && databaseUrl === productionDatabaseUrl);
}

async function responseBody(response: Response): Promise<string> {
  const body = await response.text();
  return body.length <= 500 ? body : `${body.slice(0, 500)}…`;
}

function emitEvidence(evidence: Record<string, unknown>): void {
  // One JSON document per line makes this suitable for CI artifact collection.
  console.log(JSON.stringify({ audit: "mutation-auth-unauthenticated", ...evidence }));
}

test("generated manifest has a complete, deduplicated non-admin payment and user-data audit scope", () => {
  const allKeys = new Set(manifest.mutations.map(endpointKey));
  assert.equal(
    manifest.uniqueMethodNormalizedPathCount,
    546,
    "this audit is pinned to the checked-in 546-endpoint generated manifest",
  );
  assert.equal(
    allKeys.size,
    manifest.uniqueMethodNormalizedPathCount,
    "checked-in manifest must contain exactly one effective row per endpoint",
  );
  assert.ok(uniqueNonAdminPaymentsAndUserData.length > 0, "audit scope must not be empty");
  assert.ok(probes.length > 0, "authorization-required probe scope must not be empty");

  for (const mutation of uniqueNonAdminPaymentsAndUserData) {
    assert.ok(
      ["session-self", "resource-owner", "signature", "public-or-system"].includes(
        mutation.expectedBoundary,
      ),
      `${endpointKey(mutation)} has an unsupported non-admin boundary`,
    );
    if (mutation.expectedBoundary === "signature") {
      assert.equal(
        SIGNATURE_REJECTION_STATUS[endpointKey(mutation)],
        400,
        `${endpointKey(mutation)} needs its exact signature-rejection status recorded`,
      );
    }
  }

  for (const exclusion of publicOrSystemExclusions) {
    emitEvidence({ kind: "excluded", ...exclusion });
  }
});

test(
  "every non-admin payment and user-data authorization boundary rejects unauthenticated HTTP",
  { skip: !LIVE_AUDIT && "set MUTATION_AUTH_AUDIT_OK=1 to run local live HTTP audit" },
  async () => {
    assert.ok(!productionDatabaseSelected(), "Refusing mutation authorization audit against production");

    // Deliberately sequential: every route sees the same unauthenticated
    // request shape, and no parallel request can obscure route-level evidence.
    for (const mutation of probes) {
      const key = endpointKey(mutation);
      const requestPath = concretePath(mutation.effectivePath);
      const response = await fetch(`${BASE_URL}${requestPath}`, {
        method: mutation.method,
        headers: { "content-type": "application/json" },
        body: "{}",
        redirect: "manual",
      });
      const body = await responseBody(response);
      const expectedSignatureStatus = SIGNATURE_REJECTION_STATUS[key];
      const expectedStatus = mutation.expectedBoundary === "signature"
        ? expectedSignatureStatus
        : 401;

      emitEvidence({
        kind: "probe",
        endpoint: key,
        source: mutation.source,
        line: mutation.line,
        boundary: mutation.expectedBoundary,
        url: `${BASE_URL}${requestPath}`,
        expectedStatus,
        actualStatus: response.status,
        response: body,
      });

      assert.notEqual(response.status, 404, `${key} is unmounted or concrete path is invalid`);
      if (mutation.expectedBoundary === "signature") {
        assert.ok(
          response.status < 200 || response.status >= 300,
          `${key} accepted an unsigned request with ${response.status}`,
        );
        assert.equal(
          response.status,
          expectedSignatureStatus,
          `${key} signature rejection status changed; update the recorded expectation deliberately`,
        );
      } else {
        assert.equal(
          response.status,
          401,
          `${key} (${mutation.expectedBoundary}) must reject unauthenticated requests before its handler`,
        );
      }
    }
  },
);