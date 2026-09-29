import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addPendingGemToTrip,
  buildBillboardGemPlanningSource,
} from "../billboard-gem-planning";
import {
  normalizePendingPlanItems,
  pendingPlanItemValues,
} from "@shared/pending-plan-items";

const GEM = { id: "gem-real-42", title: "Hidden Garden", city: "Kyoto" };

describe("billboard gem → new plan pending-item rail", () => {
  it("seeds a new plan from the real gem identity and city", () => {
    const source = buildBillboardGemPlanningSource({
      id: GEM.id,
      name: GEM.title,
      city: GEM.city,
    });
    assert.equal(source.newPlan, true);
    assert.equal(source.destination, "Kyoto");
    assert.deepEqual(source.pendingItem, GEM);
  });

  it("refuses incomplete gem facts instead of inventing a pending item", () => {
    assert.throws(
      () => buildBillboardGemPlanningSource({ id: "g", title: "A gem", city: "" }),
      /missing its id, title, or city/,
    );
    assert.deepEqual(normalizePendingPlanItems([{ id: "g", title: "A gem" }]), []);
  });

  it("turns the gem into an untimed, undated itinerary item", () => {
    const values = pendingPlanItemValues(GEM);
    assert.equal(values.title, GEM.title);
    assert.equal(values.locationName, GEM.city);
    assert.match(values.notes, /gem-real-42/);
    assert.equal("scheduledDate" in values, false);
    assert.equal("startTime" in values, false);
    assert.equal(values.dayNumber, 1, "only the itinerary's required ordinal is set");
  });

  it("writes once to the newly minted trip and skips a duplicate on retry", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (init?.method === "POST") return { ok: true } as Response;
      return { ok: true, json: async () => ({ days: [] }) } as Response;
    };
    await addPendingGemToTrip("new-trip", GEM, fetcher);
    assert.equal(calls.length, 2);
    const body = JSON.parse(String(calls[1].init?.body));
    assert.equal(body.title, GEM.title);
    assert.equal(body.locationName, GEM.city);
    assert.equal("scheduledDate" in body, false);
    assert.equal("startTime" in body, false);

    calls.length = 0;
    const alreadyPresent = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return {
        ok: true,
        json: async () => ({
          days: [{ items: [{ notes: "Billboard gem id: gem-real-42" }] }],
        }),
      } as Response;
    };
    await addPendingGemToTrip("new-trip", GEM, alreadyPresent);
    assert.equal(calls.length, 1, "no second item is posted when the gem is already present");
  });

  it("surfaces write failures instead of claiming the gem was saved", async () => {
    let request = 0;
    const fetcher = async () => {
      request += 1;
      return request === 1
        ? ({ ok: true, json: async () => ({ days: [] }) } as Response)
        : ({ ok: false, json: async () => ({ message: "write denied" }) } as Response);
    };
    await assert.rejects(
      addPendingGemToTrip("new-trip", GEM, fetcher),
      /write denied/,
    );
  });

  it("retries attachment on the same minted trip and remains duplicate-safe", async () => {
    const stored: Array<{ notes: string }> = [];
    const calls: Array<{ url: string; method: string }> = [];
    let writes = 0;
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (method === "GET") {
        return {
          ok: true,
          json: async () => ({ days: stored.length ? [{ items: stored }] : [] }),
        } as Response;
      }
      writes += 1;
      if (writes === 1) {
        return { ok: false, json: async () => ({ message: "temporary write failure" }) } as Response;
      }
      const body = JSON.parse(String(init?.body));
      stored.push({ notes: body.notes });
      return { ok: true } as Response;
    };

    await assert.rejects(addPendingGemToTrip("already-minted-trip", GEM, fetcher), /temporary write failure/);
    await addPendingGemToTrip("already-minted-trip", GEM, fetcher);
    await addPendingGemToTrip("already-minted-trip", GEM, fetcher);

    assert.equal(writes, 2, "one failed write and one successful retry; the later retry dedupes");
    assert.equal(stored.length, 1);
    assert.ok(calls.every(({ url }) => url.includes("/already-minted-trip/")));
    assert.ok(calls.every(({ url }) => !url.includes("/api/trips/undefined/")));
  });

  it("does not write when the existing-item check is unreadable", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { ok: true, json: async () => ({ unexpected: [] }) } as Response;
    };
    await assert.rejects(
      addPendingGemToTrip("new-trip", GEM, fetcher),
      /Could not verify the new plan's items/,
    );
    assert.equal(calls, 1, "a failed dedupe read must not fall through to POST");
  });

  it("keeps the retry modal open and explains why close is blocked", () => {
    const source = readFileSync(new URL("../../contexts/PlanningContext.tsx", import.meta.url), "utf8");
    const start = source.indexOf("const close = useCallback(() => {");
    const end = source.indexOf("\n  }, [pendingGemRecovery, toast]);", start);
    assert.ok(start >= 0 && end > start, "the shared planning close callback is present");
    const closeBody = source.slice(start, end);
    assert.ok(closeBody.indexOf("if (pendingGemRecovery)") < closeBody.indexOf("setModalOpen(false)"));
    assert.match(closeBody, /toast\(/);
    assert.match(closeBody, /Gem still needs to be added/);
  });
});