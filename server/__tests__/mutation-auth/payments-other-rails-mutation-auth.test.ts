/**
 * Authenticated resource-ownership audit for the `payments`-risk rails that
 * live OUTSIDE `/api/bookings/*` (board task #1679). The live portion is opt-in:
 *
 *   MUTATION_AUTH_AUDIT_OK=1 npx tsx --test \
 *     server/__tests__/mutation-auth/payments-other-rails-mutation-auth.test.ts
 *
 * WHY THIS SUITE EXISTS. `payments-mutation-auth.test.ts` proves the five
 * `/api/bookings/*` payment rails and its structural gate is scoped to that
 * prefix. `mutation-auth.http.test.ts` proves the trip-scoped rails and
 * `/api/optimization-payments`. That left twelve `payments` / `resource-owner`
 * rails — vendor contracts, trip participants, the coordination fee, the
 * expert-review PaymentIntent, the ready-made purchase recourse rails, the
 * provider surcharge tiers and the expert tip — with NO live evidence, listed
 * as untested in `generated/security/mutation-auth-coverage.md`. They are
 * PROBED here rather than excluded (CLAUDE.md: an exclusion on a mutation rail
 * is an allowlist, and the exclusion list only shrinks). Two of the twelve have
 * no probe a live audit can make meaningful and are named in `OUT_OF_SCOPE`
 * with the reason.
 *
 * EVERY PROBE ADDRESSES A REAL ROW OWNED BY SOMEONE ELSE
 * (`./payments-other-rails-fixture`). A 404 against a random id is not
 * authorization evidence (`payment-mutation-auth.manifest.ts`'s own sentence),
 * so a refusal here is the gate answering and never the row being absent.
 *
 * EACH RAIL IS PROBED FOUR-PLUS WAYS: anonymous ⇒ 401; the STRANGER (party to
 * nothing) and every named WRONG PARTY for that rail ⇒ the handler's OWN
 * recorded refusal status, with the resource row proven unchanged; and the
 * AUTHORIZED party ⇒ not 401/403/404 ("past the gate").
 *
 * THE REFUSAL STATUSES ARE RECORDED FROM THE LIVE HANDLERS, NOT CHOSEN. They
 * are NOT uniform, and that is a finding rather than something smoothed over
 * here: the contract, participant, coordination and expert-review rails answer
 * 403 for "not yours" and 404 for "no such thing" (an existence oracle), while
 * the ready-made recourse rails and the surcharge-tier rail answer 404 for both
 * — Locked Decision 40's posture. Asserting each rail's own answer is what
 * makes a change to it visible.
 *
 * STATED NEGATIVE SPACE, and it is the load-bearing half:
 *  - This is an AUTHORIZATION audit, not a state-machine audit. The authorized
 *    arm asserts only that the answer is not a refusal; the fixture is shaped
 *    so no authorized arm reaches Stripe (see the fixture's own note), which
 *    means the post-gate money logic is NOT exercised here — §14/§15 suites own
 *    it.
 *  - The stranger on `PUT /api/provider/services/:id/surcharge-tiers` is
 *    refused by the EARNER-ROLE backstop (`EARNER_SELF_SERVICE_PREFIXES`), not
 *    by the handler; the handler's own ownership check is proven by the
 *    `expert` arm, an earner who does not own the listing.
 *  - The ready-made request-revision buyer arm answers 409 because the fixture
 *    has already spent the revision; the rail's own claim (advisor grant +
 *    expert mail) is therefore never fired by this suite, by design.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { endpointKey } from "../../../scripts/mutation-auth/endpoint-key";
import { diagnosticBody, liveAuditRefusalReason } from "./booking-resource-fixture";
import {
  type PaymentsOtherRailsFixture,
  type PrincipalName,
  type ResourceKind,
  createPaymentsOtherRailsFixture,
  destroyPaymentsOtherRailsFixture,
  resourceId,
  resourceSnapshot,
} from "./payments-other-rails-fixture";

type Method = "POST" | "PUT" | "PATCH" | "DELETE";
type Risk = "payments" | "user-data" | "admin" | "other";
type ManifestMutation = {
  method: Method; effectivePath: string; source: string; line: number; risk: Risk; expectedBoundary: string;
};
type MutationManifest = { mutations: ManifestMutation[] };

const LIVE_AUDIT = process.env.MUTATION_AUTH_AUDIT_OK === "1";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const manifest = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), "generated/security/mutation-auth-manifest.json"),
  "utf8",
)) as MutationManifest;

// ONE spelling of the endpoint key (scripts/mutation-auth/endpoint-key.ts, §18 rule 1).
const keyOf = endpointKey;

type Refusal = { principal: PrincipalName; label: string; status: number };
type Probe = {
  /** Manifest key, so a renamed or moved route fails here rather than silently dropping out. */
  endpoint: string;
  resource: ResourceKind;
  /** `path` puts the resource id in `:id`; `body` sends it in the body under `bodyIdField`. */
  addressing: "path" | "body";
  bodyIdField?: string;
  /** Extra body fields the handler validates BEFORE it authorizes. */
  body?: (fixture: PaymentsOtherRailsFixture) => Record<string, unknown>;
  refusals: readonly Refusal[];
  authorized: { principal: PrincipalName; label: string };
  /** True when the authorized arm legitimately writes the row; asserted to land. */
  mutates?: boolean;
};

/**
 * The ten rails this fixture can address. Every refusal status below was
 * recorded from the live handler (see the header). The `expert-requests`
 * rail's serviceType is deliberately NOT a tier: the handler authorizes BEFORE
 * it resolves the tier, so the wrong parties' 403 is the ownership answer and
 * the owner's 400 proves the same body got past it — without creating a
 * PaymentIntent.
 */
const PROBES: readonly Probe[] = [
  {
    endpoint: "POST /api/contracts/:id/milestone", resource: "contract", addressing: "path",
    body: () => ({ name: "Mutation audit milestone", amount: 50, dueDate: "2031-02-01", status: "pending" }),
    refusals: [
      { principal: "stranger", label: "stranger (party to nothing)", status: 403 },
      { principal: "member", label: "trip participant (party to the plan, not its owner)", status: 403 },
    ],
    authorized: { principal: "traveler", label: "trip owner (authorized)" }, mutates: true,
  },
  {
    endpoint: "POST /api/contracts/:id/payment", resource: "contract", addressing: "path",
    body: () => ({ amount: 25, milestoneName: "Mutation audit milestone" }),
    refusals: [
      { principal: "stranger", label: "stranger (party to nothing)", status: 403 },
      { principal: "member", label: "trip participant (party to the plan, not its owner)", status: 403 },
    ],
    authorized: { principal: "traveler", label: "trip owner (authorized)" }, mutates: true,
  },
  {
    endpoint: "POST /api/participants/:id/payment", resource: "participant", addressing: "path",
    body: () => ({ amount: 10, method: "cash", notes: "mutation audit" }),
    refusals: [
      { principal: "stranger", label: "stranger (party to nothing)", status: 403 },
      // The participant row the rail addresses IS this principal's own row — and recording a
      // payment on it is still the trip OWNER's act, not theirs.
      { principal: "member", label: "the participant themself (wrong party)", status: 403 },
    ],
    authorized: { principal: "traveler", label: "trip owner (authorized)" }, mutates: true,
  },
  {
    endpoint: "POST /api/coordination-states/:id/pay", resource: "coordination", addressing: "path",
    refusals: [
      { principal: "stranger", label: "stranger (party to nothing)", status: 403 },
      { principal: "expert", label: "assigned coordinator (wrong party)", status: 403 },
      { principal: "admin", label: "admin (may refund, may not pay a traveler's fee)", status: 403 },
    ],
    authorized: { principal: "traveler", label: "engagement owner (authorized)" },
  },
  {
    endpoint: "POST /api/coordination-states/:id/pay/confirm", resource: "coordination", addressing: "path",
    refusals: [
      { principal: "stranger", label: "stranger (party to nothing)", status: 403 },
      { principal: "expert", label: "assigned coordinator (wrong party)", status: 403 },
      { principal: "admin", label: "admin (may refund, may not confirm a traveler's fee)", status: 403 },
    ],
    authorized: { principal: "traveler", label: "engagement owner (authorized)" },
  },
  {
    endpoint: "POST /api/coordination-states/:id/refund", resource: "coordination", addressing: "path",
    refusals: [
      { principal: "stranger", label: "stranger (party to nothing)", status: 403 },
      { principal: "traveler", label: "engagement owner / payer (not an admin)", status: 403 },
      { principal: "expert", label: "assigned coordinator (not an admin)", status: 403 },
    ],
    authorized: { principal: "admin", label: "admin (authorized)" },
  },
  {
    endpoint: "POST /api/expert-requests/payment-intent", resource: "variant", addressing: "body",
    bodyIdField: "variantId",
    body: (fixture) => ({
      comparisonId: fixture.comparisonId, destination: "Kyoto", serviceType: "mutation_auth_not_a_tier",
    }),
    refusals: [
      { principal: "stranger", label: "stranger (party to nothing)", status: 403 },
      { principal: "member", label: "trip participant on the comparison's plan (not its owner)", status: 403 },
    ],
    authorized: { principal: "traveler", label: "comparison owner (authorized)" },
  },
  {
    // BEFORE the concern probe only for readability; each probe re-reads its own "before".
    endpoint: "POST /api/ready-made/purchases/:id/request-revision", resource: "purchase", addressing: "path",
    body: () => ({ note: "mutation audit" }),
    refusals: [
      { principal: "stranger", label: "stranger (party to nothing)", status: 404 },
      { principal: "expert", label: "the listing's author / seller (wrong party)", status: 404 },
    ],
    authorized: { principal: "traveler", label: "buyer (authorized)" },
  },
  {
    endpoint: "POST /api/ready-made/purchases/:id/concern", resource: "purchase", addressing: "path",
    body: () => ({ reason: "Mutation authorization audit concern" }),
    refusals: [
      { principal: "stranger", label: "stranger (party to nothing)", status: 404 },
      { principal: "expert", label: "the listing's author / seller (wrong party)", status: 404 },
    ],
    authorized: { principal: "traveler", label: "buyer (authorized)" }, mutates: true,
  },
  {
    endpoint: "PUT /api/provider/services/:id/surcharge-tiers", resource: "providerService", addressing: "path",
    body: () => ({ tiers: [{ radiusKm: 10, fee: 15 }] }),
    refusals: [
      // Refused by the earner-role backstop before the handler (see the header's negative space).
      { principal: "stranger", label: "stranger (ordinary user, party to nothing)", status: 403 },
      // An EARNER the backstop lets through: only the handler's ownership check can refuse them.
      { principal: "expert", label: "earner who does not own the listing (wrong owner)", status: 404 },
    ],
    authorized: { principal: "provider", label: "listing owner (authorized)" }, mutates: true,
  },
];

/**
 * The two rails in this family the live audit cannot make meaningful, each
 * with the reason it is out of scope rather than unprobed. Named so the
 * structural gate below stays exact.
 */
const OUT_OF_SCOPE: Readonly<Record<string, string>> = {
  "POST /api/expert/:expertId/tip":
    "Gated 501 for every authenticated caller (W0.4: the tip payment leg does not exist), and :expertId is a TARGET, not an owned resource — there is no wrong-user principal. Its 401 arm is proven by the unauthenticated suite; re-audit when the two-step tip payment flow lands.",
  "POST /api/ready-made/:id/purchase/confirm":
    "Stripe-PaymentIntent boundary: the handler retrieves the client-named PaymentIntent from Stripe FIRST and authorizes on its metadata.buyerId, so presenting another buyer's resource requires a real succeeded PaymentIntent. The live server runs on a stub Stripe key, so every principal gets the same Stripe failure — no ownership signal. Needs a mocked-Stripe in-process test (the optimization-confirm-ownership.test.ts shape).",
};

/**
 * The family this suite owns: `payments`-risk, `resource-owner`-boundary rails
 * that no other live suite already proves. `/api/bookings/*` belongs to
 * `payments-mutation-auth.test.ts`; `/api/optimization-payments*` and
 * `/api/trips/*` to `mutation-auth.http.test.ts` / the optimization-confirm test.
 */
const ownedByAnotherSuite = (pathname: string) =>
  /^\/api\/(?:bookings|optimization-payments|trips)(?:\/|$)/.test(pathname);

const REFUSAL_STATUSES = new Set([401, 403, 404]);

let fixture: PaymentsOtherRailsFixture | undefined;

function emitEvidence(evidence: Record<string, unknown>): void {
  console.log(JSON.stringify({ audit: "payments-other-rails-ownership", ...evidence }));
}

before(async () => {
  if (!LIVE_AUDIT) return;
  const refusal = liveAuditRefusalReason({
    nodeEnv: process.env.NODE_ENV,
    baseUrl: BASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    productionDatabaseUrl: process.env.PROD_DATABASE_URL,
  });
  if (refusal) throw new Error(`Refusing mutation authorization audit: ${refusal}`);
  fixture = await createPaymentsOtherRailsFixture(BASE_URL);
});

after(async () => {
  if (fixture) await destroyPaymentsOtherRailsFixture(fixture);
});

test("every probed rail is a real `payments` route in the generated manifest", () => {
  const byKey = new Map(manifest.mutations.map((mutation) => [keyOf(mutation), mutation]));
  for (const probe of PROBES) {
    const mutation = byKey.get(probe.endpoint);
    assert.ok(mutation, `${probe.endpoint} is not in the generated manifest — it was renamed, moved or removed`);
    assert.equal(mutation.risk, "payments", `${probe.endpoint} is risk '${mutation.risk}', not 'payments'`);
  }
});

test("the probe set names no rail twice, and every probe names at least one wrong party", () => {
  const keys = PROBES.map((probe) => probe.endpoint);
  assert.deepEqual([...new Set(keys)].sort(), [...keys].sort(), "a rail probed twice hides which arm proved it");
  for (const probe of PROBES) {
    assert.ok(probe.refusals.some((refusal) => refusal.principal === "stranger"), `${probe.endpoint} has no stranger arm`);
    assert.ok(
      probe.refusals.every((refusal) => refusal.principal !== probe.authorized.principal),
      `${probe.endpoint} names its authorized principal as a refused one`,
    );
    assert.ok(probe.addressing === "path" || probe.bodyIdField, `${probe.endpoint}: body addressing needs a field`);
  }
});

test("every payments resource-owner rail outside the other suites' families is probed or out of scope", () => {
  // The structural gate: a rail added to this family later must be probed or named
  // out of scope, so the audit cannot silently shrink (it would read green).
  const family = manifest.mutations
    .filter((mutation) => mutation.risk === "payments" && mutation.expectedBoundary === "resource-owner")
    .filter((mutation) => !ownedByAnotherSuite(mutation.effectivePath))
    .map(keyOf);
  const probed = new Set(PROBES.map((probe) => probe.endpoint));
  const missing = [...new Set(family)].filter((key) => !probed.has(key) && !(key in OUT_OF_SCOPE)).sort();
  assert.deepEqual(missing, [], `unprobed payments resource-owner rails: ${missing.join(", ")}`);
  const stray = [...probed, ...Object.keys(OUT_OF_SCOPE)].filter((key) => !family.includes(key)).sort();
  assert.deepEqual(stray, [], `probes or exclusions outside this suite's family: ${stray.join(", ")}`);
});

test("every out-of-scope rail is real, carries a reason, and is not also probed", () => {
  const byKey = new Map(manifest.mutations.map((mutation) => [keyOf(mutation), mutation]));
  const probed = new Set(PROBES.map((probe) => probe.endpoint));
  for (const [endpoint, reason] of Object.entries(OUT_OF_SCOPE)) {
    assert.ok(byKey.has(endpoint), `${endpoint} is out-of-scope but not in the manifest — remove the stale entry`);
    assert.ok(reason.trim().length > 40, `${endpoint} needs a real reason, not a placeholder`);
    assert.ok(!probed.has(endpoint), `${endpoint} is both probed and out-of-scope`);
  }
});

test("live audit safety guard fails closed before any fixture row is created", () => {
  const safe = { nodeEnv: "test", baseUrl: "http://127.0.0.1:5000" };
  assert.equal(liveAuditRefusalReason(safe), undefined);
  assert.match(liveAuditRefusalReason({ ...safe, nodeEnv: "production" }) ?? "", /NODE_ENV=production/);
  assert.match(liveAuditRefusalReason({ ...safe, baseUrl: "https://traveloure.com" }) ?? "", /not loopback/);
  assert.match(liveAuditRefusalReason({ ...safe, baseUrl: "not a URL" }) ?? "", /invalid/);
  assert.match(
    liveAuditRefusalReason({ ...safe, databaseUrl: "postgres://p", productionDatabaseUrl: "postgres://p" }) ?? "",
    /equals PROD_DATABASE_URL/,
  );
});

test("other payment rails: anonymous 401, every wrong party refused with the row unchanged, the authorized party passes the gate", {
  skip: !LIVE_AUDIT && "set MUTATION_AUTH_AUDIT_OK=1 to run live HTTP authorization probes",
}, async () => {
  assert.ok(fixture, "the payments-other-rails fixture was not created");
  const active = fixture;
  const byKey = new Map(manifest.mutations.map((mutation) => [keyOf(mutation), mutation]));

  const send = async (probe: Probe, principal: string, cookie: string | undefined) => {
    const mutation = byKey.get(probe.endpoint)!;
    const id = resourceId(active, probe.resource);
    const requestPath = probe.addressing === "path"
      ? mutation.effectivePath.replace(":id", encodeURIComponent(id))
      : mutation.effectivePath;
    const body = {
      ...(probe.addressing === "body" ? { [probe.bodyIdField!]: id } : {}),
      ...(probe.body?.(active) ?? {}),
    };
    const response = await fetch(`${BASE_URL}${requestPath}`, {
      method: mutation.method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body), redirect: "manual",
    });
    const text = await diagnosticBody(response);
    emitEvidence({
      kind: "probe", endpoint: probe.endpoint, principal, source: mutation.source, line: mutation.line,
      resource: probe.resource, addressing: probe.addressing, url: `${BASE_URL}${requestPath}`,
      actualStatus: response.status, response: text,
    });
    return { status: response.status, text };
  };

  for (const probe of PROBES) {
    const snapshot = () => resourceSnapshot(active, probe.resource);
    const before = await snapshot();
    assert.notEqual(before, "[]", `${probe.endpoint}: the fixture row this probe addresses does not exist`);

    const anonymous = await send(probe, "anonymous", undefined);
    assert.equal(anonymous.status, 401, `${probe.endpoint} as anonymous: expected 401, got ${anonymous.status}: ${anonymous.text}`);
    assert.equal(await snapshot(), before, `${probe.endpoint}: an anonymous caller must not change the row`);

    for (const refusal of probe.refusals) {
      const refused = await send(probe, refusal.label, active.cookies[refusal.principal]);
      assert.equal(
        refused.status, refusal.status,
        `${probe.endpoint} as ${refusal.label}: expected ${refusal.status}, got ${refused.status}: ${refused.text}`,
      );
      assert.equal(await snapshot(), before, `${probe.endpoint}: a refused ${refusal.label} must not change the row`);
    }

    const authorized = await send(probe, probe.authorized.label, active.cookies[probe.authorized.principal]);
    assert.ok(
      !REFUSAL_STATUSES.has(authorized.status),
      `${probe.endpoint} as ${probe.authorized.label}: got a refusal (${authorized.status}), so the gate refuses its authorized party: ${authorized.text}`,
    );
    if (probe.mutates) {
      assert.notEqual(await snapshot(), before, `${probe.endpoint}: the authorized party's write must land`);
    }
  }

  emitEvidence({
    kind: "summary", probed: PROBES.length,
    wrongPartyArms: PROBES.reduce((sum, probe) => sum + probe.refusals.length, 0),
    outOfScope: Object.keys(OUT_OF_SCOPE),
  });
});
