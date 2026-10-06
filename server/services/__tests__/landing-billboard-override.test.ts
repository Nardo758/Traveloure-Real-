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
import {
  resolveBillboardDispatch,
  pickRotatedSlotOne,
  resolveBillboardOverrides,
  isBillboardLiveOwner,
  type BillboardDispatchDeps,
  type BillboardOverrideDeps,
  type BillboardSliceReadyCandidate,
} from "../landing-billboard.service";
import {
  assignBillboardOverrides,
  listingLines,
  type BillboardDispatchSlot,
  type BillboardListing,
} from "@shared/landing-billboard-override";
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

function dispatchDeps(over: {
  eligible: Set<string>;
  listingsFor?: Record<string, BillboardListing[]>;
  gate?: BillboardOverrideDeps["gate"];
  gems?: BillboardDispatchDeps["gems"];
  sliceReadyListings?: BillboardDispatchDeps["sliceReadyListings"];
  verifiedLocals?: BillboardDispatchDeps["verifiedLocals"];
}): BillboardDispatchDeps {
  const base = deps({
    eligible: over.eligible,
    listingsFor: over.listingsFor ?? { expert: [listing("expert-listing")] },
  });
  return {
    ...base,
    gate: over.gate ?? base.gate,
    creditedMarkets: async () => new Set(["kyoto"]),
    gems: over.gems ?? (async () => []),
    sliceReadyListings: over.sliceReadyListings ?? (async () => []),
    // Every fixture curator and owner is a verified local unless a test says otherwise; the R343
    // gate itself is proven against a database in billboard-verified-locals.db.test.ts VL4.
    verifiedLocals: over.verifiedLocals ?? (async () => ["curator", "unqualified-curator", "slice-owner"]),
  };
}

function sliceCandidate(overrides: Partial<BillboardSliceReadyCandidate> = {}): BillboardSliceReadyCandidate {
  return {
    id: "slice",
    city: "Kyoto",
    handle: "slice-expert",
    listing: listing("slice", "A Kyoto walk"),
    ownerUserId: "slice-owner",
    latitude: "35.01",
    longitude: "135.76",
    cancellationPolicyType: "flexible",
    action: {
      primary: { kind: "book", label: "Book" },
      ask: ["slot"],
      landing: { store: "checkout", timed: true, placeAnchored: true, forksFinal: false },
    },
    nextOpenSlot: { date: "2099-01-01", startTime: "09:00" },
    ...overrides,
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

describe("billboard slot-type dispatch", () => {
  it("never treats reserved test accounts or non-earner accounts as live owners", () => {
    assert.equal(isBillboardLiveOwner("local_expert", "real@example.com"), true);
    assert.equal(isBillboardLiveOwner("local_expert", "landing-hero-demo-kyoto@traveloure.test"), false);
    assert.equal(isBillboardLiveOwner("user", "former-test@traveloure.test"), false);
  });

  it("rotates slot 1 daily ONLY among markets that can fill it for real", () => {
    const o = (marketKey: string, handle: string) => ({
      tileKey: "weekend-away", marketKey, handle, roleLabel: "Local expert", listing: listing(`${handle}-listing`),
    });
    const qualifying = [o("kyoto", "a"), o("kyoto", "b"), o("lisbon", "c")];
    const DAY = 86_400_000;
    const picks = [0, 1, 2, 3].map((d) => pickRotatedSlotOne(qualifying, new Date(d * DAY))!.marketKey);
    assert.deepEqual(picks, ["kyoto", "lisbon", "kyoto", "lisbon"], "one market per UTC day, alternating");
    assert.equal(pickRotatedSlotOne(qualifying, new Date(0))!.handle, "a", "that market's first qualifying expert");
    assert.equal(pickRotatedSlotOne([], new Date()), null, "no qualifying market ⇒ nothing anchored");
    assert.equal(pickRotatedSlotOne([o("goa", "d")], new Date(5 * DAY))!.marketKey, "goa", "a single market is picked every day");
  });

  it("never anchors on a market whose tiles carry no credited photo, whatever the day", async () => {
    for (const day of [0, 1, 2, 3]) {
      const result = await resolveBillboardDispatch({
        ...dispatchDeps({ eligible: new Set(["expert"]) }),
        now: () => new Date(day * 86_400_000),
      });
      const market = result.marketSelection.market?.key ?? null;
      assert.ok(market === null || market === "kyoto", `day ${day}: only a credited market (kyoto) is selected`);
    }
  });

  it("keeps the shared dispatch as a discriminated slot union without changing legacy override assignment", () => {
    const slot: BillboardDispatchSlot = {
      slot: 1,
      marketKey: "kyoto",
      override: {
        tileKey: "weekend-away",
        marketKey: "kyoto",
        handle: "expert",
        roleLabel: "Local expert",
        listing: listing("expert-listing"),
      },
    };
    assert.equal(slot.slot, 1);
    assert.equal(assignBillboardOverrides(BILLBOARD_TILES, new Map()).length, 0);
  });

  it("uses the expert's own gem score, omits uncredited gem media, and lets slot 3 fail independently", async () => {
    const result = await resolveBillboardDispatch(dispatchDeps({
      eligible: new Set(["expert", "curator"]),
      gems: async () => [{
        id: "gem-1",
        city: "Kyoto",
        name: "Market Gem",
        score: 87,
        curatorExpertId: "curator",
        curatorHandle: "curator-handle",
        image: { url: "https://example.test/gem.jpg", attribution: "  " },
      }],
    }));
    assert.deepEqual(result.marketSelection.slots.map((slot) => slot.slot), [1, 2]);
    const gemSlot = result.marketSelection.slots.find((slot) => slot.slot === 2);
    assert.ok(gemSlot && gemSlot.slot === 2);
    assert.deepEqual(gemSlot.gem, { id: "gem-1", name: "Market Gem", score: 87 });
  });

  it("refuses a gem without same-market expert byline eligibility but admits a qualified slice-ready listing", async () => {
    const result = await resolveBillboardDispatch(dispatchDeps({
      eligible: new Set(["expert"]),
      gems: async () => [{
        id: "gem-1",
        city: "Kyoto",
        name: "Market Gem",
        score: 87,
        curatorExpertId: "unqualified-curator",
        curatorHandle: "curator-handle",
      }],
      sliceReadyListings: async () => [sliceCandidate()],
    }));
    assert.deepEqual(result.marketSelection.slots.map((slot) => slot.slot), [1, 3]);
    assert.equal(result.marketSelection.market?.key, "kyoto");
  });

  it("asks the existing byline gate about the gem curator in the gem's resolved market", async () => {
    const gateCalls: Array<[string, string]> = [];
    const result = await resolveBillboardDispatch(dispatchDeps({
      eligible: new Set(["expert", "curator"]),
      gate: async (id, market) => {
        gateCalls.push([id, market]);
        return { eligible: market === "kyoto" };
      },
      gems: async () => [{
        id: "gem-1",
        city: "Kyoto",
        name: "Market Gem",
        score: 74,
        curatorExpertId: "curator",
        curatorHandle: "curator-handle",
      }],
    }));
    assert.ok(gateCalls.some(([id, market]) => id === "curator" && market === "kyoto"));
    assert.ok(result.marketSelection.slots.some((slot) => slot.slot === 2));
  });

  it("contains a slot-2 reader failure and still resolves slot 1 and slot 3", async () => {
    const result = await resolveBillboardDispatch(dispatchDeps({
      eligible: new Set(["expert"]),
      gems: async () => { throw new Error("gem read failed"); },
      sliceReadyListings: async () => [sliceCandidate()],
    }));
    assert.deepEqual(result.marketSelection.slots.map((slot) => slot.slot), [1, 3]);
  });

  it("contains a slot-3 reader failure and still resolves slot 1 and slot 2", async () => {
    const result = await resolveBillboardDispatch(dispatchDeps({
      eligible: new Set(["expert", "curator"]),
      gems: async () => [{
        id: "gem-1",
        city: "Kyoto",
        name: "Market Gem",
        score: 81,
        curatorExpertId: "curator",
        curatorHandle: "curator-handle",
      }],
      sliceReadyListings: async () => { throw new Error("slice listing read failed"); },
    }));
    assert.deepEqual(result.marketSelection.slots.map((slot) => slot.slot), [1, 2]);
  });

  it("refuses slot 3 unless every public listing, location, price, policy, action, and open-slot gate passes", async () => {
    const refusals: Partial<BillboardSliceReadyCandidate>[] = [
      { handle: "" },
      { latitude: null },
      { listing: { ...listing("free"), price: null } },
      { listing: { ...listing("hidden"), showPrice: false } },
      { cancellationPolicyType: null },
      { action: null },
      { action: { ...sliceCandidate().action!, primary: { kind: "request_to_book", label: "Request" } } },
      { nextOpenSlot: null },
    ];
    for (const refusal of refusals) {
      const result = await resolveBillboardDispatch(dispatchDeps({
        eligible: new Set(["expert"]),
        sliceReadyListings: async () => [sliceCandidate(refusal)],
      }));
      assert.deepEqual(result.marketSelection.slots.map((slot) => slot.slot), [1], `refused ${Object.keys(refusal).join(",")}`);
    }
  });

  it("does not select or force a market when there is no real slot-1 expert", async () => {
    let readOptionalSlots = false;
    const result = await resolveBillboardDispatch(dispatchDeps({
      eligible: new Set(),
      listingsFor: { blocked: [listing("blocked")] },
      gems: async () => { readOptionalSlots = true; return []; },
      sliceReadyListings: async () => { readOptionalSlots = true; return [sliceCandidate()]; },
    }));
    assert.equal(result.marketSelection.market, null);
    assert.deepEqual(result.marketSelection.slots, []);
    assert.equal(readOptionalSlots, false);
    assert.match(result.marketSelection.constraint, /Kyoto-only/);
  });
});

describe("listing lines", () => {
  it("L1 short description, else first line of the description, else nothing", () => {
    assert.deepEqual(listingLines("Short.", "Long\nmore"), ["Short."]);
    assert.deepEqual(listingLines(null, "\n  First line \nsecond"), ["First line"]);
    assert.deepEqual(listingLines("  ", null), []);
  });
});
