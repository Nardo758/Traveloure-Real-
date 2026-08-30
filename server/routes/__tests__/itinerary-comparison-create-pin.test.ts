/**
 * The live POST /api/itinerary-comparisons pin rail.
 *
 * The routes monolith cannot be imported as an isolated Express router, so this test combines:
 *  - a registration-order contract proving which exact POST handler is live;
 *  - direct execution of the shared request-to-optimizer resolver; and
 *  - a source contract proving the live handler forwards that resolved value as the optimizer's
 *    final pinned-anchor argument.
 *
 * Run with:
 *   npx tsx --test server/routes/__tests__/itinerary-comparison-create-pin.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";

const { resolveOptimizerPinnedAnchor } = await import(
  "../../services/anchor-candidates.js"
);

const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routes.ts"),
  "utf8",
);
const tripsRoutesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routes/trips.routes.ts"),
  "utf8",
);

function exactCreateRegistrations(source: string): RegExpMatchArray[] {
  return [
    ...source.matchAll(
      /\b(?:app|router)\.post\(\s*["']\/api\/itinerary-comparisons["']/g,
    ),
  ];
}

function liveCreateHandlerSource(): string {
  const start = routesSource.indexOf(
    'app.post("/api/itinerary-comparisons", isAuthenticated',
  );
  const end = routesSource.indexOf(
    'app.get("/api/dashboard/trip-scores"',
    start,
  );
  assert.ok(start >= 0 && end > start, "could not isolate the live create handler");
  return routesSource.slice(start, end);
}

describe("POST /api/itinerary-comparisons — pinned anchor", () => {
  it("resolves a supplied pin and preserves undefined as optimizer auto mode", async () => {
    const resolved = {
      id: "hotel-1",
      type: "hotel" as const,
      name: "Higashiyama Lantern Hotel",
      lat: 35.003,
      lng: 135.778,
      medianMeters: 1120,
      locatedStops: 2,
      totalStops: 2,
      within15MinCount: 1,
      walkingMinutes: 14,
    };
    let resolverCalls = 0;

    const pinned = await resolveOptimizerPinnedAnchor(
      { type: "hotel", id: "hotel-1", name: "Client label is not authoritative" },
      [
        {
          id: "stop-1",
          name: "Temple",
          latitude: "35.004",
          longitude: 135.779,
        },
      ],
      async (input, stops) => {
        resolverCalls += 1;
        assert.deepEqual(input, {
          type: "hotel",
          id: "hotel-1",
          name: "Client label is not authoritative",
          lat: undefined,
          lng: undefined,
        });
        assert.deepEqual(stops, [
          {
            id: "stop-1",
            name: "Temple",
            lat: 35.004,
            lng: 135.779,
          },
        ]);
        return resolved;
      },
    );

    assert.equal(pinned, resolved, "the optimizer must receive the resolved server anchor");
    assert.equal(resolverCalls, 1);

    const automatic = await resolveOptimizerPinnedAnchor(
      undefined,
      [],
      async () => {
        assert.fail("missing pinnedAnchor must not invoke catalog resolution");
      },
    );
    assert.equal(automatic, undefined, "omitting pinnedAnchor must preserve auto-anchor mode");
  });

  it("proves the monolith handler is live and forwards the shared result", () => {
    assert.equal(
      exactCreateRegistrations(routesSource).length,
      1,
      "routes.ts must register one exact create POST",
    );
    assert.equal(
      exactCreateRegistrations(tripsRoutesSource).length,
      0,
      "the last-mounted trips router must not reintroduce a shadow create POST",
    );

    const createRegistration = routesSource.indexOf(
      'app.post("/api/itinerary-comparisons", isAuthenticated',
    );
    const tripsRouterMount = routesSource.indexOf("app.use(tripsRoutes);");
    assert.ok(
      createRegistration >= 0 &&
        tripsRouterMount > createRegistration,
      "the live monolith create POST must register before the trips router mount",
    );

    const handler = liveCreateHandlerSource();
    assert.match(
      handler,
      /pinnedAnchor:\s*rawPinnedAnchor/,
      "the live handler must read only the pinnedAnchor request field",
    );
    assert.match(
      handler,
      /const resolvedPinnedAnchor = await resolveOptimizerPinnedAnchor\(\s*rawPinnedAnchor,\s*baselineItems,\s*\);/,
      "the live handler must use the shared parse-and-resolve rail",
    );
    assert.match(
      handler,
      /tripPreferencesForCreate,\s*fixedCommitments,\s*resolvedPinnedAnchor,\s*\)/,
      "the resolved pin must be the optimizer's final argument",
    );
  });
});