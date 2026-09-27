/**
 * D-41 — A PLAN ITEM MAY CARRY A UNIT COUNT, AND EXACTLY ONE MODULE WRITES IT.
 *
 * Decision-maker ruling 2026-09-15, punchlist **D-41** = yes; ledger `2026-09-15-d41-item-quantity`;
 * migration 298.
 *
 * D-14 (ledger `2026-09-15-d14-quantity-is-units`) settled what the number MEANS: `cart_items.
 * quantity` is UNITS OF THE LISTING — the multiplier `resolveItemBaseAmount` reads — and
 * `cart_items.party_size` is THE PARTY, which is never a multiplier. LD 39 makes `itinerary_items`
 * the ONE store of a plan's contents and the cart its `ready_for_checkout` PROJECTION, but the
 * plan had nowhere to hold a count, so `syncItemProjection` wrote `quantity: 1` unconditionally and
 * `materializeCartLinesAsItems` had to REFUSE a multi-unit line (`quantity_gt_one`, D-16 (a))
 * rather than silently reduce what the traveler is charged. Migration 298 is the column that lifts
 * it.
 *
 * WHAT THESE HOLD (pure + static source pins — no DB, no server, no network; the behavioural half
 * lives in `guest-cart-becomes-plan.http.test.ts` G7/G13, which now assert the LIFT):
 *
 *   U1  §19 — the column is NOT client-settable: `insertItineraryItemSchema` omits it and the
 *       storage strip covers the raw `req.body` destructure on the canonical item PATCH route.
 *   U2  §18 rule 1 — ONE COPY-DOWN, BOTH WAYS. The projection module is the only file under
 *       `server/` that writes the count in either direction.
 *   U3  §13 — NULL MEANS ONE UNIT, and the projection says so in code: the literal `quantity: 1`
 *       is gone and the cart row is derived from the item's own value.
 *   U4  THE REFUSAL IS GONE, NOT MERELY UNREACHABLE. `quantity_gt_one` exists nowhere in the
 *       shipped code (comments stripped) — §18c: a skip reason with no producer would read to the
 *       next author as a refusal that can still happen.
 *   U5  §13 — ONE UNIT IS CARRIED AS NULL, NOT AS 1: the builder only writes the column for an
 *       above-one count, so a `DEFAULT 1` cart row never becomes "the traveler answered one".
 *   U6  D-14 IS UNTOUCHED: the archetype rule still decides who may be asked, and this lane
 *       introduced no second admission rail for the number.
 *   U7  CHECKOUT MATH IS UNTOUCHED: the money path still multiplies by the CART row's count.
 *
 * Run: npx tsx --test server/__tests__/plan-item-units.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { insertItineraryItemSchema } from "../../shared/schema";
import { archetypeAsks, resolveCartLineCounts } from "../../shared/cart-quantity";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Strip block and line comments so every pin below reads CODE, never prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readStripped(rel: string): string {
  return stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "migrations") continue;
      walkTs(rel, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(rel.split(path.sep).join("/"));
    }
  }
  return out;
}

const PROJECTION = "server/services/cart-projection.service.ts";

describe("D-41 — the plan item's unit count (migration 298)", () => {
  // ── U1 ──────────────────────────────────────────────────────────────────────────────────────
  it("U1: §19 — `quantity` is omitted from the item insert schema and stripped in storage", () => {
    const parsed = insertItineraryItemSchema.parse({
      tripId: "t-1",
      dayNumber: 1,
      title: "A thing",
      // A crafted body setting its own unit count, which prices a line rate × quantity.
      quantity: 9,
    } as Record<string, unknown>);
    assert.equal(
      (parsed as Record<string, unknown>).quantity,
      undefined,
      "under a denylist schema a freshly added column is client-settable BY DEFAULT — this one is " +
        "named in the omit list, so the generic body parse cannot reach it",
    );

    const storage = readStripped("server/storage.ts");
    const strip = storage.slice(storage.indexOf("export function stripItineraryItemRoutingFields"));
    assert.match(
      strip.slice(0, strip.indexOf("return safe")),
      /quantity:\s*_/,
      "layer 2 (§19's two-layer shape): the storage strip covers the raw `req.body` destructure " +
        "on the canonical item PATCH route, which a type-level omit cannot reach",
    );
  });

  // ── U2 ──────────────────────────────────────────────────────────────────────────────────────
  it("U2: §18 rule 1 — the count crosses between the two tables in exactly ONE module", () => {
    // The two crossing expressions, by their own code: item -> cart (Section 2's projection) and
    // cart -> item (the ONE shared value builder both materialize rails compose through).
    const down = walkTs("server").filter((rel) =>
      /quantity:\s*item\.quantity\s*\?\?\s*1/.test(readStripped(rel)),
    );
    const up = walkTs("server").filter((rel) => /buildPlanItemValues/.test(readStripped(rel)));
    assert.deepEqual(down, [PROJECTION], "ONE copy-down of the count onto the cart row");
    assert.deepEqual(
      up,
      [PROJECTION],
      "and ONE composer of a plan item's values, which both the materialize and the convert rail " +
        "call — a second copy is how a projected item and a converted item would start describing " +
        "the same cart line differently",
    );

    // STATED NEGATIVE SPACE (§18d): this pin reads the two crossing expressions BY THEIR CODE. It
    // cannot see a raw-SQL write, an ORM write assembled from a variable, or a write added in a
    // file that also happens to spell one of these strings. That limit is why the real guard
    // against a second author is §19's two layers (U1 above) and not this scan — green here means
    // green within these bounds.
    const payments = readStripped("server/routes/payments.routes.ts");
    // Locked Decision 56 (ledger `2026-09-25-price-basis`): the booking row records the CART
    // line's units through the ONE `resolveItemUnitCount` the charge multiplies by — still the
    // CART row's `item`, never a plan item, which is the invariant this pin exists for.
    assert.match(
      payments,
      /quantity:\s*resolveItemUnitCount\(item\)/,
      "and the money path's own `item` — a CART line, not a plan item — is what the booking records",
    );
  });

  // ── U3 ──────────────────────────────────────────────────────────────────────────────────────
  it("U3: §13 — the cart row is derived from the item's count, and NULL reads as one unit", () => {
    const src = readStripped(PROJECTION);
    assert.match(
      src,
      /quantity:\s*item\.quantity\s*\?\?\s*1/,
      "the projection carries the item's OWN count, and reads a NULL as ONE UNIT — the item " +
        "model's historical shape, never 0 and never a guess",
    );
    assert.doesNotMatch(
      src,
      /quantity:\s*1\s*,/,
      "the unconditional `quantity: 1` is gone — it is what made a multi-unit line unfaithful",
    );
  });

  // ── U4 ──────────────────────────────────────────────────────────────────────────────────────
  it("U4: §18c — the `quantity_gt_one` refusal is DELETED, not left unreachable", () => {
    const survivors = [...walkTs("server"), ...walkTs("shared"), ...walkTs("client")].filter((rel) =>
      /quantity_gt_one/.test(readStripped(rel)),
    );
    assert.deepEqual(
      survivors,
      [],
      "a skip reason with no producer reads to the next author as a refusal that can still " +
        "happen; `custom_venue`/`content_line` left the same union the same way at migration 295",
    );
  });

  // ── U5 ──────────────────────────────────────────────────────────────────────────────────────
  it("U5: §13 — a single-unit line is carried as NULL, never written back as a fabricated 1", () => {
    const src = readStripped(PROJECTION);
    assert.match(
      src,
      /lineUnits\s*!==\s*null\s*&&\s*lineUnits\s*>\s*1\s*\?\s*\{\s*quantity:\s*lineUnits\s*\}\s*:\s*\{\}/,
      "`cart_items.quantity` is DEFAULT 1 and every units-pinned archetype is pinned there by " +
        "rule, so a 1 is usually the COLUMN's answer — writing it onto the item would turn " +
        "'never asked' into 'the traveler answered one'",
    );
  });

  // ── U6 ──────────────────────────────────────────────────────────────────────────────────────
  it("U6: D-14 is untouched — the archetype still decides who may be asked, and above-one is REFUSED there", () => {
    // A stay is pinned to one unit; that is where a multi-unit answer is refused, and it still is.
    const stay = archetypeAsks({ productShape: "property", deliveryMethod: "in_person" });
    assert.equal(stay.rule, "stay");
    assert.equal(stay.asksUnits, false);
    const refused = resolveCartLineCounts({ productShape: "property" }, { quantity: 3 });
    assert.equal(refused.ok, false, "refused, never silently clamped to 1 (§13)");

    // A per-person (Locked Decision 56) seat-shaped listing derives units from the party,
    // server-side (§14 on the multiplier).
    const seats = resolveCartLineCounts({ deliveryMethod: "in_person", priceBasis: "per_person" }, { partySize: 4, quantity: 99 });
    assert.equal(seats.ok, true);
    assert.equal(seats.ok && seats.quantity, 4, "derived from the party answer, not the body");

    // And this lane added NO second admission rail: the item side has no counts resolver at all.
    const src = readStripped(PROJECTION);
    assert.doesNotMatch(
      src,
      /resolveCartLineCounts|archetypeAsks/,
      "the projection PROJECTS a count that the cart rails already admitted; re-running the " +
        "admission here would be a second authority over the same number",
    );
  });

  // ── U7 ──────────────────────────────────────────────────────────────────────────────────────
  it("U7: checkout math is untouched — the money path still multiplies by the CART row's count", () => {
    const payments = readStripped("server/routes/payments.routes.ts");
    const at = payments.indexOf("export function resolveItemBaseAmount");
    assert.ok(at > 0, "the money path's per-line amount helper is where it was");
    const body = payments.slice(at, payments.indexOf("\n}", at));
    // REPAIRED to its invariant, not deleted (punchlist V-26, ledger `2026-09-15-v26-slot-units`).
    // This asserted the INLINED expression `rate * (item?.quantity || 1)`. V-26 needed the SAME
    // number at the slot claim, so it was lifted into ONE named derivation — `resolveItemUnitCount`
    // — that both the charge and the claim read (§18 rule 1). The invariant U7 exists for is
    // untouched and is what is asserted now: a non-stay line is priced `rate ×` the CART line's own
    // count, and that count is still `item.quantity` with the historical `|| 1` reading (§13 — an
    // unstated count is ONE unit). What U7 forbids is a multiplier moving onto the PLAN's column,
    // which the second assertion below still owns.
    assert.match(
      body,
      /rate\s*\*\s*resolveItemUnitCount\(item\)/,
      "a non-stay line is still priced rate × the CART line's count — this lane added no charge, " +
        "removed none, and moved no multiplier onto the plan",
    );
    const unitCount = payments.slice(payments.indexOf("export function resolveItemUnitCount"));
    // Locked Decision 56: the derivation reads the CART row's count through the ONE shared
    // `cartLineUnitCount` (the row's own `quantity || 1` for every rule but a per-booking place
    // service, which is one unit) — still the CART row's `item`, never the plan's column.
    assert.match(
      unitCount.slice(0, unitCount.indexOf("\n}")),
      /return cartLineUnitCount\(item\?\.service \?\? null, item\?\.quantity\);/,
      "and that derivation is the CART row's count, read through the one shared rule",
    );
    assert.doesNotMatch(
      payments,
      /itineraryItems\.quantity/,
      "and no money path reads the PLAN's column at all (§14: the amount stays server-derived " +
        "from the row the cart rails already admitted)",
    );
  });
});
