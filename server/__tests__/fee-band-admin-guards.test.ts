/**
 * Fee-band admin panel — the three gaps, and the derivation that keeps the guard honest.
 *
 * Ledger `2026-09-12-fee-band-admin-gaps`; punchlist V-4 / V-5 / V-6. Run with:
 *   npx tsx --test server/__tests__/fee-band-admin-guards.test.ts
 *
 * NO DATABASE IS REACHED and none is needed: every module under test is deliberately DB-free
 * (`fee-band-requirements.ts` states that contract in its own header), and the handler/page pins
 * read source text. The negatives are the point — a band with no fallback CANNOT be switched off;
 * a band with one CAN, and the answer names what takes over.
 *
 * D5 IS THE LOAD-BEARING PIN AND ITS NEGATIVE SPACE IS STATED (§18d). A band key reaches a
 * resolver in three shapes: a constant, a string literal, and a value read out of a DATABASE
 * COLUMN (`service_categories.commission_band_key`, `ready_made_trips.fee_band_key`). No static
 * analysis can enumerate the third, so the required/fallback SPLIT is declared rather than
 * derived. What IS derived is the direction that matters and the one that goes stale: every band
 * reached through a FAIL-LOUD accessor with a statically visible key must be declared
 * `required: true`. A dynamically keyed read is invisible to D5 — green here means
 * green-within-those-bounds, and adding a resolver whose key is a column is still a human
 * decision to record in the manifest.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  RESOLVER_FEE_BAND_REQUIREMENTS,
  feeBandRequirement,
  declaredFallbackValue,
} from "../services/fee-band-requirements";
import {
  feeBandDeactivationRuling,
  feeBandMaxAmountClearRuling,
  feeBandPatchBodySchema,
} from "../services/fee-band-admin.service";
import {
  FEE_BAND_RATE_TYPES,
  FEE_BAND_RATE_TYPE_DISPLAY,
} from "../../shared/fee-band-display";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Strip block and line comments so every pin below reads CODE, never prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readStripped(rel: string): string {
  return stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "migrations") continue;
      walk(rel, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(rel);
    }
  }
  return out;
}

// ── D1/D2/D3/D4 — the deactivation ruling ─────────────────────────────────────────────────

test("D1 — every band with NO declared fallback is REFUSED deactivation, and the refusal names its fail-loud reader", () => {
  const failLoud = RESOLVER_FEE_BAND_REQUIREMENTS.filter((r) => r.fallback.kind === "none");
  assert.ok(failLoud.length > 0, "the manifest must declare at least one fail-loud band");
  for (const requirement of failLoud) {
    const ruling = feeBandDeactivationRuling(requirement.bandKey);
    assert.equal(ruling.allowed, false, `${requirement.bandKey} must not be deactivatable`);
    assert.equal(ruling.reason, "required_no_fallback");
    assert.equal(ruling.declared, true);
    assert.match(ruling.consequence, /NO fallback/, `${requirement.bandKey} must say it has no fallback`);
    const reader = requirement.fallback.kind === "none" ? requirement.fallback.reader : "";
    assert.ok(
      ruling.consequence.includes(reader),
      `${requirement.bandKey}: the refusal must name the reader that would raise (${reader})`,
    );
  }
});

test("D2 — a band WITH a declared fallback may be deactivated, and the answer names the resolver AND what takes over (§13)", () => {
  const withFallback = RESOLVER_FEE_BAND_REQUIREMENTS.filter((r) => r.fallback.kind !== "none");
  assert.ok(withFallback.length > 0, "the manifest must declare at least one fallback-backed band");
  for (const requirement of withFallback) {
    const ruling = feeBandDeactivationRuling(requirement.bandKey);
    assert.equal(ruling.allowed, true, `${requirement.bandKey} must be deactivatable`);
    assert.equal(ruling.reason, "fallback_declared");
    const fallback = requirement.fallback;
    if (fallback.kind === "code_constant") {
      assert.ok(
        ruling.consequence.includes(fallback.resolver),
        `${requirement.bandKey}: must name the resolver that falls back`,
      );
      // The VALUE must appear. A warning that does not name the outcome is decoration.
      const rendered =
        fallback.unit === "usd"
          ? `$${fallback.value.toFixed(2)}`
          : fallback.unit === "fraction"
            ? `${Number((fallback.value * 100).toFixed(4))}%`
            : String(fallback.value);
      assert.ok(
        ruling.consequence.includes(rendered),
        `${requirement.bandKey}: the consequence must state the fallback VALUE (${rendered}); got: ${ruling.consequence}`,
      );
    } else if (fallback.kind === "other_band") {
      assert.ok(ruling.consequence.includes(fallback.resolver));
      assert.ok(
        ruling.consequence.includes(fallback.bandKey),
        `${requirement.bandKey}: must name the band that takes over`,
      );
    }
  }
});

test("D3 — `required` and `fallback.kind` never drift: they say the same thing from opposite ends", () => {
  for (const requirement of RESOLVER_FEE_BAND_REQUIREMENTS) {
    assert.equal(
      requirement.required,
      requirement.fallback.kind === "none",
      `${requirement.bandKey}: required=${requirement.required} disagrees with fallback.kind=${requirement.fallback.kind}`,
    );
  }
});

test("D4 — an UNDECLARED band is allowed off and claims NOTHING about the consequence (§13)", () => {
  const ruling = feeBandDeactivationRuling("band_that_no_resolver_declares");
  assert.equal(ruling.declared, false);
  assert.equal(ruling.allowed, true);
  assert.equal(ruling.reason, "not_declared");
  assert.equal(ruling.owner, null);
  assert.match(ruling.consequence, /NOTHING is claimed/);
  // It must not invent a fallback, a value or a resolver for a band nothing reads.
  assert.doesNotMatch(ruling.consequence, /falls back to/);
});

test("D4b — the four seeded bands no resolver reads today are reported as undeclared, not as safe", () => {
  // These exist in migration 258 and are re-exported as constants, but nothing calls a resolver
  // with them. That is a real state and the panel says so rather than guessing either way.
  for (const bandKey of [
    "concierge:booking_pct",
    "concierge:booking_cap_cents",
    "plans:plus_task_allowance",
    "ready_made:platform_band",
  ]) {
    assert.equal(feeBandRequirement(bandKey), null, `${bandKey} is expected to be undeclared today`);
    assert.equal(feeBandDeactivationRuling(bandKey).reason, "not_declared");
  }
});

// ── D5 — the derivation pin ───────────────────────────────────────────────────────────────

test("D5 — every band reached through a FAIL-LOUD accessor with a static key is declared required", () => {
  const contractSrc = readStripped("server/services/fee-band-requirements.ts");
  // name -> literal band key, derived from the contract module itself (never a hand-typed list).
  const constants = new Map<string, string>();
  for (const m of contractSrc.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"/g)) {
    constants.set(m[1], m[2]);
  }
  assert.ok(constants.size > 10, "expected the contract module to export band-key constants");

  const FAIL_LOUD = /\b(requireBand|requireBandType|requireFlatCentsBand|requireCountBand|requireRuleBand)\s*\(\s*([A-Za-z_$][\w$]*|"[^"]+"|'[^']+')/g;
  const found = new Map<string, string>(); // bandKey -> "file:site"
  const unresolved: string[] = [];

  for (const rel of walk("server")) {
    const src = readStripped(rel);
    // One level of local alias (`const PRO_RATE_STANDARD_BAND = PROVIDER_LIMITED_BAND;`) —
    // pricing.routes.ts renames two bands for narrative reasons and would otherwise be invisible.
    const local = new Map<string, string>();
    for (const m of src.matchAll(/const ([A-Za-z_$][\w$]*)\s*=\s*([A-Z][A-Z0-9_]*)\s*;/g)) {
      const target = constants.get(m[2]);
      if (target) local.set(m[1], target);
    }
    for (const m of src.matchAll(FAIL_LOUD)) {
      const raw = m[2];
      let key: string | undefined;
      if (/^["']/.test(raw)) key = raw.slice(1, -1);
      else key = constants.get(raw) ?? local.get(raw);
      if (!key) { unresolved.push(`${rel}: ${m[1]}(${raw})`); continue; }
      found.set(key, `${rel}: ${m[1]}(${raw})`);
    }
  }

  assert.ok(found.size > 0, "expected at least one statically resolvable fail-loud band read");
  const undeclared: string[] = [];
  for (const [bandKey, site] of found) {
    const requirement = feeBandRequirement(bandKey);
    if (!requirement || !requirement.required) {
      undeclared.push(`${bandKey} (read fail-loud at ${site})`);
    }
  }
  assert.deepEqual(
    undeclared,
    [],
    "a band read through a fail-loud accessor must be declared required:true in " +
      "RESOLVER_FEE_BAND_REQUIREMENTS — otherwise /admin/fee-bands would let an operator switch " +
      "off a charge path that cannot survive it:\n  " + undeclared.join("\n  "),
  );
  // Stated negative space, asserted rather than only written down: dynamic keys exist and are
  // deliberately skipped. If this ever became empty the pin would be over-claiming its coverage.
  assert.ok(
    unresolved.length > 0,
    "expected at least one dynamically-keyed fail-loud read (the pin's stated blind spot)",
  );
});

// ── D6 — the rate_type value set is pinned to the DB CHECK (V-6) ──────────────────────────

test("D6 — FEE_BAND_RATE_TYPES equals the fee_bands rate_type CHECK in migration 258", () => {
  const sql = fs.readFileSync(path.join(ROOT, "server/migrations/258_plans_reconcile.sql"), "utf8");
  const m = sql.match(/CHECK\s*\(rate_type IN \(([^)]*)\)\)/);
  assert.ok(m, "migration 258 must still carry the fee_bands rate_type CHECK");
  const fromCheck = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(
    [...FEE_BAND_RATE_TYPES].sort(),
    fromCheck.sort(),
    "shared/fee-band-display.ts must carry exactly the rate_types the DB CHECK allows — a type " +
      "the panel does not know is a band the panel silently drops (V-6)",
  );
  for (const rateType of FEE_BAND_RATE_TYPES) {
    const display = FEE_BAND_RATE_TYPE_DISPLAY[rateType];
    assert.ok(display?.unitNote, `${rateType} must say what its stored number means`);
  }
});

test("D6b — the admin page hard-filters no rate_type out of the list (V-6)", () => {
  const page = readStripped("client/src/pages/admin/fee-bands.tsx");
  assert.doesNotMatch(
    page,
    /filter\([^)]*rate_type\s*===\s*["']/,
    "the page must not partition bands by a hard-coded rate_type literal — that is exactly how " +
      "concierge:ai_task rendered nowhere",
  );
  assert.match(page, /FEE_BAND_RATE_TYPES/, "groups must be built from the shared value set");
  assert.match(page, /isKnownFeeBandRateType/, "an unrecognised rate_type must still render");
  assert.match(page, /max_amount/, "V-4: the page must read the cap");
  assert.match(page, /deactivation\.consequence/, "V-5: the page must show the SERVER's consequence");
});

// ── V-4 — the cap ─────────────────────────────────────────────────────────────────────────

test("V-4 — max_amount round-trips: selected by the read, accepted by the patch, and never confused with max_rate", () => {
  const admin = readStripped("server/routes/admin.routes.ts");
  const getStart = admin.indexOf('router.get("/api/admin/fee-bands"');
  const patchStart = admin.indexOf('router.patch("/api/admin/fee-bands/:bandKey"');
  assert.ok(getStart > 0 && patchStart > getStart, "both fee-band handlers must still exist");
  const getHandler = admin.slice(getStart, patchStart);
  const patchHandler = admin.slice(patchStart, patchStart + 6000);

  assert.match(getHandler, /max_amount/, "the read must select max_amount");
  assert.match(getHandler, /feeBandDeactivationRuling/, "the read must carry the deactivation ruling");
  assert.match(patchHandler, /max_amount\s*=/, "the patch must write max_amount");
  assert.match(patchHandler, /feeBandPatchBodySchema/, "§19: the patch body must go through the allowlist");
  assert.match(patchHandler, /feeBandDeactivationRuling/, "V-5: the patch must consult the ruling");
  // max_rate is a DIFFERENT column and must not have been repurposed as the cap.
  assert.match(patchHandler, /max_rate\s*=/, "max_rate must still be written separately");
});

test("V-4b — a present-but-invalid cap is REFUSED, never silently ignored", () => {
  assert.equal(feeBandPatchBodySchema.safeParse({ maxAmount: 25 }).success, true);
  assert.equal(feeBandPatchBodySchema.safeParse({ maxAmount: null }).success, true, "null = uncapped is a real setting");
  assert.equal(feeBandPatchBodySchema.safeParse({ maxAmount: "25" }).success, false, "a string cap is refused");
  assert.equal(feeBandPatchBodySchema.safeParse({ maxAmount: -1 }).success, false, "a negative cap is refused");
  assert.equal(feeBandPatchBodySchema.safeParse({ maxAmount: Number.NaN }).success, false);
  assert.equal(feeBandPatchBodySchema.safeParse({ maxAmount: Number.POSITIVE_INFINITY }).success, false);
});

test("V-4c — a band whose reader REQUIRES a cap may not have it cleared, and the refusal says why", () => {
  const capped = RESOLVER_FEE_BAND_REQUIREMENTS.filter((r) => r.requiresMaxAmount);
  assert.ok(capped.length > 0, "at least one band must declare requiresMaxAmount");
  for (const requirement of capped) {
    const ruling = feeBandMaxAmountClearRuling(requirement.bandKey);
    assert.equal(ruling.allowed, false, `${requirement.bandKey}'s cap must not be clearable`);
    assert.ok(ruling.refusal && ruling.refusal.includes(requirement.bandKey));
  }
  // A band with no cap requirement is untouched by this rule.
  assert.equal(feeBandMaxAmountClearRuling("coordination_floor").allowed, true);
  assert.equal(feeBandMaxAmountClearRuling("band_that_no_resolver_declares").allowed, true);
});

// ── §19 — the allowlist ───────────────────────────────────────────────────────────────────

test("§19 — the patch body is an ALLOWLIST: an unknown key is refused, not stripped", () => {
  assert.equal(feeBandPatchBodySchema.safeParse({ defaultRate: 0.07 }).success, true);
  // The band's IDENTITY is not editable and is not in the pick.
  assert.equal(feeBandPatchBodySchema.safeParse({ bandKey: "other" }).success, false);
  assert.equal(feeBandPatchBodySchema.safeParse({ rateType: "percent" }).success, false);
  // Server-derived provenance is not client-settable.
  assert.equal(feeBandPatchBodySchema.safeParse({ updatedBy: "someone-else" }).success, false);
  assert.equal(feeBandPatchBodySchema.safeParse({ updatedAt: "2020-01-01" }).success, false);
  assert.equal(feeBandPatchBodySchema.safeParse({ id: "x" }).success, false);
  // Present-but-invalid rates stay 400s (the behaviour the handler already had, now in the schema).
  assert.equal(feeBandPatchBodySchema.safeParse({ defaultRate: "abc" }).success, false);
  assert.equal(feeBandPatchBodySchema.safeParse({ isActive: "false" }).success, false);
  // Omitting everything is legal — it means "leave unchanged".
  assert.equal(feeBandPatchBodySchema.safeParse({}).success, true);
});

// ── §8 — one home for the documented fallback defaults ────────────────────────────────────

test("§8 — a resolver's fallback default is READ from the manifest, so the panel cannot quote a number the resolver does not charge", () => {
  // The accessor answers for a declared code-constant fallback and THROWS otherwise — never 0,
  // which on a fee path is a free charge (§13).
  assert.equal(declaredFallbackValue("coordination_floor"), 499);
  assert.equal(declaredFallbackValue("coordination_percent"), 0.08);
  assert.throws(() => declaredFallbackValue("traveler_service_fee"), /no declared code-constant fallback/);
  assert.throws(() => declaredFallbackValue("ready_made_trip"), /no declared code-constant fallback/);
  assert.throws(() => declaredFallbackValue("nope"), /no declared code-constant fallback/);

  // And the resolvers read it rather than declaring their own copy.
  const optimization = readStripped("server/services/optimization-fee.service.ts");
  assert.match(optimization, /declaredFallbackValue\(COORDINATION_FLOOR_BAND\)/);
  assert.match(optimization, /declaredFallbackValue\(COORDINATION_PERCENT_BAND\)/);
  const pricing = readStripped("server/services/pricing.service.ts");
  assert.match(pricing, /declaredFallbackValue\(PLATFORM_DEPOSIT_BAND\)/);
  const commission = readStripped("server/services/commission.ts");
  assert.match(commission, /declaredFallbackValue\(AFFILIATE_STANDARD_BAND\)/);
  const bookingActions = readStripped("server/services/booking-actions.service.ts");
  assert.match(bookingActions, /declaredFallbackValue\(bandKey\)/);
});

test("§8b — no resolved fee moved: the documented fallbacks hold their pre-lane values", () => {
  // These are the constants the five resolvers declared inline before this lane moved them into
  // the manifest. If any one of them changes, something the platform charges changed with it.
  assert.equal(declaredFallbackValue("platform_deposit"), 0.25);
  assert.equal(declaredFallbackValue("affiliate_standard"), 0.70);
  assert.equal(declaredFallbackValue("coordination_floor"), 499);
  assert.equal(declaredFallbackValue("coordination_percent"), 0.08);
  assert.equal(declaredFallbackValue("expert_review_flat"), 50);
  assert.equal(declaredFallbackValue("expert_review_book_flat"), 50);
  assert.equal(declaredFallbackValue("expert_review_book_percent"), 0.05);
  assert.equal(declaredFallbackValue("full_concierge_flat"), 100);
  assert.equal(declaredFallbackValue("full_concierge_percent"), 0.08);
  assert.equal(declaredFallbackValue("expert_review_expert_share"), 0.75);
});
