/**
 * ACTIVATION VALIDATION — the pins (lane OC-A4, ledger `2026-09-11-offering-activation-validation`).
 *
 * NO DATABASE IS REACHED. `server/services/offering-activation-gate.service.ts` imports
 * `server/db.ts`, which THROWS at import time without `DATABASE_URL`, so the CI job sets a dummy
 * connection string — the precedent the `legacy-rail-traveler-charge` job already sets. No query
 * is issued here: the suite tests the gate's pure halves (the seller-facing refusal map) and the
 * STATIC placement of its two call sites.
 *
 * WHAT IS PINNED, AND WHY:
 *
 *  · **R1–R2 · every refusal has a sentence, and the two lists agree in BOTH directions.** The
 *    reason set is DERIVED by driving the resolver with fixtures until each reason comes out —
 *    never a literal list copied beside the type — so a seventh reason added to the resolver with
 *    no seller-facing sentence fails here rather than shipping as a blank refusal (§13: a refusal
 *    is a sentence, never a greyed-out button).
 *
 *  · **T1–T3 · the transition scoping, which is the RULING and not a softening.** The 61 demo
 *    listings are KEPT (`2026-09-11-oc-a1-ratified`) and resolve as unclassified, so a gate that
 *    ran on an ordinary edit of an already-active row would refuse the corpus the platform is being
 *    tested with. T1 derives the call sites from the FILE (comments stripped), never from a literal
 *    count; T2 pins that every site guarding an EXISTING row also carries the `!== "active"`
 *    transition test; T3 pins that the gate has exactly one caller module.
 *
 * NEGATIVE SPACE: this proves placement and copy. It does not exercise the DB assembly in
 * `loadOfferingListingInput` (extracted by lane OC-B1), and it says nothing about what production rows actually resolve to —
 * `scripts/audit-offering-classification.ts`, run against production, is that instrument.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  ACTIVATION_BLOCKING_REASONS,
  ACTIVATION_REFUSAL_MESSAGES,
} from "../services/offering-activation-gate.service";
import {
  resolveOfferingCommerceContract,
  type OfferingCommerceInput,
  type UnresolvableReason,
} from "../services/offering-commerce-contract";
// Migration 292 (ledger `2026-09-12-listing-names-its-expert-offering`) — K1/K2 below.
import {
  insertProviderServiceSchema,
  providerServiceExpertOfferingSchema,
} from "@shared/schema";
// Ledger `2026-09-12-offering-key-is-canonical` — K5–K8 below. The predicate reaches no database:
// its id→key lookup is injected, so the pins drive it with a stub catalog.
import { resolveBookingConciergeItems } from "../services/booking-concierge.service";

// ESM scope: no `__dirname`. `process.cwd()` is the repo root under `npx tsx --test`, which is how
// every guard in `scripts/` already resolves its paths.
const REPO_ROOT = process.cwd();

/** Strip block and line comments so a pin never matches prose about the thing it pins. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function listing(over: Record<string, unknown>): OfferingCommerceInput {
  return {
    kind: "listing",
    sellerClass: "provider",
    serviceType: "experience",
    deliveryMethod: "in_person",
    categoryKey: "tour_guide",
    priceType: "fixed",
    ...over,
  } as OfferingCommerceInput;
}

/** Every refusal the resolver can actually produce, DERIVED by driving it — never copied. */
function observedReasons(): Set<UnresolvableReason> {
  const fixtures: OfferingCommerceInput[] = [
    listing({ serviceType: "florist" }),
    listing({ deliveryMethod: null, productShape: null }),
    listing({ categoryKey: "not_a_real_category" }),
    listing({ priceType: "custom_quote", bookingMode: "instant" }),
    listing({ deliveryMethod: "pdf", categoryKey: "custom_other", hasMeetingPoint: true }),
    // `archetype_unresolvable`: the catalogs recognise the key and the row is classifiable, but no
    // §9 archetype covers the combination. `custom_other` + `hybrid` classifies as on_ground and
    // does resolve, so the honest way to reach this branch is an expert row whose impact class is
    // provider-shaped with a delivery method the provider table does not cover — which no delivery
    // method currently is. The branch is unreachable today and is kept as the explicit refusal for
    // the day a new shape lands; R2 therefore allows it to be absent from the observed set.
  ];
  const out = new Set<UnresolvableReason>();
  for (const f of fixtures) {
    const r = resolveOfferingCommerceContract(f);
    if (!r.resolved) out.add(r.reason);
  }
  return out;
}

test("R1 · every refusal the resolver produces has a seller-facing sentence that names a fix", () => {
  const reasons = observedReasons();
  assert.ok(reasons.size >= 5, "the fixtures should reach at least five distinct refusals");
  for (const reason of reasons) {
    const message = ACTIVATION_REFUSAL_MESSAGES[reason];
    assert.ok(message, `refusal "${reason}" has no seller-facing sentence`);
    assert.ok(message.length > 40, `refusal "${reason}" has no real sentence: ${message}`);
    // A refusal a seller cannot act on is a dead end. Each one names a field or an action.
    assert.ok(
      /publish|draft|category|delivered|booking|meeting point|price type|support/i.test(message),
      `refusal "${reason}" does not tell the seller what to change: ${message}`,
    );
  }
});

test("R2 · the message map carries no sentence for a refusal the resolver cannot produce", () => {
  const declared = Object.keys(ACTIVATION_REFUSAL_MESSAGES).sort();
  const observed = [...observedReasons()].sort();
  // Every observed reason must be declared. The reverse is allowed for exactly one entry —
  // `archetype_unresolvable`, the explicit refusal for a shape that does not exist yet — so that a
  // future archetype gap refuses with a sentence rather than falling through to a 500.
  for (const reason of observed) assert.ok(declared.includes(reason), `undeclared refusal: ${reason}`);
  const extra = declared.filter((d) => !observed.includes(d as UnresolvableReason));
  assert.deepEqual(extra, ["archetype_unresolvable"], `unexpected unreachable refusal(s): ${extra.join(", ")}`);
});

test("B1 · a listing with NO CATEGORY does not block a publish — that is our table's gap, not the seller's", () => {
  // The F2 publish-gate suite creates and publishes a listing with no category at all, and
  // `impactClassFor` also answers nothing for a category row that carries no `category_key` (the
  // taxonomy defect migration 289 repairs). Both are facts about OUR tables. Refusing would tell a
  // seller to "choose a category" when they either did, or were never asked for one.
  const r = resolveOfferingCommerceContract(listing({ categoryKey: null }));
  assert.equal(r.resolved, false);
  if (r.resolved) throw new Error("unreachable");
  assert.equal(r.reason, "catalog_keys_unrecognised");
  assert.equal(
    ACTIVATION_BLOCKING_REASONS.has(r.reason),
    false,
    "catalog_keys_unrecognised must be reported, never refused",
  );
  // It still has a sentence, so the day it becomes blocking it is not a blank refusal.
  assert.ok(ACTIVATION_REFUSAL_MESSAGES[r.reason]);
});

test("B2 · every BLOCKING reason is a fact the seller stated on the listing and can change", () => {
  // Each of these is produced by a fixture whose only unusual field is one the seller controls.
  const blocking: [UnresolvableReason, OfferingCommerceInput][] = [
    ["delivery_shape_unclassifiable", listing({ deliveryMethod: null, productShape: null })],
    ["service_type_outside_declared_vocabulary", listing({ serviceType: "florist" })],
    ["instant_commitment_with_custom_quote", listing({ priceType: "custom_quote", bookingMode: "instant" })],
    [
      "artifact_delivery_with_meeting_point",
      listing({ deliveryMethod: "pdf", categoryKey: "custom_other", hasMeetingPoint: true }),
    ],
  ];
  for (const [reason, input] of blocking) {
    const r = resolveOfferingCommerceContract(input);
    assert.equal(r.resolved, false);
    if (r.resolved) throw new Error("unreachable");
    assert.equal(r.reason, reason);
    assert.ok(ACTIVATION_BLOCKING_REASONS.has(reason), `${reason} should block a publish`);
  }
  // And the split is total: every reason is either blocking or declared in the message map.
  for (const reason of ACTIVATION_BLOCKING_REASONS) {
    assert.ok(ACTIVATION_REFUSAL_MESSAGES[reason], `blocking reason ${reason} has no sentence`);
  }
});

test("T1 · every activation-gate call site sits behind an `active` guard", () => {
  const src = stripComments(readFileSync(path.join(REPO_ROOT, "server", "routes.ts"), "utf8"));
  const sites: number[] = [];
  const needle = "checkOfferingActivationGate(";
  for (let i = src.indexOf(needle); i !== -1; i = src.indexOf(needle, i + 1)) sites.push(i);
  assert.ok(sites.length >= 2, "expected the gate on both the create and the update rail");
  for (const at of sites) {
    const preceding = src.slice(Math.max(0, at - 400), at);
    assert.ok(
      /status === "active"/.test(preceding),
      "an activation gate call is not guarded by a transition to active",
    );
  }
});

test("T2 · a call site that gates an EXISTING row also carries the transition test", () => {
  const src = stripComments(readFileSync(path.join(REPO_ROOT, "server", "routes.ts"), "utf8"));
  const needle = "checkOfferingActivationGate(";
  let checked = 0;
  for (let at = src.indexOf(needle); at !== -1; at = src.indexOf(needle, at + 1)) {
    const call = src.slice(at, at + 400);
    if (!/serviceId:/.test(call)) continue; // a create has no stored row to transition from
    checked += 1;
    const preceding = src.slice(Math.max(0, at - 400), at);
    assert.ok(
      /!== "active"/.test(preceding),
      "an already-active listing must never be re-gated on an ordinary edit — the demo corpus is kept by ruling",
    );
  }
  assert.equal(checked, 1, "expected exactly one call site that gates an existing row");
});

test("T3 · the gate has ONE caller module — a second one is a second placement to remember", () => {
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) {
        const rel = path.relative(REPO_ROOT, full);
        if (rel.endsWith("offering-activation-gate.service.ts")) continue;
        if (/checkOfferingActivationGate\s*\(/.test(stripComments(readFileSync(full, "utf8")))) {
          callers.push(rel);
        }
      }
    }
  };
  walk(path.join(REPO_ROOT, "server"));
  assert.deepEqual(callers.sort(), ["server/routes.ts"]);
});

// ── K · THE LISTING'S OWN EXPERT OFFERING KEY ─────────────────────────────────────────────────
// Migration 292, ledger `2026-09-12-listing-names-its-expert-offering` (punchlist D-13 answered,
// V-12 closed). These pins live beside the gate's because the gate is the surface whose answer
// changes once the column is populated: E2/E3/E4/E6 stop resolving `catalog_keys_unrecognised`.
//
// NEGATIVE SPACE (§18d): K1–K4 prove ADMISSION and PLACEMENT. They reach no database, so they say
// nothing about what a stored row resolves to — `offering-archetype-fixtures.db.test.ts` walks
// that chain — and nothing about whether any surface lets a seller SET the key.

test("K1 · the generic listing body cannot set the expert offering key (§19 — a denylist grants by default)", () => {
  const parsed = insertProviderServiceSchema.parse({
    serviceName: "K1",
    expertOfferingTypeKey: "wedding_planner",
  } as Record<string, unknown>) as Record<string, unknown>;
  assert.ok(
    !("expertOfferingTypeKey" in parsed),
    "`insertProviderServiceSchema` must OMIT the column — under an `.omit()` denylist a freshly-added column is client-settable BY DEFAULT",
  );
});

test("K2 · the pick-based allowlist admits exactly that one field, nullable, and nothing else", () => {
  const admitted = providerServiceExpertOfferingSchema.parse({
    expertOfferingTypeKey: "wedding_planner",
    // Privileged neighbours riding along on the same body: a pick-based schema drops them, which
    // is the whole reason §19 requires this shape rather than another omit list.
    revenueShareRate: "1.00",
    approvalStatus: "approved",
  } as Record<string, unknown>) as Record<string, unknown>;
  assert.deepEqual(Object.keys(admitted), ["expertOfferingTypeKey"]);
  assert.equal(admitted.expertOfferingTypeKey, "wedding_planner");

  // An explicit CLEAR and an ABSENT key are different facts and must stay so (§13).
  const cleared = providerServiceExpertOfferingSchema.parse({
    expertOfferingTypeKey: null,
  }) as Record<string, unknown>;
  assert.equal(cleared.expertOfferingTypeKey, null);
  const absent = providerServiceExpertOfferingSchema.parse({}) as Record<string, unknown>;
  assert.equal(absent.expertOfferingTypeKey, undefined);

  // NO ENUM IS RESTATED: the value set is the FK on the column, so a key seeded by a later
  // migration needs no edit here. Shape only — the catalog answers the rest.
  assert.ok(providerServiceExpertOfferingSchema.safeParse({ expertOfferingTypeKey: "not_a_real_key" }).success);
  assert.ok(!providerServiceExpertOfferingSchema.safeParse({ expertOfferingTypeKey: "" }).success);
});

test("K3 · the ONE listing→contract assembly reads the column off the row", () => {
  const src = stripComments(
    readFileSync(path.join(REPO_ROOT, "server", "services", "offering-listing-input.ts"), "utf8"),
  );
  assert.ok(
    /expertOfferingTypeKey:\s*providerServices\.expertOfferingTypeKey/.test(src),
    "`loadOfferingListingInput` must SELECT the column — without it E2/E3/E4/E6 stay unclassifiable",
  );
  assert.ok(
    /offeringTypeKey:\s*expertOfferingTypeKey/.test(src),
    "and hand it to the contract as `offeringTypeKey` — the field `impactClassFor` reads",
  );
});

test("K4 · BOTH `/api/provider/services` write rails admit the key, through ONE implementation", () => {
  const routes = stripComments(readFileSync(path.join(REPO_ROOT, "server", "routes.ts"), "utf8"));
  const calls = routes.match(/admitExpertOfferingTypeKey\s*\(/g) ?? [];
  assert.equal(
    calls.length,
    2,
    "create and update are checked as hard as each other (§18 rule 2) — derived from the file, never a literal count",
  );

  // ONE implementation: no `.ts` under `server/` outside the admission module may parse the
  // allowlist itself. A second parse is a second place the decision has to be remembered.
  const parsers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) {
        const rel = path.relative(REPO_ROOT, full);
        if (rel.endsWith("expert-offering-key.service.ts")) continue;
        if (/providerServiceExpertOfferingSchema/.test(stripComments(readFileSync(full, "utf8")))) {
          parsers.push(rel);
        }
      }
    }
  };
  walk(path.join(REPO_ROOT, "server"));
  assert.deepEqual(parsers.sort(), []);
});

// ── K5–K8 · THE KEY IS CANONICAL; THE LEGACY UUID IS FROZEN AND ON ITS WAY OUT ────────────────
// Ledger `2026-09-12-offering-key-is-canonical` (lane 1 of two; migration 293 backfills, lane 2
// drops `provider_services.expert_offering_type_id`). These pins live beside K1–K4 because they
// are the same subject one step on: K1/K2 proved only the KEY is admissible, and these prove the
// legacy id is admissible NOWHERE, that the money path's concierge decision has ONE home, and
// that the answer for a row carrying both identifiers is unchanged.
//
// NEGATIVE SPACE (§18d): K5–K8 reach no database. They say nothing about what production rows
// hold — lane 2's punchlist entry carries the read-only production check — and nothing about the
// FEE itself, which is a `fee_bands` rate this predicate never touches (§8).

test("K5 · the legacy `expertOfferingTypeId` is admissible on NO rail (so the two columns cannot be made to disagree)", () => {
  const parsed = insertProviderServiceSchema.parse({
    serviceName: "K5",
    expertOfferingTypeId: "00000000-0000-0000-0000-000000000001",
  } as Record<string, unknown>) as Record<string, unknown>;
  assert.ok(
    !("expertOfferingTypeId" in parsed),
    "`insertProviderServiceSchema` must OMIT the legacy uuid — the key is canonical and a second writable column is free to disagree with it (§18 rule 1)",
  );
  // And the allowlist that re-admits the KEY still admits nothing else (K2's shape, from the other
  // direction): naming the legacy column there would reopen the hole this ruling closes.
  const admitted = providerServiceExpertOfferingSchema.parse({
    expertOfferingTypeKey: "booking_concierge",
    expertOfferingTypeId: "00000000-0000-0000-0000-000000000001",
  } as Record<string, unknown>) as Record<string, unknown>;
  assert.deepEqual(Object.keys(admitted), ["expertOfferingTypeKey"]);
});

test("K6 · the `booking_concierge` literal has exactly ONE home under server/, and it is the fee-band concern constant", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__" || entry === "migrations") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) {
        if (/["']booking_concierge["']/.test(stripComments(readFileSync(full, "utf8")))) {
          files.push(path.relative(REPO_ROOT, full));
        }
      }
    }
  };
  walk(path.join(REPO_ROOT, "server"));
  // DERIVED FROM THE FILE SET, comments stripped — never a call-site count. Six inline copies of
  // this comparison lived across three route blocks before the lane; each one was a place the
  // quote and the charge could drift apart about the same cart.
  assert.deepEqual(
    files.sort(),
    [path.join("server", "services", "commission.ts")],
    "every concierge decision reads CONCIERGE_BOOKING_CONCERN through the one resolver; a second spelling of the literal is a second decision",
  );
});

test("K7 · ONE reader of the legacy uuid remains, it is the resolver's fallback, and it is marked for lane 2", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__" || entry === "migrations") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) {
        if (/expertOfferingTypeId/.test(stripComments(readFileSync(full, "utf8")))) {
          files.push(path.relative(REPO_ROOT, full));
        }
      }
    }
  };
  walk(path.join(REPO_ROOT, "server"));
  const resolver = path.join("server", "services", "booking-concierge.service.ts");
  assert.deepEqual(
    files.sort(),
    [resolver],
    "the legacy uuid is read in one place only — the fallback for a database migration 293 has not reached",
  );
  // The marker is what lane 2 greps for. A fallback nobody can find is a fallback nobody removes.
  const src = readFileSync(path.join(REPO_ROOT, resolver), "utf8");
  assert.ok(
    src.includes("lane2-removal-target"),
    "the fallback arm must carry the grep-able lane-2 marker",
  );
});

test("K8 · the predicate: the KEY answers, and a row carrying BOTH identifiers answers exactly as it did before", async () => {
  const CONCIERGE_ID = "id-concierge";
  const OTHER_ID = "id-other";
  const catalog = [
    { id: CONCIERGE_ID, key: "booking_concierge" },
    { id: OTHER_ID, key: "wedding_planner" },
  ];
  let lookups = 0;
  const lookup = async (ids: string[]) => {
    lookups += 1;
    return catalog.filter((r) => ids.includes(r.id));
  };

  // (a) The identity the ruling turns on: for every row where the key and the legacy id name the
  //     SAME offering — which is exactly what migration 293 produces — the key-first answer equals
  //     the legacy-only answer. Driven off the catalog, never a hand-copied expectation.
  for (const row of catalog) {
    const legacyOnly = await resolveBookingConciergeItems([{ expertOfferingTypeId: row.id }], lookup);
    const both = await resolveBookingConciergeItems(
      [{ expertOfferingTypeId: row.id, expertOfferingTypeKey: row.key }],
      lookup,
    );
    const keyOnly = await resolveBookingConciergeItems([{ expertOfferingTypeKey: row.key }], lookup);
    const answer = legacyOnly.isBookingConcierge({ expertOfferingTypeId: row.id });
    assert.equal(answer, row.key === "booking_concierge");
    assert.equal(both.isBookingConcierge({ expertOfferingTypeId: row.id, expertOfferingTypeKey: row.key }), answer);
    assert.equal(keyOnly.isBookingConcierge({ expertOfferingTypeKey: row.key }), answer);
  }

  // (b) A row that states NO key and carries no id is not a concierge line, and neither is an
  //     absent listing — §13: an unclassified listing is never read as one thing or the other.
  const none = await resolveBookingConciergeItems([null, {}, { expertOfferingTypeKey: null }], lookup);
  assert.equal(none.hasAny, false);
  assert.equal(none.isBookingConcierge(null), false);

  // (c) The key is CANONICAL where the two disagree — the one input class whose answer differs
  //     from the pre-lane code, stated here rather than left to be discovered.
  const disagreeing = await resolveBookingConciergeItems(
    [{ expertOfferingTypeId: CONCIERGE_ID, expertOfferingTypeKey: "wedding_planner" }],
    lookup,
  );
  assert.equal(
    disagreeing.isBookingConcierge({ expertOfferingTypeId: CONCIERGE_ID, expertOfferingTypeKey: "wedding_planner" }),
    false,
  );

  // (d) hasAny is the same predicate over the same set — the strict fee-band loader turns on it,
  //     so it can never disagree with the per-line answers the loops read.
  const mixed = await resolveBookingConciergeItems(
    [null, { expertOfferingTypeKey: "wedding_planner" }, { expertOfferingTypeId: CONCIERGE_ID }],
    lookup,
  );
  assert.equal(mixed.hasAny, true);

  // (e) A fully migrated cart issues NO id lookup at all: the fallback is for rows the backfill has
  //     not reached, not a second rail every checkout pays for.
  const before = lookups;
  const migrated = await resolveBookingConciergeItems(
    [{ expertOfferingTypeKey: "booking_concierge" }, { expertOfferingTypeKey: "wedding_planner" }],
    lookup,
  );
  assert.equal(migrated.hasAny, true);
  assert.equal(lookups, before, "a cart whose listings all state a key must not query the legacy catalog");
});
