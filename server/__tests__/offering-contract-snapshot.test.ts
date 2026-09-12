/**
 * THE CONTRACT SNAPSHOT AT COMMITMENT — the pins (lane OC-B1, ledger
 * `2026-09-12-offering-contract-snapshot`).
 *
 * NO DATABASE IS REACHED. `server/services/offering-contract-snapshot.ts` imports `server/db.ts`,
 * which THROWS at import time without `DATABASE_URL`, so the CI job sets a dummy connection string
 * — the precedent `offering-activation-gate` and `legacy-rail-traveler-charge` already set. No
 * query is issued here: the suite drives the PURE composer and pins the STATIC placement of the
 * one write.
 *
 * WHAT IS PINNED, AND WHY:
 *
 *  · **S1–S6 · the snapshot records, it never decides.** A resolvable listing round-trips the
 *    resolver's own answer verbatim; an UNRESOLVABLE one records the refusal and its reason with no
 *    archetype anywhere in the blob — which is the COMMON case, because production's 61 demo
 *    listings are KEPT by ruling (`2026-09-11-oc-a1-ratified`), are bookable, and resolve as
 *    unclassified. A default archetype for one of them would be the §13 fabrication this lane
 *    exists to prevent.
 *
 *  · **L1 · pre-lane rows.** `travelerChargeBasis` is untouched, so a row committed before this
 *    lane is still read the way it WAS charged. There is no backfill and no re-derivation.
 *
 *  · **K1–K2 · §15 is untouched, pinned so a later tidy-up cannot drag a key along.** The Stripe
 *    idempotency-key template SET is DERIVED from the money file set with comments stripped — never
 *    a literal call count — and the checkout's per-row `#<n>` suffix convention (which §17 rule 4's
 *    detection keys on) is pinned from `payments.routes.ts` itself.
 *
 *  · **W1–W3 · ONE write, ONE author, ONE classification.** The snapshot rides the same INSERT that
 *    commits the booking; exactly one module under `server/` names the column and none UPDATEs it;
 *    and the listing→contract-input assembly has exactly the two caller modules it was extracted
 *    for (§18 rule 1).
 *
 *  · **A1 · §19.** The column is omitted from `insertServiceBookingSchema` and appears in no
 *    client-reachable pick. Under a denylist schema a freshly-added column is client-settable BY
 *    DEFAULT, and a forged set of terms is exactly what OC-D1/D3 would later branch on.
 *
 * NEGATIVE SPACE: this proves composition, placement and the untouched keys. It does not exercise
 * the DB assembly in `loadOfferingListingInput`, it says nothing about what production rows resolve
 * to (`scripts/audit-offering-classification.ts` is that instrument), and it does not assert that a
 * booking's required context was supplied — that is OC-B3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  composeOfferingContractSnapshot,
  OFFERING_CONTRACT_SNAPSHOT_VERSION,
} from "../services/offering-contract-snapshot";
import {
  resolveOfferingCommerceContract,
  CONTRACT_VERSION,
  type OfferingListingInput,
} from "../services/offering-commerce-contract";
import { travelerChargeBasis } from "../services/traveler-charge";

// ESM scope: no `__dirname`. `process.cwd()` is the repo root under `npx tsx --test`.
const REPO_ROOT = process.cwd();

/** Strip block and line comments so a pin never matches prose about the thing it pins. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function read(rel: string): string {
  return stripComments(readFileSync(path.join(REPO_ROOT, rel), "utf8"));
}

function listing(over: Partial<OfferingListingInput> = {}): OfferingListingInput {
  return {
    kind: "listing",
    sellerClass: "provider",
    serviceType: "experience",
    deliveryMethod: "in_person",
    categoryKey: "tour_guide",
    priceType: "fixed",
    ...over,
  } as OfferingListingInput;
}

const AT = new Date("2026-09-12T10:00:00.000Z");

// ─── S · the snapshot records the resolver's answer, and never a second opinion ────────────────

test("S1 · a resolvable listing's snapshot round-trips the resolver's own answer verbatim", () => {
  const input = listing();
  const snap = composeOfferingContractSnapshot({
    listing: input,
    cancellationPolicyType: "moderate",
    at: AT,
  });

  assert.equal(snap.snapshotVersion, OFFERING_CONTRACT_SNAPSHOT_VERSION);
  assert.equal(snap.snapshotAt, "2026-09-12T10:00:00.000Z");
  assert.equal(snap.policy.cancellationPolicyType, "moderate");

  // The stored resolution IS the resolver's, byte for byte — the snapshot is not a fifth-and-a-half
  // classifier that could answer differently from the gate the seller was published through.
  assert.deepEqual(snap.resolution, resolveOfferingCommerceContract(input));
  assert.equal(snap.resolution.resolved, true);
  if (!snap.resolution.resolved) throw new Error("unreachable");
  assert.equal(snap.resolution.contract.contractVersion, CONTRACT_VERSION);

  // And it survives the jsonb round trip the column actually performs.
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
});

test("S2 · the listing facts stored are the resolver's INPUT, so a later drift is visible not inferred", () => {
  const input = listing({ bookingMode: "instant", depositEnabled: true });
  const snap = composeOfferingContractSnapshot({
    listing: input,
    cancellationPolicyType: null,
    at: AT,
  });
  const { kind, ...facts } = input;
  assert.equal(kind, "listing");
  assert.deepEqual(snap.listing, facts);
  // The discriminator is not stored: `listing` is the only kind a `service_bookings` row can carry.
  assert.equal((snap.listing as Record<string, unknown>).kind, undefined);
});

test("S3 · an UNRESOLVABLE listing records the REFUSAL and its reason — never a default archetype", () => {
  // The 61 production demo listings: a `service_type` outside the declared six. They are KEPT by
  // ruling and they are bookable, so this is the common case, not an edge.
  const snap = composeOfferingContractSnapshot({
    listing: listing({ serviceType: "florist" }),
    cancellationPolicyType: "flexible",
    at: AT,
  });
  assert.equal(snap.resolution.resolved, false);
  if (snap.resolution.resolved) throw new Error("unreachable");
  assert.equal(snap.resolution.reason, "service_type_outside_declared_vocabulary");
  assert.ok(snap.resolution.detail.length > 40, "a refusal carries the resolver's own sentence");

  // §13, and it is the load-bearing half: nothing anywhere in the blob claims an archetype, a
  // charge mode or a completion rule. A nearest-looking default here is what OC-D1/D3 would later
  // settle and refund against.
  const blob = JSON.stringify(snap);
  assert.equal(/"commerceArchetype"/.test(blob), false);
  assert.equal(/"chargeMode"/.test(blob), false);
  assert.equal(/"completionRule"/.test(blob), false);
  assert.equal(/"contract"/.test(blob), false);
});

test("S4 · a second unresolvable shape records ITS OWN reason — the refusal is not one bucket", () => {
  const snap = composeOfferingContractSnapshot({
    listing: listing({ deliveryMethod: null, productShape: null }),
    cancellationPolicyType: null,
    at: AT,
  });
  assert.equal(snap.resolution.resolved, false);
  if (snap.resolution.resolved) throw new Error("unreachable");
  assert.equal(snap.resolution.reason, "delivery_shape_unclassifiable");
});

test("S5 · a listing that stated NO cancellation policy stores null — never a default policy", () => {
  const snap = composeOfferingContractSnapshot({
    listing: listing(),
    cancellationPolicyType: null,
    at: AT,
  });
  assert.equal(snap.policy.cancellationPolicyType, null);
  // "flexible" is the friendliest of the four and would be the tempting default. A policy nobody
  // chose is a claim about a seller's terms (§13).
  assert.equal(/flexible|moderate|strict|non_refundable/.test(JSON.stringify(snap.policy)), false);
});

test("S6 · the snapshot version and the contract version are separate facts", () => {
  // They move for different reasons: one says which blob shape is stored, the other which
  // vocabulary the axes are drawn from. Collapsing them makes one of the two unreadable.
  const src = read("server/services/offering-contract-snapshot.ts");
  assert.ok(/OFFERING_CONTRACT_SNAPSHOT_VERSION/.test(src));
  assert.equal(
    /OFFERING_CONTRACT_SNAPSHOT_VERSION\s*=\s*CONTRACT_VERSION/.test(src),
    false,
    "the snapshot version must not be aliased to the contract version",
  );
});

// ─── L · a row committed before this lane ──────────────────────────────────────────────────────

test("L1 · a pre-lane row is still read the way it WAS charged — no backfill, no re-derivation", () => {
  // The era discriminator is the PRESENCE of the concierge-fee snapshot, and this lane touched
  // neither it nor `travelerChargeForRow`. A row with no contract snapshot is an OLDER row, and
  // that is a fact rather than a gap.
  assert.equal(travelerChargeBasis(null), "pre_a3_legacy");
  assert.equal(travelerChargeBasis(undefined), "pre_a3_legacy");
  assert.equal(travelerChargeBasis("0.00"), "a3_snapshot");
  assert.equal(travelerChargeBasis(12.5), "a3_snapshot");

  // And the snapshot column is nowhere in that decision: the two eras are independent facts.
  const src = read("server/services/traveler-charge.ts");
  assert.equal(/offeringContractSnapshot|offering_contract_snapshot/.test(src), false);
});

test("L2 · migration 291 adds one nullable column and nothing else — no CHECK, no default, no backfill", () => {
  const sqlSrc = readFileSync(
    path.join(REPO_ROOT, "server/migrations/291_service_bookings_offering_contract_snapshot.sql"),
    "utf8",
  );
  const statements = sqlSrc
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
  assert.ok(/ADD COLUMN IF NOT EXISTS offering_contract_snapshot jsonb/.test(statements));
  for (const forbidden of [/\bCHECK\b/i, /\bDEFAULT\b/i, /\bUPDATE\b/i, /\bINSERT\b/i, /\bNOT NULL\b/i]) {
    assert.equal(forbidden.test(statements), false, `migration 291 must not contain ${forbidden}`);
  }
  // Registered, or `runMigrations` never applies it.
  assert.ok(
    read("server/migrations/migration-files.ts").includes(
      '"291_service_bookings_offering_contract_snapshot.sql"',
    ),
  );
});

// ─── K · §15 is untouched ──────────────────────────────────────────────────────────────────────

/** Every file that can hand Stripe an idempotency key. Derived by walking, never listed by hand. */
function moneyFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(path.relative(REPO_ROOT, full));
    }
  };
  walk(path.join(REPO_ROOT, "server"));
  return out;
}

test("K1 · the Stripe idempotency-key templates are exactly what they were — derived from the file set", () => {
  const found = new Set<string>();
  for (const rel of moneyFiles()) {
    const src = read(rel);
    for (const m of src.matchAll(/idempotencyKey:[^`\n]*`([^`]+)`/g)) found.add(m[1]);
  }
  assert.deepEqual(
    [...found].sort(),
    [
      "${params.idempotencyKey}-recover",
      "${stripeRequestOptions.idempotencyKey}-recover",
      "coord-fee-${coordinationId}",
      "coord-refund-${coordinationId}",
      "expert-svc-${variantId}-${comparisonId}-${serviceType}-${userId}",
      "pi-${idempotencyKey}",
      "rm-buy-${listing.id}-${userId}",
      "rm-refund-${ledger.purchase.id}",
      "tp-buy-${trip!.id}-${userId}",
    ],
    "OC-B1 records; it changes no Stripe idempotency key. A key that moved here moved for some other reason and needs its own proof.",
  );

  // The balance key carries the ACTOR (§15d) and is built by its own named helper.
  assert.ok(/return `bal-\$\{booking\}-\$\{payer\}`/.test(read("server/services/balance-payer.service.ts")));
});

test("K2 · the checkout's atomic claim and its per-row key convention are unchanged", () => {
  const src = read("server/routes/payments.routes.ts");
  // The FIRST row carries the bare request key and IS the claim; every later row is suffixed, which
  // is also what §17's sibling-key convention detects on.
  assert.ok(/const isClaimRow = bookings\.length === 0;/.test(src));
  assert.ok(/\$\{checkoutKey\}#\$\{bookings\.length\}/.test(src));
  // The §15b pre-flight marker is still written before the Stripe call.
  assert.ok(/markStripeAttempt\(bookingIds, `pi-\$\{checkoutKey\}`\)/.test(src));

  // The claim machine still owns the provisional predicate.
  const claim = read("server/services/checkout-claim.service.ts");
  assert.ok(/status = 'payment_pending'\s*\n?\s*AND stripe_payment_intent_id IS NULL/.test(claim));
});

// ─── W · one write, one author, one classification ────────────────────────────────────────────

test("W1 · the snapshot rides the SAME insert that commits the booking", () => {
  const src = read("server/storage.ts");
  // Composed before the insert, then spread into it — never a follow-up UPDATE that could disagree
  // with the row it describes (§15).
  const stamps = [...src.matchAll(/offeringContractSnapshot \? \{ offeringContractSnapshot \} : \{\}/g)];
  assert.equal(stamps.length, 2, "both service-booking creators stamp, and nothing else does");
  for (const m of stamps) {
    const window = src.slice(Math.max(0, m.index! - 900), m.index!);
    assert.ok(
      /safeOfferingContractSnapshot\(/.test(window),
      "a stamp whose value did not come from the shared composer",
    );
    assert.ok(/\.values\(\{|\.insert\(serviceBookings\)/.test(src.slice(m.index! - 300, m.index!)));
  }
});

test("W2 · nothing UPDATEs the column, and exactly ONE module names it", () => {
  const namers: string[] = [];
  for (const rel of moneyFiles()) {
    // The migration registry names the FILE, not the column; it writes nothing.
    if (rel.startsWith(path.join("server", "migrations"))) continue;
    const src = read(rel);
    if (/\boffering_?[Cc]ontract_?[Ss]napshot\b/.test(src)) namers.push(rel);
  }
  assert.deepEqual(
    namers.sort(),
    [path.join("server", "storage.ts")],
    "the one author; a second namer is a second place the terms can be written",
  );
  // And neither of them updates it after the fact.
  for (const rel of namers) {
    const src = read(rel);
    assert.equal(
      /set\(\{[^}]*offeringContractSnapshot/s.test(src),
      false,
      `${rel} sets the snapshot on an UPDATE — the terms are committed once, with the row`,
    );
  }
});

test("W3 · the listing→contract-input assembly has ONE implementation and its two callers", () => {
  const callers: string[] = [];
  for (const rel of moneyFiles()) {
    if (rel.endsWith(path.join("services", "offering-listing-input.ts"))) continue;
    if (/loadOfferingListingInput\s*\(/.test(read(rel))) callers.push(rel);
  }
  assert.deepEqual(
    callers.sort(),
    [
      path.join("server", "services", "offering-activation-gate.service.ts"),
      path.join("server", "services", "offering-contract-snapshot.ts"),
    ],
    "the gate and the snapshot; a private twin is how one listing gets described two ways",
  );

  // And the snapshot classifies through the ONE resolver — it is a caller, not a fifth classifier.
  const snap = read("server/services/offering-contract-snapshot.ts");
  assert.ok(/resolveOfferingCommerceContract\(/.test(snap));
  assert.equal(
    /resolveBuyAction|impactClassFor|resolveContentCTA|resolveBookingMode/.test(snap),
    false,
    "the snapshot must reach the four existing classifiers only THROUGH the resolver",
  );
});

// ─── A · §19 ───────────────────────────────────────────────────────────────────────────────────

test("A1 · the column is unreachable from every client body", () => {
  const schema = read("shared/schema.ts");
  const omitBlock = schema.slice(
    schema.indexOf("export const insertServiceBookingSchema"),
    schema.indexOf("export const createBookingRequestSchema"),
  );
  assert.ok(
    /offeringContractSnapshot: true/.test(omitBlock),
    "insertServiceBookingSchema must omit the snapshot — a denylist schema fails OPEN for a new column",
  );

  // `createBookingRequestSchema` is the one pick-based body over this table. It must not name it.
  const pick = schema.slice(
    schema.indexOf("export const createBookingRequestSchema"),
    schema.indexOf("export const createBookingRequestSchema") + 400,
  );
  assert.equal(/offeringContractSnapshot/.test(pick), false);

  // Layer 2: both creators strip a caller-supplied one before stamping their own.
  const storage = read("server/storage.ts");
  assert.equal(
    [...storage.matchAll(/offeringContractSnapshot: _/g)].length,
    2,
    "both creators must strip a caller-supplied snapshot — the `as any` callers a type-level omit cannot reach",
  );
});
