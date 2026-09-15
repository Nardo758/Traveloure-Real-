/**
 * item-kind.test.ts — THE FOUR KINDS, AND THE AUTHORING CONTRACT.
 *
 * (decision-maker ruling 2026-09-15, punchlist **D-4**, option A; ledger
 *  `2026-09-15-d4-item-kind-contract`; CLAUDE.md §13, §18 rule 1, §19, Locked Decision 39,
 *  Locked Decision 42 D23, Locked Decision 44)
 *
 *   K1  each of the four rules, in isolation, from the field it reads.
 *   K2  the PRECEDENCE, proven on rows that name more than one thing at once — this is the half a
 *       reader cannot check by eye, and it is why the rules are ordered rather than exclusive.
 *   K3  an absent field, a null one, an empty string and a whitespace-only one are all "names
 *       none": the derivation never treats a blank id as a link (§13).
 *   K4  the label map is TOTAL over the four kinds and returns nothing for anything else, and the
 *       `platformPriced` flag says exactly which two kinds a price may be shown against.
 *   K5  the authoring contract: refused / allowed, and the INDISTINGUISHABLE-BY-PROJECTION case —
 *       a caller whose input carries no link fields at all gets the WEAKER claim, never a
 *       fabricated one.
 *   K6  the wiring pin: the two ready-made author build rails call the ONE predicate, and no
 *       second copy of the four labels exists anywhere in the repo.
 *
 * THE NEGATIVE: K2's precedence cases and K5's refusals fail against any implementation that tests
 * the three columns in a different order or that treats a zero/blank price as a stated one.
 *
 * Run solo: npx tsx --test shared/__tests__/item-kind.test.ts
 * CI: `unit-suite-shared` (shared/__tests__ — whole directory).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  ITEM_KINDS,
  itemKind,
  itemKindChip,
  itemKindChipFor,
  authoredItemPriceRefusal,
  AUTHORED_PRICED_UNLINKED_REFUSAL,
  type ItemKind,
} from "../item-kind";

const REPO = path.resolve(import.meta.dirname, "../..");

// ── K1 — the four rules, each from its own field ────────────────────────────────────────────────

test("K1 rule 1 — a row naming a real booking is `included`", () => {
  assert.equal(itemKind({ bookingId: "bk_1" }), "included");
});

test("K1 rule 2 — a row naming a platform listing is `bookable_separately`", () => {
  assert.equal(itemKind({ providerServiceId: "svc_1" }), "bookable_separately");
});

test("K1 rule 3 — a row naming an affiliate product is `external`", () => {
  assert.equal(itemKind({ affiliateProductId: "aff_1" }), "external");
});

test("K1 rule 4 — a row naming nothing is `recommended`, the honest weakest claim", () => {
  assert.equal(itemKind({}), "recommended");
});

test("K1 — the derivation is TOTAL: there is no fifth answer and no `unknown`", () => {
  assert.deepEqual([...ITEM_KINDS].sort(), [
    "bookable_separately",
    "external",
    "included",
    "recommended",
  ]);
});

// ── K2 — PRECEDENCE, on rows that name more than one thing ──────────────────────────────────────

test("K2 — a BOOKED row is `included` even when it also names a listing (rule 1 wins)", () => {
  assert.equal(itemKind({ bookingId: "bk_1", providerServiceId: "svc_1" }), "included");
});

test("K2 — a BOOKED row is `included` even when it also names a partner product", () => {
  assert.equal(itemKind({ bookingId: "bk_1", affiliateProductId: "aff_1" }), "included");
});

test("K2 — a listing link OUTRANKS a partner grounding: the platform can charge for it", () => {
  assert.equal(
    itemKind({ providerServiceId: "svc_1", affiliateProductId: "aff_1" }),
    "bookable_separately",
  );
});

test("K2 — all three at once still resolves by the stated order", () => {
  assert.equal(
    itemKind({ bookingId: "bk_1", providerServiceId: "svc_1", affiliateProductId: "aff_1" }),
    "included",
  );
});

test("K2 — the booked test reads the BOOKING key, never a routing status", () => {
  // ROUTING_STATE_CONTRACT §2: presence of a booking is the booked state, never inferred from
  // `routing_status` alone — a row can hold `purchased` with no booking behind it (the §15b
  // unauthorized-claim window), and that row must NOT read as bought.
  const asAnyRow = { routingStatus: "purchased", providerServiceId: "svc_1" } as Record<string, unknown>;
  assert.equal(itemKind(asAnyRow), "bookable_separately");
});

// ── K3 — a blank id is not a link ───────────────────────────────────────────────────────────────

for (const blank of [null, undefined, "", "   "] as const) {
  test(`K3 — ${JSON.stringify(blank)} in every link field means "names none"`, () => {
    assert.equal(
      itemKind({ bookingId: blank, providerServiceId: blank, affiliateProductId: blank }),
      "recommended",
    );
  });
}

test("K3 — a blank listing id does not mask a real partner grounding", () => {
  assert.equal(itemKind({ providerServiceId: "  ", affiliateProductId: "aff_1" }), "external");
});

// ── K4 — the ONE label map ──────────────────────────────────────────────────────────────────────

test("K4 — the map is total over the four kinds and every label is distinct", () => {
  const labels = ITEM_KINDS.map((k) => {
    const chip = itemKindChip(k);
    assert.ok(chip, `${k} has a chip`);
    assert.equal(chip!.kind, k);
    assert.ok(chip!.label.trim().length > 0, `${k} has a label`);
    assert.ok(chip!.blurb.trim().length > 0, `${k} has a blurb`);
    return chip!.label;
  });
  assert.equal(new Set(labels).size, ITEM_KINDS.length, "four distinct words");
});

test("K4 — anything outside the four returns no chip (a Map, so no prototype walk)", () => {
  for (const bad of ["constructor", "__proto__", "toString", "booked", "", null, undefined]) {
    assert.equal(itemKindChip(bad as string), null, `${String(bad)} yields no chip`);
  }
});

test("K4 — `platformPriced` is true for exactly the two kinds the platform can price", () => {
  const priced = ITEM_KINDS.filter((k) => itemKindChip(k)!.platformPriced);
  assert.deepEqual([...priced].sort(), ["bookable_separately", "included"]);
});

test("K4 — itemKindChipFor derives and labels in one step and never returns null", () => {
  assert.equal(itemKindChipFor({ providerServiceId: "svc_1" }).kind, "bookable_separately");
  assert.equal(itemKindChipFor({}).kind, "recommended");
});

// ── K5 — the authoring contract ─────────────────────────────────────────────────────────────────

test("K5 — a priced item that names NOTHING is refused, with the rule in the sentence", () => {
  const refusal = authoredItemPriceRefusal({ estimatedCost: "120.00" });
  assert.equal(refusal, AUTHORED_PRICED_UNLINKED_REFUSAL);
  assert.match(refusal!, /price/i);
  assert.match(refusal!, /listing|service/i);
});

test("K5 — a priced PARTNER item is refused too: we cannot charge for it either", () => {
  assert.equal(
    authoredItemPriceRefusal({ estimatedCost: 90, affiliateProductId: "aff_1" }),
    AUTHORED_PRICED_UNLINKED_REFUSAL,
  );
});

test("K5 — a priced item that names a platform listing is ALLOWED", () => {
  assert.equal(authoredItemPriceRefusal({ estimatedCost: "120.00", providerServiceId: "svc_1" }), null);
});

test("K5 — a priced item already backed by a booking is ALLOWED", () => {
  assert.equal(authoredItemPriceRefusal({ estimatedCost: "120.00", bookingId: "bk_1" }), null);
});

for (const noPrice of [null, undefined, "", "0", "0.00", 0, "not-a-number"] as const) {
  test(`K5 — ${JSON.stringify(noPrice)} is NOT a stated price, so an unlinked item is allowed`, () => {
    // §13: NULL means "never answered", and a zero is the author saying the item costs nothing —
    // a true thing to say about a recommendation. Only a value above zero is a charge claim.
    assert.equal(authoredItemPriceRefusal({ estimatedCost: noPrice }), null);
  });
}

test("K5 — a NEGATIVE price is not a stated price either", () => {
  assert.equal(authoredItemPriceRefusal({ estimatedCost: "-10" }), null);
});

test("K5 — INDISTINGUISHABLE INPUT TAKES THE WEAKER CLAIM, never a fabricated one", () => {
  // A caller whose projection carries none of the three columns (an old DTO, a partial row) is
  // answered `recommended` — "we cannot see a link" is reported as "there is none to see", which
  // is the weaker statement and the one that hides a price rather than promising a booking (§13).
  const partial = { title: "Coffee at Weekenders" } as Record<string, unknown>;
  assert.equal(itemKind(partial), "recommended");
  assert.equal(itemKindChipFor(partial).platformPriced, false);
});

// ── K6 — the wiring, and no second copy of the labels ───────────────────────────────────────────

test("K6 — BOTH ready-made author build rails call the ONE predicate", () => {
  for (const rel of ["server/routes.ts", "server/routes/trips.routes.ts"]) {
    const src = readFileSync(path.join(REPO, rel), "utf8");
    assert.ok(
      src.includes('from "@shared/item-kind"'),
      `${rel} imports the one item-kind module`,
    );
    assert.ok(
      src.includes("authoredItemPriceRefusal("),
      `${rel} calls the one authoring-contract predicate rather than re-typing the rule`,
    );
  }
});

test("K6 — no file outside shared/item-kind.ts carries a SECOND kind→label map (§18 rule 1)", () => {
  // The signature of a second map is one file holding ALL FOUR of the map's words. The individual
  // words ("recommended", "included") are ordinary English and appear all over the repo in
  // unrelated copy, so a per-word sweep would be noise; the FOUR TOGETHER are the drift.
  const labels = ITEM_KINDS.map((k) => itemKindChip(k)!.label);
  const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const rel = path.relative(REPO, full);
      if (rel === "shared/item-kind.ts" || rel.includes("__tests__")) continue;
      const src = readFileSync(full, "utf8");
      if (labels.every((label) => src.includes(`"${label}"`) || src.includes(`'${label}'`) || src.includes(`>${label}<`))) {
        offenders.push(rel);
      }
    }
  };
  for (const root of ["client/src", "server", "shared"]) walk(path.join(REPO, root));
  assert.deepEqual(
    offenders,
    [],
    "a second table of the kind labels is the derivation-drift class; render itemKindChip()'s value instead",
  );
});

// ── K7 — the migration-295 links are `recommended`, and no rule was written for them ───────────
// Ruling 2026-09-15, punchlist D-16 (b)/(c); ledger `2026-09-15-d16-plan-holds-venues-and-content`.
// `itinerary_items` gained `custom_venue_id` (the traveler's OWN venue) and
// `content_type`/`content_id` (a Discover gem / hotel / activity). Neither names anything the
// platform can charge for — checkout skips an item with no service on both loops — so rule 4
// already answers them and this pins that the silence is DELIBERATE: a fifth rule, or a branch in
// a component, would be a second "what kind of item is this?" expression (§18 rule 1).

test("K7 — an item naming only a CUSTOM VENUE is `recommended`, and carries no platform price", () => {
  const row = { customVenueId: "venue_1", title: "Nonna's terrace" } as Record<string, unknown>;
  assert.equal(itemKind(row), "recommended");
  assert.equal(itemKindChipFor(row).platformPriced, false);
});

test("K7 — an item naming only DISCOVER CONTENT is `recommended`, and carries no platform price", () => {
  const row = { contentType: "gem", contentId: "gem_42" } as Record<string, unknown>;
  assert.equal(itemKind(row), "recommended");
  assert.equal(itemKindChipFor(row).platformPriced, false);
});

test("K7 — NEITHER link outranks a real listing or a real booking", () => {
  // The precedence is unchanged: a row that somehow named both is still judged by the fact
  // checkout can act on. A venue or a content id never downgrades a bookable item.
  assert.equal(
    itemKind({ providerServiceId: "svc_1", customVenueId: "venue_1" } as Record<string, unknown>),
    "bookable_separately",
  );
  assert.equal(
    itemKind({ bookingId: "bk_1", contentType: "hotel", contentId: "h_9" } as Record<string, unknown>),
    "included",
  );
});

test("K7 — the derivation READS neither column: a venue/content item is judged only by the three", () => {
  // The guarantee behind K7's first two proofs — they pass because the three id fields are absent,
  // not because the new columns were taught to mean anything. `ItemKindInput` deliberately does
  // not carry them (shared/item-kind.ts), so a caller cannot believe they are read.
  const src = readFileSync(path.join(REPO, "shared/item-kind.ts"), "utf8");
  const fn = src.slice(src.indexOf("export function itemKind("), src.indexOf("export type ItemKindTone"));
  for (const column of ["customVenueId", "contentType", "contentId"]) {
    assert.ok(
      !fn.includes(column),
      `${column} must not appear in the derivation — it is not one of the three facts it reads`,
    );
  }
});
