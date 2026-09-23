/**
 * Authenticated resource-ownership audit for the `/api/bookings/*` PAYMENT
 * rails.  The live portion is opt-in:
 *
 *   MUTATION_AUTH_AUDIT_OK=1 npx tsx --test \
 *     server/__tests__/mutation-auth/payments-mutation-auth.test.ts
 *
 * WHY THIS SUITE EXISTS.  `expert-provider-mutation-auth.test.ts` probes the
 * handler-owned rails under the role-console prefixes, and its scope predicate
 * is `underRoleConsole` — `/api/expert`, `/api/provider`, `/api/local-expert`.
 * The payment rails here are `/api/bookings/*`, so no prefix backstop sees them
 * and that suite's scope cannot reach them.  They were marked `untested` in
 * `payment-mutation-auth.manifest.ts` with the correct reason: no isolated
 * authenticated HTTP fixture mounted the real route with User A / User B
 * sessions.  That fixture now exists (`./booking-resource-fixture`), so these
 * rails are PROBED rather than excluded — CLAUDE.md's rule that an exclusion on
 * a mutation rail is an allowlist, and that the exclusion list only shrinks.
 *
 * THE AUTHORIZED PARTY HERE IS THE TRAVELER, NOT THE LISTING OWNER, which is
 * the whole reason the fixture grew a third principal.  On these rails the
 * owner is a REFUSED party, so proving them with the owner alone would prove
 * nothing about a caller who is party to neither side.  Every rail is probed as
 * anonymous, as the STRANGER (party to nothing), and as the OWNER (party to the
 * listing but not authorized here) — all three refusals asserted with the row
 * proven unchanged — and then as the TRAVELER, who must get past the gate.
 *
 * A 404 AGAINST A RANDOM UUID IS NOT AUTHORIZATION EVIDENCE
 * (`payment-mutation-auth.manifest.ts`'s own sentence).  Every probe below
 * addresses a REAL row that really exists and is really owned by someone else,
 * so a refusal is the gate answering and not the row being absent.
 *
 * STATED NEGATIVE SPACE, and it is the load-bearing half:
 *  - This is an AUTHORIZATION audit, not a state-machine audit.  The refusal
 *    arms assert EXACT statuses, because a changed refusal is exactly what this
 *    suite exists to catch.  The traveler arm asserts only that the answer is
 *    NOT 401/403/404 — "past the gate" — because what the handler says next
 *    depends on a state machine this fixture deliberately does not build
 *    (no balance, no components, no delivery, no Stripe id — §19a).  Pinning
 *    the exact post-gate status here would make a legitimate handler fix fail
 *    an authorization suite.
 *  - It proves each rail refuses the wrong principal.  It does NOT prove the
 *    handler's subsequent money logic, which §14/§15 suites own.
 *  - `POST /api/bookings/bulk-status` is risk `user-data`, not `payments`, and
 *    is out of scope here; it is named in the dispatch as family F.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { endpointKey } from "../../../scripts/mutation-auth/endpoint-key";
import {
  type BookingResourceFixture,
  createBookingResourceFixture,
  destroyBookingResourceFixture,
  diagnosticBody,
  fixtureRowStatus,
  liveAuditRefusalReason,
} from "./booking-resource-fixture";

type Method = "POST" | "PUT" | "PATCH" | "DELETE";
type Risk = "payments" | "user-data" | "admin" | "other";
type ManifestMutation = { method: Method; effectivePath: string; source: string; line: number; risk: Risk };
type MutationManifest = { mutations: ManifestMutation[] };

const LIVE_AUDIT = process.env.MUTATION_AUTH_AUDIT_OK === "1";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const manifest = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), "generated/security/mutation-auth-manifest.json"),
  "utf8",
)) as MutationManifest;

// ONE spelling of the endpoint key (scripts/mutation-auth/endpoint-key.ts, §18 rule 1).
const keyOf = endpointKey;

/**
 * How each probed rail addresses its booking.  Two of the five take the id in
 * the BODY rather than the path — which is precisely why they need probing:
 * a body-addressed resource is the shape §14 warns about, and the only way to
 * know the id is resolved against the session is to send someone else's.
 */
type Addressing = "path" | "body";
type Probe = {
  /** Manifest key, so a renamed or moved route fails here rather than silently dropping out. */
  endpoint: string;
  addressing: Addressing;
  /** Extra body fields the handler validates BEFORE it authorizes. */
  body?: Record<string, unknown>;
  strangerStatus: number;
  ownerStatus: number;
  /** True when the TRAVELER arm legitimately mutates the row — probed last. */
  mutates?: boolean;
};

/**
 * The five `/api/bookings/*` payment rails that this fixture can address.
 *
 * The refusal statuses are RECORDED FROM THE LIVE HANDLERS, not chosen: four
 * answer 403 and `pay-balance` alone answers 404.  That inconsistency is real
 * and is reported as a finding rather than smoothed over here — Locked Decision
 * 40's posture is that "no such thing" and "not yours" are the same sentence,
 * which `pay-balance` follows and the other four do not.  Asserting each rail's
 * OWN answer is what makes a change to it visible; asserting a uniform answer
 * we wish for would fail on day one and prove nothing.
 */
const PROBES: readonly Probe[] = [
  { endpoint: "POST /api/bookings/:id/pay-balance", addressing: "path", strangerStatus: 404, ownerStatus: 404 },
  { endpoint: "POST /api/bookings/:id/confirm-completion", addressing: "path", strangerStatus: 403, ownerStatus: 403 },
  { endpoint: "POST /api/bookings/refund", addressing: "body", strangerStatus: 403, ownerStatus: 403 },
  {
    endpoint: "POST /api/bookings/confirm-payment", addressing: "body",
    // `paymentIntentId` is validated before authorization, so omitting it makes every
    // principal receive the same 400 and the probe proves nothing. A non-real id is
    // enough to reach the gate; it is never stamped on the row (§19a).
    body: { paymentIntentId: "pi_mutation_auth_probe_not_real" },
    strangerStatus: 403, ownerStatus: 403,
  },
  // LAST: the traveler arm here legitimately moves the row to `disputed`, so every
  // other probe's "row unchanged" assertion must already have run.
  { endpoint: "POST /api/bookings/:id/dispute", addressing: "path", strangerStatus: 403, ownerStatus: 403, mutates: true },
];

/**
 * The two `/api/bookings/*` payment rails this fixture CANNOT address, each with
 * the reason it is out of scope rather than unprobed.  Both are named so the
 * structural gate below stays exact: a rail that simply vanished from the
 * manifest, or one added later, still fails.
 *
 * Neither is an allowlist entry in the sense CLAUDE.md refuses.  That rule bites
 * where a fixture IS buildable; for these two it is not, because neither has a
 * counterpart principal to be refused:
 *  - the webhook's boundary is a Stripe SIGNATURE, not a session, so there is no
 *    "wrong user" to send — it is proven by the unauthenticated suite, which
 *    pins its exact signature-rejection status.
 *  - `process-cart` is session-self: it processes the CALLER'S OWN cart, so there
 *    is no other user's resource to address and an A/B probe has nothing to say.
 *    Its 401 arm is likewise the unauthenticated suite's.
 */
const OUT_OF_SCOPE: Readonly<Record<string, string>> = {
  "POST /api/bookings/webhooks/stripe":
    "Signature boundary, not a session boundary: no wrong-user principal exists. Proven by non-admin-payments-user-data-mutation-auth.http.test.ts, which pins its exact signature-rejection status.",
  "POST /api/bookings/process-cart":
    "Session-self boundary: processes the caller's own cart, so no other user's resource can be addressed. Its 401 arm is proven by the unauthenticated suite. (Legacy rail; D-12 closes it to new writes on a date.)",
};

const REFUSAL_STATUSES = new Set([401, 403, 404]);

let fixture: BookingResourceFixture | undefined;

function emitEvidence(evidence: Record<string, unknown>): void {
  console.log(JSON.stringify({ audit: "payments-resource-ownership", ...evidence }));
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
  fixture = await createBookingResourceFixture(BASE_URL);
});

after(async () => {
  if (fixture) await destroyBookingResourceFixture(fixture);
});

test("every probed rail is a real `payments` route in the generated manifest", () => {
  const byKey = new Map(manifest.mutations.map((mutation) => [keyOf(mutation), mutation]));
  for (const probe of PROBES) {
    const mutation = byKey.get(probe.endpoint);
    assert.ok(mutation, `${probe.endpoint} is not in the generated manifest — it was renamed, moved or removed`);
    assert.equal(mutation.risk, "payments", `${probe.endpoint} is risk '${mutation.risk}', not 'payments'`);
  }
});

test("the probe set names no rail twice", () => {
  const keys = PROBES.map((probe) => probe.endpoint);
  assert.deepEqual([...new Set(keys)].sort(), [...keys].sort(), "a rail probed twice hides which arm proved it");
});

test("every `/api/bookings/` payments rail the fixture can address is probed, not skipped", () => {
  // The structural gate: a rail added to this family later must be probed or the
  // suite fails, so the audit cannot silently shrink (the worst failure an
  // authorization audit can have, because it reads green).
  const addressable = manifest.mutations
    .filter((mutation) => mutation.risk === "payments")
    .filter((mutation) => /^\/api\/bookings\//.test(mutation.effectivePath))
    .map(keyOf);
  const probed = new Set(PROBES.map((probe) => probe.endpoint));
  const missing = [...new Set(addressable)]
    .filter((key) => !probed.has(key) && !(key in OUT_OF_SCOPE))
    .sort();
  assert.deepEqual(missing, [], `unprobed /api/bookings payment rails: ${missing.join(", ")}`);
});

test("every out-of-scope rail is real, carries a reason, and is not also probed", () => {
  // Mirrors the expert-provider suite's gate: a rail in two sets hides which one
  // answered for it, and a stale exclusion is how an audit silently shrinks.
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

test("payment rails: anonymous 401, the stranger and the listing owner are refused with the row unchanged, the traveler passes the gate", {
  skip: !LIVE_AUDIT && "set MUTATION_AUTH_AUDIT_OK=1 to run live HTTP authorization probes",
}, async () => {
  assert.ok(fixture, "the booking resource fixture was not created");
  const active = fixture;
  const byKey = new Map(manifest.mutations.map((mutation) => [keyOf(mutation), mutation]));

  const send = async (probe: Probe, principal: string, cookie: string | undefined) => {
    const mutation = byKey.get(probe.endpoint)!;
    const requestPath = probe.addressing === "path"
      ? mutation.effectivePath.replace(":id", encodeURIComponent(active.bookingId))
      : mutation.effectivePath;
    const body = {
      ...(probe.addressing === "body" ? { bookingId: active.bookingId } : {}),
      ...(probe.body ?? {}),
    };
    const response = await fetch(`${BASE_URL}${requestPath}`, {
      method: mutation.method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body), redirect: "manual",
    });
    const text = await diagnosticBody(response);
    emitEvidence({
      kind: "probe", endpoint: probe.endpoint, principal, source: mutation.source, line: mutation.line,
      addressing: probe.addressing, url: `${BASE_URL}${requestPath}`, actualStatus: response.status, response: text,
    });
    return { status: response.status, text };
  };
  const bookingStatus = () => fixtureRowStatus(active.db, "service_bookings", active.bookingId);

  // Sequential and ordered: the mutating rail is last, so every "unchanged" assertion
  // above it reads the row in its born state.
  for (const probe of PROBES) {
    const before = await bookingStatus();

    const anonymous = await send(probe, "anonymous", undefined);
    assert.equal(anonymous.status, 401, `${probe.endpoint} as anonymous: expected 401, got ${anonymous.status}: ${anonymous.text}`);
    assert.equal(await bookingStatus(), before, `${probe.endpoint}: an anonymous caller must not change the row`);

    // The STRANGER is party to nothing — neither the booking nor the listing.
    const stranger = await send(probe, "stranger (party to nothing)", active.strangerCookie);
    assert.equal(stranger.status, probe.strangerStatus, `${probe.endpoint} as stranger: expected ${probe.strangerStatus}, got ${stranger.status}: ${stranger.text}`);
    assert.equal(await bookingStatus(), before, `${probe.endpoint}: a refused stranger must not change the row`);

    // The listing OWNER is a party to the booking and is STILL not the authorized
    // party on these rails. This arm is what a traveler-only probe cannot prove.
    const owner = await send(probe, "listing owner (wrong party)", active.ownerCookie);
    assert.equal(owner.status, probe.ownerStatus, `${probe.endpoint} as listing owner: expected ${probe.ownerStatus}, got ${owner.status}: ${owner.text}`);
    assert.equal(await bookingStatus(), before, `${probe.endpoint}: a refused listing owner must not change the row`);

    // The TRAVELER is the authorized party: the gate lets them through. What the
    // handler answers next is a state-machine question this suite does not pin.
    const traveler = await send(probe, "traveler (authorized)", active.travelerCookie);
    assert.ok(
      !REFUSAL_STATUSES.has(traveler.status),
      `${probe.endpoint} as the booking's own traveler: got a refusal (${traveler.status}), so the gate refuses its authorized party: ${traveler.text}`,
    );

    if (probe.mutates) {
      assert.notEqual(await bookingStatus(), before, `${probe.endpoint}: the authorized traveler's write must land`);
    }
  }

  emitEvidence({ kind: "summary", probed: PROBES.length, principalsPerRail: 4 });
});
