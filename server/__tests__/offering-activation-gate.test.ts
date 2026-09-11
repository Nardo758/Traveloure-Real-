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
 * `resolveActivationInput`, and it says nothing about what production rows actually resolve to —
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
