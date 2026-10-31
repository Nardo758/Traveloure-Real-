/**
 * An unstocked neighbourhood stays on the city feed, in neighbourhood order,
 * and does not move the filler that belongs to stocked sections.
 *
 * Run: npx tsx --test client/src/lib/__tests__/feed-stream-empty-neighbourhood.test.ts
 */
import { tileActionLabel } from "../bento-action-state";
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildFeedStream,
  neighbourhoodIsUnstocked,
  neighbourhoodSectionNeedsWantedTile,
  neighbourhoodWantedBody,
  NEIGHBOURHOOD_WANTED_HREF,
  placeUnstockedNeighbourhoods,
  withoutUnstockedNeighbourhoods,
  type FeedItem,
} from "../feed-stream";

const services = [
  { id: "s1", serviceName: "Tea" },
  { id: "s2", serviceName: "Walk" },
  { id: "s3", serviceName: "Craft" },
];

function neighbourhood(over: Record<string, unknown> = {}) {
  return {
    id: "ohara",
    slug: "ohara",
    name: "Ohara",
    gems: [] as unknown[],
    gemCount: 0,
    serviceCount: 0,
    localExpert: null,
    ...over,
  };
}

function gemNeighbourhood(id: string, name: string) {
  return neighbourhood({
    id,
    slug: id,
    name,
    gemCount: 1,
    gems: [{ id: `gem-${id}`, placeName: name, neighborhood: id }],
  });
}

function marker(id: string, data: Record<string, unknown>): FeedItem {
  return { kind: "neighborhood", id, data };
}

function item(kind: FeedItem["kind"], id: string): FeedItem {
  return { kind, id, data: {} };
}

const neighbourhoodIds = (stream: FeedItem[]) =>
  stream.filter((entry) => entry.kind === "neighborhood").map((entry) => entry.id);

describe("empty neighbourhoods stay in the city feed", () => {
  it("E1: an empty neighbourhood keeps its place and does not move stocked filler or gems", () => {
    const gion = gemNeighbourhood("gion", "Gion");
    const ohara = neighbourhood();
    const ara = gemNeighbourhood("ara", "Arashiyama");
    const withEmpty = buildFeedStream([gion, ohara, ara], [], [], [], [], [], services);
    const stockedOnly = buildFeedStream([gion, ara], [], [], [], [], [], services);

    assert.deepStrictEqual(neighbourhoodIds(withEmpty), [
      "neighborhood-gion",
      "neighborhood-ohara",
      "neighborhood-ara",
    ]);
    assert.deepStrictEqual(withoutUnstockedNeighbourhoods(withEmpty), stockedOnly);

    const gionItem = withEmpty.find((entry) => entry.id === "neighborhood-gion");
    assert.ok(gionItem);
    assert.equal(gionItem.data.gems.length, 1);
    assert.equal(gionItem.data.gems[0].id, "gem-gion");
    const oharaItem = withEmpty.find((entry) => entry.id === "neighborhood-ohara");
    assert.ok(oharaItem);
    assert.equal(neighbourhoodIsUnstocked(oharaItem.data), true);
    const gionAt = withEmpty.findIndex((entry) => entry.id === "neighborhood-gion");
    const oharaAt = withEmpty.findIndex((entry) => entry.id === "neighborhood-ohara");
    const araAt = withEmpty.findIndex((entry) => entry.id === "neighborhood-ara");
    assert.ok(gionAt < oharaAt && oharaAt < araAt);
  });

  it("E2: services, a local expert, a ready-made, packages or a gem count stock the neighbourhood", () => {
    const cases = [
      neighbourhood({ id: "by-count", slug: "by-count", serviceCount: 2 }),
      neighbourhood({ id: "by-list", slug: "by-list", services: [{ id: "svc" }] }),
      neighbourhood({ id: "by-expert", slug: "by-expert", localExpert: { id: "exp-1" } }),
      neighbourhood({ id: "by-ready", slug: "by-ready", readyMade: { id: "trip-1" } }),
      neighbourhood({ id: "by-packages", slug: "by-packages", packages: [{ id: "pkg-1" }] }),
      neighbourhood({ id: "by-gems", slug: "by-gems", gemCount: 3 }),
    ];
    for (const record of cases) {
      assert.equal(neighbourhoodIsUnstocked(record), false, String(record.id));
      const stream = buildFeedStream([record], [], [], [], [], [], []);
      assert.deepStrictEqual(neighbourhoodIds(stream), [`neighborhood-${record.id}`]);
      assert.equal(
        neighbourhoodIsUnstocked(stream.find((entry) => entry.kind === "neighborhood")?.data),
        false,
      );
    }
  });

  it("E3: gems grouped by slug stock a neighbourhood whose own gems array is empty", () => {
    const record = neighbourhood({ id: "fallback", slug: "fallback", name: "Fallback" });
    const stream = buildFeedStream(
      [record],
      [{ id: "loose-1", placeName: "Temple", neighborhood: "fallback" }],
      [],
      [],
      [],
      [],
      [],
    );
    const section = stream.find((entry) => entry.id === "neighborhood-fallback");
    assert.ok(section);
    assert.equal(neighbourhoodIsUnstocked(section.data), false);
    assert.equal(section.data.gems.length, 1);
    assert.equal(section.data.gems[0].id, "loose-1");
    assert.equal(section.data.gemCount, 1);
  });

  it("E4: the Wanted tile copy is the marketing sentence, its button reads Apply and links to /earn", () => {
    assert.equal(
      neighbourhoodWantedBody("Ohara"),
      "Know Ohara well? We're looking for local experts and providers here.",
    );
    // Row 302a: the button is the wanted tile's one action, "Apply", from tileActionLabel.
    assert.equal(tileActionLabel("wanted-slot"), "Apply");
    assert.equal(NEIGHBOURHOOD_WANTED_HREF, "/earn");
  });

  it("E5: the Wanted tile is for an unstocked run with no gem, service, expert or ready-made", () => {
    const empty = neighbourhood();
    const stocked = gemNeighbourhood("gion", "Gion");
    assert.equal(neighbourhoodSectionNeedsWantedTile(empty, []), true);
    assert.equal(neighbourhoodSectionNeedsWantedTile(stocked, []), false);
    assert.equal(neighbourhoodSectionNeedsWantedTile(null, []), false);
    for (const kind of ["recommendation", "wanted-slot", "earn-card", "external-stub"] as const) {
      assert.equal(
        neighbourhoodSectionNeedsWantedTile(empty, [{ kind }]),
        true,
        kind,
      );
    }
    for (const kind of ["loose-gem", "vendor-service", "expert", "lead-expert", "package"] as const) {
      assert.equal(
        neighbourhoodSectionNeedsWantedTile(empty, [{ kind }]),
        false,
        kind,
      );
    }
  });

  it("E6: a middle empty neighbourhood is inserted immediately before the next stocked one", () => {
    const stream = [
      item("loose-gem", "pre"),
      marker("neighborhood-gion", gemNeighbourhood("gion", "Gion")),
      item("vendor-service", "vsvc"),
      marker("neighborhood-ara", gemNeighbourhood("ara", "Arashiyama")),
    ];
    const ordered = [
      marker("neighborhood-gion", gemNeighbourhood("gion", "Gion")),
      marker("neighborhood-ohara", neighbourhood()),
      marker("neighborhood-ara", gemNeighbourhood("ara", "Arashiyama")),
    ];
    assert.deepStrictEqual(
      placeUnstockedNeighbourhoods(stream, ordered).map((entry) => entry.id),
      ["pre", "neighborhood-gion", "vsvc", "neighborhood-ohara", "neighborhood-ara"],
    );
  });

  it("E7: an empty neighbourhood leads, trails, or is left alone when it is already placed", () => {
    const gion = marker("neighborhood-gion", gemNeighbourhood("gion", "Gion"));
    const ara = marker("neighborhood-ara", gemNeighbourhood("ara", "Arashiyama"));
    const ohara = marker("neighborhood-ohara", neighbourhood());
    const kibune = marker("neighborhood-kibune", neighbourhood({ id: "kibune", slug: "kibune", name: "Kibune" }));
    const stocked = [item("loose-gem", "pre"), gion, item("vendor-service", "vsvc"), ara, item("vendor-service", "tail")];

    assert.deepStrictEqual(
      placeUnstockedNeighbourhoods(stocked, [ohara, gion, ara]).map((entry) => entry.id),
      ["pre", "neighborhood-ohara", "neighborhood-gion", "vsvc", "neighborhood-ara", "tail"],
    );
    assert.deepStrictEqual(
      placeUnstockedNeighbourhoods(stocked, [gion, ara, ohara]).map((entry) => entry.id),
      ["pre", "neighborhood-gion", "vsvc", "neighborhood-ara", "tail", "neighborhood-ohara"],
    );
    assert.deepStrictEqual(
      placeUnstockedNeighbourhoods([gion, ohara, ara], [gion, ohara, kibune, ara]).map((entry) => entry.id),
      ["neighborhood-gion", "neighborhood-ohara", "neighborhood-kibune", "neighborhood-ara"],
    );
  });

  it("E8: when every neighbourhood is unstocked, filler stays first and neighbourhood order is kept", () => {
    const ohara = neighbourhood();
    const kibune = neighbourhood({ id: "kibune", slug: "kibune", name: "Kibune" });
    const stream = buildFeedStream([ohara, kibune], [], [], [], [], [], services);
    const firstNeighbourhood = stream.findIndex((entry) => entry.kind === "neighborhood");
    assert.ok(firstNeighbourhood > 0);
    assert.ok(stream.slice(0, firstNeighbourhood).every((entry) => entry.kind === "vendor-service"));
    assert.deepStrictEqual(stream.slice(firstNeighbourhood).map((entry) => entry.id), [
      "neighborhood-ohara",
      "neighborhood-kibune",
    ]);
  });
});
