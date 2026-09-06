/**
 * GET /api/trips/:id/anchor-candidates — pre-create, read-only candidate rail.
 *
 * Run with:
 *   npx tsx --test server/routes/__tests__/trip-anchor-candidates.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";

const { createTripAnchorCandidatesHandler } = await import("../trips.routes.js");
const { rankAnchors } = await import("../../services/anchor-scoring.js");
const { rankActivityAnchors } = await import("../../services/anchor-candidates-map.js");

function makeRes() {
  const captured = { status: 200, body: null as any };
  const res = {
    status(status: number) {
      captured.status = status;
      return res;
    },
    json(body: any) {
      captured.body = body;
      return res;
    },
  };
  return { captured, res };
}

describe("GET /api/trips/:id/anchor-candidates", () => {
  it("ranks real candidates, preserves empty kinds, and performs reads only", async () => {
    const calls: string[] = [];
    const handler = createTripAnchorCandidatesHandler({
      getTrip: async (id: string) => {
        calls.push(`trip:${id}`);
        return {
          id,
          userId: "owner-1",
          destination: "Kyoto, Japan",
        } as any;
      },
      loadTripInputs: async (tripId: string) => {
        calls.push(`inputs:${tripId}`);
        return {
          baselineItems: [
            { id: "stop-1", name: "Temple", latitude: 35, longitude: 135 },
            { id: "stop-2", name: "Market", latitude: 35.01, longitude: 135.01 },
          ],
          fixedCommitments: [],
          counts: { optimizable: 2, purchased: 0, expertProtected: 0 },
        } as any;
      },
      rankAnchors: async (destination, stops) => {
        calls.push(`rank:${destination}`);
        const hotels = rankAnchors(
          [
            { id: "far", type: "hotel", name: "Far Hotel", lat: 36, lng: 136 },
            { id: "near", type: "hotel", name: "Near Hotel", lat: 35.001, lng: 135.001 },
          ],
          stops,
        );
        return {
          hotel: hotels,
          neighborhood: [],
          activity: rankActivityAnchors(stops),
        };
      },
    } as any);

    const { captured, res } = makeRes();
    await handler(
      {
        params: { id: "trip-1" },
        user: { id: "owner-1" },
      },
      res,
    );

    assert.equal(captured.status, 200);
    assert.deepEqual(
      captured.body.hotel.map((candidate: any) => candidate.anchorId),
      ["near", "far"],
      "real geometry must rank the nearer hotel first",
    );
    assert.deepEqual(captured.body.neighborhood, [], "empty inventory must stay honestly empty");
    assert.equal(captured.body.activity.length, 2);
    assert.deepEqual(calls, ["trip:trip-1", "inputs:trip-1", "rank:Kyoto, Japan"]);
  });

  it("returns 404 for a non-owner without loading inputs or candidates", async () => {
    const calls: string[] = [];
    const handler = createTripAnchorCandidatesHandler({
      getTrip: async () => ({
        id: "trip-1",
        userId: "someone-else",
        destination: "Kyoto",
      }) as any,
      loadTripInputs: async () => {
        calls.push("inputs");
        throw new Error("must not run");
      },
      rankAnchors: async () => {
        calls.push("rank");
        throw new Error("must not run");
      },
    } as any);

    const { captured, res } = makeRes();
    await handler(
      {
        params: { id: "trip-1" },
        user: { id: "owner-1" },
      },
      res,
    );

    assert.equal(captured.status, 404);
    assert.deepEqual(captured.body, { message: "Trip not found" });
    assert.deepEqual(calls, []);
  });
});