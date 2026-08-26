import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBentoTiles } from "../discover-location";
import type { FeedItem } from "../../lib/feed-stream";

function tagged(item: FeedItem, order: number) {
  return { item, order };
}

const pkg = (id: string, price: string): FeedItem => ({ kind: "package", id, data: { price } });
const service = (id: string, price: string): FeedItem => ({ kind: "vendor-service", id, data: { price } });
const gem = (id: string): FeedItem => ({ kind: "loose-gem", id, data: {} });
const localExpert = (id: string, neighbourhoodSlug: string): FeedItem => ({
  kind: "expert",
  id,
  data: { role: "local_expert", expertForm: { neighborhoods: [neighbourhoodSlug] } },
});

describe("buildBentoTiles — §3.2 ready-made float + §8 explicit-sort gate", () => {
  it("§3.2: under the default (recommended) order, the first ready-made floats to the leading slot when there is no anchor", () => {
    const run = [tagged(gem("gem-1"), 0), tagged(pkg("pkg-1", "149"), 1)];
    const placed = buildBentoTiles(run, true, null, "Kyoto");

    assert.equal(placed[0].item.id, "pkg-1");
  });

  it("§8: an explicit sort (floatAnchor=false) leaves a ready-made in its sorted position — it is never pulled to the front", () => {
    // Already price-sorted by the caller (sortTaggedRunByPrice): cheapest first.
    // A buggy "find the first package and float it" step would reorder this to
    // [pkg-1, svc-cheap, gem-1], silently overriding the user's price sort.
    const run = [
      tagged(service("svc-cheap", "10"), 5),
      tagged(pkg("pkg-1", "149"), 1),
      tagged(gem("gem-1"), 0),
    ];
    const placed = buildBentoTiles(run, false, null, "Kyoto");

    assert.deepEqual(
      placed.map((p) => p.item.id),
      ["svc-cheap", "pkg-1", "gem-1"],
    );
  });

  it("§8: an explicit sort also disables the expert anchor float — the eligible expert stays in its sorted position as a plain tile", () => {
    const neighbourhood = { slug: "testnb" };
    const run = [
      tagged(service("svc-a", "10"), 2),
      tagged(localExpert("exp-1", "testnb"), 0),
      tagged(gem("gem-1"), 1),
    ];

    const sorted = buildBentoTiles(run, false, neighbourhood, "Kyoto");
    assert.deepEqual(
      sorted.map((p) => p.item.id),
      ["svc-a", "exp-1", "gem-1"],
    );
    assert.equal(
      sorted.find((p) => p.item.id === "exp-1")!.isAnchor,
      false,
    );

    // Contrast: the same run under the default order DOES float the eligible
    // expert to the anchor slot — proving the two flags remain distinguishable.
    const recommended = buildBentoTiles(run, true, neighbourhood, "Kyoto");
    assert.equal(recommended[0].item.id, "exp-1");
    assert.equal(recommended[0].isAnchor, true);
  });
});
