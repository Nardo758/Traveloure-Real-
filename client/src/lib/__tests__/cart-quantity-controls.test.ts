/**
 * cart-quantity-controls.test.ts — THE CLIENT SIDE OF D-14: THE ARCHETYPE CHOOSES THE CONTROL, AND
 * THE CHOICE IS READ FROM THE SERVER'S OWN MODULE.
 *
 * (decision-maker ruling 2026-09-15, punchlist **D-14**, option A; ledger
 *  `2026-09-15-d14-quantity-is-units`; CLAUDE.md §13, §14, §18 rule 1, Locked Decision 39;
 *  ruling 83 / migration 206)
 *
 * The companion to `shared/__tests__/cart-quantity.test.ts` (the rules) and
 * `server/__tests__/cart-quantity-admission.http.test.ts` (the rails). What this file pins is the
 * thing neither of those can see: that the page which DRAWS the count control asks the shared
 * module which control to draw, rather than re-deciding it from a field of its own.
 *
 *   W1  every client surface that draws a cart line's count control imports `@shared/cart-quantity`
 *       — the surface set is DERIVED (files that mount the stepper), never a literal list.
 *   W2  the control choice is made from the module's own answer (`asksUnits` / `unitsFollowParty`),
 *       and the pre-lane test that read only the per-night stay (`roomStay ? … : <stepper>`) is
 *       GONE — that test drew a price-multiplying stepper on every bundle.
 *   W3  the unit noun printed where no control is drawn comes from `cartUnitLabel`, so the label
 *       and the rule cannot disagree (§18 rule 1). No client file spells "1 bundle" itself.
 *   W4  ONE write path: both the units control and the seats control go through the SAME cart
 *       PATCH mutation. A second mutation is how one control starts writing a field the server
 *       never admits.
 *   W5  §13 on the party field: it is rendered EMPTY when `party_size` is null and writes an
 *       explicit `null` when cleared — never 0, never a defaulted 1, and never a price.
 *   W6  no client file restates the archetype rule: nothing outside the shared module maps a
 *       `product_shape` / `delivery_method` value onto a unit-count decision.
 *
 * NEGATIVE SPACE (§18d): these are STATIC pins over the source, so they prove which module the page
 * consults and not what the browser renders. The behaviour of the rule itself is proven purely in
 * `shared/__tests__/cart-quantity.test.ts`, and its enforcement on the wire in the server suite.
 *
 * Run solo: npx tsx --test client/src/lib/__tests__/cart-quantity-controls.test.ts
 * CI: `unit-suite-client-lib` (client/src/lib/__tests__ — whole directory).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { cartUnitLabel } from "@shared/cart-quantity";

const REPO = path.resolve(import.meta.dirname, "../../../..");
const CLIENT_SRC = path.join(REPO, "client/src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Comments stripped, so prose describing the rule is never read as a second implementation. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const CLIENT_FILES = walk(CLIENT_SRC);

/** DERIVED: the surfaces that draw a cart line's own count control. */
const COUNT_CONTROL_SURFACES = CLIENT_FILES.filter((f) => /CartQuantityStepper/.test(code(f)));

// ── W1 ────────────────────────────────────────────────────────────────────────────────────────
test("W1: every surface that draws a cart line's count control reads the ONE module", () => {
  assert.ok(COUNT_CONTROL_SURFACES.length > 0, "the derivation must find the surface set");
  for (const file of COUNT_CONTROL_SURFACES) {
    assert.match(
      code(file),
      /from "@shared\/cart-quantity"/,
      `${path.relative(REPO, file)} draws the control but does not ask which control to draw`,
    );
  }
});

// ── W2 ────────────────────────────────────────────────────────────────────────────────────────
test("W2: the choice is the module's answer, and the pre-lane per-night-only test is gone", () => {
  for (const file of COUNT_CONTROL_SURFACES) {
    const src = code(file);
    assert.match(src, /archetypeAsks\(/, `${path.relative(REPO, file)} must resolve the archetype`);
    assert.match(
      src,
      /asksUnits/,
      `${path.relative(REPO, file)} must branch on the module's own answer`,
    );
    assert.match(
      src,
      /unitsFollowParty/,
      `${path.relative(REPO, file)} must know when the count IS the party`,
    );
    // THE NEGATIVE: the old control choice was `roomStay ? <label> : <stepper>` — true only for a
    // per-night stay, so a bundle kept a price-multiplying stepper. The guard IMMEDIATELY above
    // each mount must be the module's answer and must not mention the stay at all.
    const mount = src.indexOf("<CartQuantityStepper");
    assert.ok(mount > 0, `${path.relative(REPO, file)} must mount the control`);
    const guard = src.slice(Math.max(0, mount - 200), mount);
    assert.match(guard, /asksUnits/, `${path.relative(REPO, file)}: the mount's guard is not the module's answer`);
    assert.ok(
      !/roomStay/.test(guard),
      `${path.relative(REPO, file)} still chooses the control from the per-night stay alone`,
    );
  }
});

// ── W3 ────────────────────────────────────────────────────────────────────────────────────────
test("W3: the unit noun comes from the module — no client file spells one itself", () => {
  const bundleLabel = cartUnitLabel("bundle");
  assert.ok(bundleLabel, "the module owns the noun");
  for (const file of COUNT_CONTROL_SURFACES) {
    assert.match(code(file), /cartUnitLabel\(/, `${path.relative(REPO, file)} must read the noun`);
  }
  const restated = CLIENT_FILES.filter((f) => code(f).includes(`"${bundleLabel}"`) || code(f).includes(`>${bundleLabel}<`));
  assert.deepEqual(
    restated.map((f) => path.relative(REPO, f)),
    [],
    "a second spelling of the unit noun would drift from the rule that produces it",
  );
});

// ── W4 ────────────────────────────────────────────────────────────────────────────────────────
test("W4: ONE cart PATCH mutation carries both controls — units and seats", () => {
  const cart = code(path.join(REPO, "client/src/pages/cart.tsx"));
  // DERIVED: every cart-line PATCH whose payload carries a COUNT. The pickup-location PATCH
  // (ruling 81) is a different field on the same row and is correctly not in this set — that is
  // this pin's stated bound.
  const countWrites = cart.match(/apiRequest\("PATCH", `\/api\/cart\/\$\{[^}]+\}`,\s*(patch|\{[^}]*(quantity|partySize)[^}]*\})/g) ?? [];
  assert.equal(
    countWrites.length,
    1,
    `exactly one cart-line count PATCH call site; found ${countWrites.length}`,
  );
  const commits = cart.match(/updateItemMutation\.mutate\(/g) ?? [];
  assert.ok(commits.length >= 2, "the units control and the party control both commit through it");
  assert.match(cart, /patch: lineAsks\.unitsFollowParty \? \{ partySize: count \} : \{ quantity: count \}/,
    "the two write targets are chosen by the module, in one place");
});

// ── W5 ────────────────────────────────────────────────────────────────────────────────────────
test("W5: the party field is empty when unanswered and clears to an explicit null (§13)", () => {
  const cart = code(path.join(REPO, "client/src/pages/cart.tsx"));
  assert.match(cart, /function CartPartyField\(/, "the party question has its own field");
  assert.match(
    cart,
    /item\.partySize === "number" && item\.partySize > 0 \? String\(item\.partySize\) : ""/,
    "an unanswered party renders EMPTY — never 0 and never a defaulted 1",
  );
  assert.match(cart, /digits === "" \? null :/, "clearing it writes an explicit null, not a number");
  // §14: the party control touches no money.
  const field = cart.slice(cart.indexOf("function CartPartyField("));
  const body = field.slice(0, field.indexOf("\n}\n"));
  assert.ok(
    !/price|formatPrice|subtotal|total|fee/i.test(body),
    "a party count is never a multiplier and this field computes no amount",
  );
});

// ── W6 ────────────────────────────────────────────────────────────────────────────────────────
test("W6: no client file restates the archetype rule", () => {
  const offenders = CLIENT_FILES.filter((f) => {
    const src = code(f);
    const speaks = /\basksUnits\b|\bunitsFollowParty\b|\barchetypeAsks\b|\bcartUnitLabel\b/.test(src);
    const imports = /from "@shared\/cart-quantity"/.test(src);
    return speaks && !imports;
  });
  assert.deepEqual(
    offenders.map((f) => path.relative(REPO, f)),
    [],
    "the decision has exactly one home",
  );
});
