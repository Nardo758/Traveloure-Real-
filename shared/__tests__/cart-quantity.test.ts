/**
 * cart-quantity.test.ts — D-14: `quantity` IS UNITS, `party_size` IS THE PARTY, AND THE ARCHETYPE
 * DECIDES WHICH QUESTION IS ASKED.
 *
 * (decision-maker ruling 2026-09-15, punchlist **D-14**, option A; ledger
 *  `2026-09-15-d14-quantity-is-units`; CLAUDE.md §13, §14, §18 rule 1, §19, Locked Decision 39,
 *  ruling 83 / migration 206)
 *
 *   Q1  the four ruled archetypes, each from the listing fact that decides it: a stay (by
 *       `product_shape` AND, independently, by `pricing_unit = 'per_night'`), a bundle, a
 *       seat-shaped place service, an artifact/async listing.
 *   Q2  the FIFTH answer is named, not guessed (§13): a live remote session (`call`/`video`) and a
 *       row carrying no classifiable fact are `unruled` and keep TODAY'S behaviour — a free unit
 *       count and no party question. A cart line that names no listing at all is the same answer.
 *   Q3  PRECEDENCE — shape beats method. The P6 and P7 archetype fixtures are BOTH `in_person`, so
 *       an implementation that reads the delivery method first turns a villa and a bundle into
 *       seats. This is the half a reader cannot check by eye.
 *   Q4  the unit label is total over the three label-bearing rules and absent for the two that
 *       draw a control instead.
 *   Q5  the ADMISSION: a multi-unit body on a pinned archetype is REFUSED, not clamped, and the
 *       refusal carries the rule; `quantity: 1` and an absent quantity are always fine.
 *   Q6  where units follow the party, `quantity` is DERIVED from `party_size` and a body-supplied
 *       quantity is not consulted (§14's posture, one derivative up); clearing the party returns
 *       the line to ONE unit.
 *   Q7  the party answer itself is never refused, on ANY archetype — the stated asymmetry (§18d):
 *       it is not a multiplier, and ruling 83 landed it as an eligibility input on every line.
 *   Q8  the wiring pin, derived from the FILE SET (comments stripped): every server file that
 *       admits a cart write consults the ONE derivation, and no second copy of the archetype rule
 *       exists anywhere in the repo.
 *
 * THE NEGATIVE: Q3 fails against any implementation that tests `delivery_method` before
 * `product_shape`; Q5 fails against one that clamps instead of refusing; Q6 fails against one that
 * lets a client-supplied `quantity` win over a stated seat count.
 *
 * NEGATIVE SPACE (§18d): this file proves what a listing's own columns imply. It says nothing
 * about slot CAPACITY — which claims the line's unit count since punchlist V-26 (ledger
 * `2026-09-15-v26-slot-units`; proven in `server/__tests__/slot-units.db.test.ts`, one rail later)
 * — and nothing about what a line is CHARGED, which stays server-derived in
 * `resolveItemBaseAmount` and was not touched by this lane.
 *
 * Run solo: npx tsx --test shared/__tests__/cart-quantity.test.ts
 * CI: `unit-suite-shared` (shared/__tests__ — whole directory).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  archetypeAsks,
  cartCountLabel,
  cartUnitLabel,
  resolveCartLineCounts,
  PINNED_UNIT_QUANTITY,
  type CartQuantityRule,
} from "../cart-quantity";

const REPO = path.resolve(import.meta.dirname, "../..");

// ── Q1 — the four ruled archetypes, each from the fact that decides it ──────────────────────────

test("Q1: a stay asks GUESTS and never units — by product_shape and, independently, by pricing_unit", () => {
  for (const facts of [
    { productShape: "property", deliveryMethod: "in_person" },
    { productShape: "property_room", deliveryMethod: "in_person" },
    { pricingUnit: "per_night", deliveryMethod: "in_person" },
    // The §9 P6 fixture's own row, verbatim in the fields that matter.
    { productShape: "property", pricingUnit: null, deliveryMethod: "in_person" },
  ]) {
    const a = archetypeAsks(facts);
    assert.equal(a.rule, "stay", JSON.stringify(facts));
    assert.equal(a.asksUnits, false);
    assert.equal(a.asksParty, true);
    assert.equal(a.unitsFollowParty, false);
    assert.ok(a.reason.length > 0, "the rule says why, for the refusal and the surface");
  }
});

test("Q1: a bundle asks the party and is booked once", () => {
  const a = archetypeAsks({ productShape: "bundle", deliveryMethod: "in_person" });
  assert.equal(a.rule, "bundle");
  assert.deepEqual(
    { u: a.asksUnits, p: a.asksParty, f: a.unitsFollowParty },
    { u: false, p: true, f: false },
  );
});

test("Q1: a scheduled place service is sold by the seat — units FOLLOW the party", () => {
  for (const method of ["in_person", "hybrid"]) {
    const a = archetypeAsks({ deliveryMethod: method });
    assert.equal(a.rule, "seats", method);
    assert.deepEqual(
      { u: a.asksUnits, p: a.asksParty, f: a.unitsFollowParty },
      { u: true, p: true, f: true },
      method,
    );
  }
});

test("Q1: an artifact / async listing asks neither", () => {
  for (const method of ["pdf", "voice_notes", "async_messaging"]) {
    const a = archetypeAsks({ deliveryMethod: method });
    assert.equal(a.rule, "artifact", method);
    assert.deepEqual(
      { u: a.asksUnits, p: a.asksParty, f: a.unitsFollowParty },
      { u: false, p: false, f: false },
      method,
    );
  }
});

// ── Q2 — the fifth answer is NAMED, not guessed (§13) ───────────────────────────────────────────

test("Q2: a live remote session, an unclassifiable row and a line naming no listing are all `unruled`", () => {
  for (const facts of [
    { deliveryMethod: "call" },
    { deliveryMethod: "video" },
    { deliveryMethod: null, productShape: null },
    {},
    null,
    undefined,
  ] as const) {
    const a = archetypeAsks(facts as any);
    assert.equal(a.rule, "unruled", JSON.stringify(facts));
    // TODAY'S behaviour, unchanged: a free unit count, no party question, no derivation.
    assert.deepEqual(
      { u: a.asksUnits, p: a.asksParty, f: a.unitsFollowParty },
      { u: true, p: false, f: false },
      JSON.stringify(facts),
    );
  }
});

test("Q2: an unruled line's quantity is admitted exactly as sent — the lane changes nothing for it", () => {
  const r = resolveCartLineCounts({ deliveryMethod: "video" }, { quantity: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.quantity, 4);
  assert.equal(r.ok && r.unitsDerivedFromParty, false);
});

// ── Q3 — PRECEDENCE: shape beats method ─────────────────────────────────────────────────────────

test("Q3: a property and a bundle are BOTH `in_person` — shape decides, or every villa becomes seats", () => {
  assert.equal(archetypeAsks({ productShape: "property", deliveryMethod: "in_person" }).rule, "stay");
  assert.equal(archetypeAsks({ productShape: "bundle", deliveryMethod: "in_person" }).rule, "bundle");
  // …and a per-night row whose method is an ARTIFACT method is still a stay, not an artifact.
  assert.equal(archetypeAsks({ pricingUnit: "per_night", deliveryMethod: "pdf" }).rule, "stay");
});

test("Q3: casing and padding are normalised — a row is classified by its value, not its spelling", () => {
  assert.equal(archetypeAsks({ productShape: " Property " }).rule, "stay");
  assert.equal(archetypeAsks({ deliveryMethod: "IN_PERSON" }).rule, "seats");
  assert.equal(archetypeAsks({ deliveryMethod: "  " }).rule, "unruled");
});

// ── Q4 — the unit label ─────────────────────────────────────────────────────────────────────────

test("Q4: the unit label is total over the rules that draw no control, and absent for the ones that do", () => {
  const withLabel: CartQuantityRule[] = ["stay", "bundle", "artifact"];
  for (const rule of withLabel) {
    const label = cartUnitLabel(rule);
    assert.ok(label && label.length > 0, rule);
  }
  assert.equal(cartUnitLabel("seats"), null);
  assert.equal(cartUnitLabel("unruled"), null);
  // The label is the honest count, never a claim about people.
  assert.equal(cartUnitLabel("stay"), "1 room");
  assert.equal(cartUnitLabel("bundle"), "1 bundle");
});

// ── Q5 — the admission REFUSES, it does not clamp ───────────────────────────────────────────────

test("Q5: a multi-unit body on a pinned archetype is refused with the rule named — never reduced", () => {
  for (const facts of [
    { productShape: "property" },
    { pricingUnit: "per_night" },
    { productShape: "bundle" },
    { deliveryMethod: "pdf" },
  ]) {
    const r = resolveCartLineCounts(facts, { quantity: 2 });
    assert.equal(r.ok, false, JSON.stringify(facts));
    if (r.ok) continue;
    assert.equal(r.reason, "units_not_asked");
    assert.ok(r.message.length > 20, "the refusal names the rule rather than saying 'invalid'");
    assert.equal(r.rule, archetypeAsks(facts).rule);
    // THE NEGATIVE: a clamping implementation would answer ok:true with quantity 1 here.
  }
});

test("Q5: one unit, and an absent quantity, are always admitted on a pinned archetype", () => {
  const one = resolveCartLineCounts({ productShape: "property" }, { quantity: PINNED_UNIT_QUANTITY });
  assert.equal(one.ok, true);
  assert.equal(one.ok && one.quantity, 1);

  const absent = resolveCartLineCounts({ productShape: "bundle" }, {});
  assert.equal(absent.ok, true);
  // `undefined` = leave the stored count exactly as it is; it is not rewritten to 1 on every PATCH.
  assert.equal(absent.ok && absent.quantity, undefined);
});

test("Q5: a seat-shaped listing keeps its unit count — the refusal is scoped to the pinned three", () => {
  const r = resolveCartLineCounts({ deliveryMethod: "in_person" }, { quantity: 6 });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.quantity, 6);
});

// ── Q6 — units follow the party, server-derived ─────────────────────────────────────────────────

test("Q6: a stated seat count DERIVES the unit count, and a body-supplied quantity is not consulted", () => {
  const r = resolveCartLineCounts({ deliveryMethod: "in_person" }, { quantity: 1, partySize: 7 });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.quantity, 7, "§14's posture one derivative up: the multiplier is derived");
  assert.equal(r.ok && r.partySize, 7);
  assert.equal(r.ok && r.unitsDerivedFromParty, true);
});

test("Q6: clearing the seat count returns the line to ONE unit — it may not keep billing for seats nobody claimed", () => {
  const r = resolveCartLineCounts({ deliveryMethod: "hybrid" }, { partySize: null });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.quantity, PINNED_UNIT_QUANTITY);
  assert.equal(r.ok && r.partySize, null);
  assert.equal(r.ok && r.unitsDerivedFromParty, true);
});

test("Q6: a party answer on a NON-seat archetype derives nothing — a villa for seven is still one villa", () => {
  const r = resolveCartLineCounts({ productShape: "property" }, { partySize: 7 });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.quantity, undefined, "the unit count is untouched, never multiplied by the party");
  assert.equal(r.ok && r.partySize, 7);
  assert.equal(r.ok && r.unitsDerivedFromParty, false);
});

// ── Q7 — the party answer is never refused, and that asymmetry is a decision ────────────────────

test("Q7: every archetype admits a party answer, including the two that do not ask for one", () => {
  for (const facts of [
    { productShape: "property" },
    { productShape: "bundle" },
    { deliveryMethod: "in_person" },
    { deliveryMethod: "pdf" },
    { deliveryMethod: "video" },
    null,
  ]) {
    const r = resolveCartLineCounts(facts, { partySize: 3 });
    assert.equal(r.ok, true, JSON.stringify(facts));
    assert.equal(r.ok && r.partySize, 3, JSON.stringify(facts));
  }
});

// ── Q8 — the wiring pin, derived from the file set ──────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git" || entry === "artifacts") continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Comments stripped, so a rule QUOTED in prose is never mistaken for a second implementation. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("Q8: every cart write rail consults the ONE derivation — derived from the file set, not a count", () => {
  const routes = code(path.join(REPO, "server/routes.ts"));
  // The three write rails live in the monolith. Each must reach the shared admission.
  assert.match(routes, /from "@shared\/cart-quantity"/, "the monolith imports the one derivation");
  const admissionCalls = routes.match(/resolveCartLineCounts\(/g) ?? [];
  assert.ok(
    admissionCalls.length >= 3,
    `all three cart write rails must run the admission; found ${admissionCalls.length}`,
  );
});

test("Q8: no second copy of the archetype rule exists anywhere in the repo", () => {
  const OWNER = path.join(REPO, "shared/cart-quantity.ts");
  const offenders: string[] = [];
  for (const file of walk(REPO)) {
    if (file === OWNER) continue;
    if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
    const src = code(file);
    // A second copy is a file that PRODUCES this decision — it speaks the vocabulary
    // (`asksUnits` / `unitsFollowParty` / the rule names) — without importing the one module that
    // owns it. Files that merely name `property`/`bundle`/`pdf` for their OWN question
    // (`service-fundamentals.ts`, the offering-commerce contract, the provider catalog) are not
    // second copies of THIS rule and are correctly not flagged: this predicate is about the
    // decision's own vocabulary, which is its stated bound (§18d).
    const speaksTheDecision = /\basksUnits\b|\bunitsFollowParty\b|\bcartUnitLabel\b|\bresolveCartLineCounts\b|\barchetypeAsks\b/.test(src);
    const importsTheOwner = /from ["'](@shared\/cart-quantity|\.\.?\/[^"']*cart-quantity)["']/.test(src);
    if (speaksTheDecision && !importsTheOwner) offenders.push(path.relative(REPO, file));
  }
  assert.deepEqual(offenders, [], `a second archetype rule would drift from the server's: ${offenders.join(", ")}`);
});

// ── Q-D — Locked Decision 54: a per-day listing is sold by the day ──────────────────────────────

test("Q-D: a per-day async listing asks for DAYS (not pinned like an artifact), and says so", () => {
  const asks = archetypeAsks({ pricingUnit: "per_day", deliveryMethod: "async_messaging" });
  assert.equal(asks.rule, "days");
  assert.equal(asks.asksUnits, true);
  assert.equal(asks.asksParty, false);
  assert.equal(cartCountLabel(asks), "Days");
  assert.equal(cartUnitLabel("days"), null, "a control is drawn, so no static label");
  // The day count is admitted, not refused as it would be on a plain async listing.
  const ok = resolveCartLineCounts({ pricingUnit: "per_day", deliveryMethod: "async_messaging" }, { quantity: 4 });
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.quantity, 4);
  const pinned = resolveCartLineCounts({ deliveryMethod: "async_messaging" }, { quantity: 4 });
  assert.equal(pinned.ok, false);
  // The other labels are unchanged.
  assert.equal(cartCountLabel(archetypeAsks({ deliveryMethod: "in_person" })), "Seats");
  assert.equal(cartCountLabel(archetypeAsks({ deliveryMethod: "video" })), "Quantity");
});
