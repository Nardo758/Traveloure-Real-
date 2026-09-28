/**
 * Billboard override — only a byline-gated expert's live listing takes a tile (follow-up 4, ledger
 * `2026-09-28-billboard-override-listing`). Pure: the gate, the candidates and the storefront read
 * are injected, so this proves the RULE without a database.
 *
 * O1 an expert who fails the byline gate takes no tile, whatever listings they have — and their
 *    storefront is never even read.
 * O2 a gated expert's listing takes a tile; tiles with nothing left stay curated (not in the result).
 * O3 per market and per tile: listings are dealt round-robin across qualified experts, one distinct
 *    listing per tile, in tile order.
 * O4 an expert who passes the gate but has no listing in the market takes nothing.
 * O5 the default wiring asks the ONE byline gate and the public storefront read — never a copy.
 * L1 a listing's own lines: its short description, else the first line of its description, else none.
 *
 * Run: npx tsx --test server/services/__tests__/landing-billboard-override.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBillboardOverrides, type BillboardOverrideDeps } from "../landing-billboard.service";
import { assignBillboardOverrides, listingLines, type BillboardListing } from "@shared/landing-billboard-override";
import { BILLBOARD_TILES } from "@shared/landing-billboard";

function listing(id: string, title = id): BillboardListing {
  return { id, title, lines: [], price: "50", priceType: "fixed", pricingUnit: null, showPrice: true, imageUrl: null };
}

function deps(over: Partial<BillboardOverrideDeps> & { eligible: Set<string>; listingsFor: Record<string, BillboardListing[]> }): BillboardOverrideDeps & { qualified: string[] } {
  const qualified: string[] = [];
  return {
    qualified,
    candidates: over.candidates ?? (async (m) => (m === "kyoto" ? Object.keys(over.listingsFor).sort() : [])),
    gate: async (id) => ({ eligible: over.eligible.has(id) }),
    qualify: async (id) => {
      qualified.push(id);
      const l = over.listingsFor[id] ?? [];
      return { handle: `h-${id}`, roleLabel: "Local expert", listings: l };
    },
  };
}

describe("billboard override", () => {
  it("O1 an expert who fails the byline gate takes no tile, and is never read", async () => {
    const d = deps({ eligible: new Set(), listingsFor: { a: [listing("a1"), listing("a2"), listing("a3")] } });
    assert.deepEqual(await resolveBillboardOverrides(d), []);
    assert.deepEqual(d.qualified, [], "a failed gate stops before the storefront read");
  });

  it("O2 a gated expert's listing takes a tile; the rest stay curated", async () => {
    const d = deps({ eligible: new Set(["a"]), listingsFor: { a: [listing("a1")], b: [listing("b1")] } });
    const out = await resolveBillboardOverrides(d);
    assert.equal(out.length, 1);
    assert.equal(out[0].handle, "h-a");
    assert.equal(out[0].listing.id, "a1");
    assert.equal(out[0].tileKey, BILLBOARD_TILES.filter((t) => t.marketKey === "kyoto")[0].key, "the first tile, in order");
    assert.ok(!out.some((o) => o.handle === "h-b"), "the ungated expert's listing never appears");
  });

  it("O3 per tile, round-robin across qualified experts, distinct listings", () => {
    const tiles = [
      { key: "t1", marketKey: "kyoto" },
      { key: "t2", marketKey: "kyoto" },
      { key: "t3", marketKey: "kyoto" },
      { key: "p1", marketKey: "porto" },
    ];
    const out = assignBillboardOverrides(
      tiles,
      new Map([
        ["kyoto", [
          { handle: "a", roleLabel: "Local expert" as const, listings: [listing("a1"), listing("a2")] },
          { handle: "b", roleLabel: "Local expert" as const, listings: [listing("b1")] },
        ]],
      ]),
    );
    assert.deepEqual(out.map((o) => [o.tileKey, o.handle, o.listing.id]), [["t1", "a", "a1"], ["t2", "b", "b1"], ["t3", "a", "a2"]]);
    assert.ok(!out.some((o) => o.marketKey === "porto"), "a market with no qualified expert stays curated");
  });

  it("O4 a gated expert with no listing in the market takes nothing", async () => {
    const d = deps({ eligible: new Set(["a"]), listingsFor: { a: [] } });
    assert.deepEqual(await resolveBillboardOverrides(d), []);
  });

  it("O5 the default wiring asks the one byline gate and the public storefront read", () => {
    const src = readFileSync(join(process.cwd(), "server/services/landing-billboard.service.ts"), "utf8");
    assert.match(src, /gate: checkBylineEligibility/, "the gate is checkBylineEligibility itself");
    assert.match(src, /loadStorefront\(handle\)/, "listings come from the public storefront read");
    assert.match(src, /eq\(providerServices\.approvalStatus, "approved"\)[\s\S]*eq\(providerServices\.status, "active"\)/, "the text read keeps the public gate");
    assert.doesNotMatch(src, /\bid:\s*expertId|userId:/, "no user id leaves the service");
  });
});

describe("listing lines", () => {
  it("L1 short description, else first line of the description, else nothing", () => {
    assert.deepEqual(listingLines("Short.", "Long\nmore"), ["Short."]);
    assert.deepEqual(listingLines(null, "\n  First line \nsecond"), ["First line"]);
    assert.deepEqual(listingLines("  ", null), []);
  });
});
