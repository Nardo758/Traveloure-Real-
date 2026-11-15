/**
 * QA round 4 R4-3 (Leon, Nov 10 ruling: "View plan on toast", PLAN_ADD_TOAST_MS 8000 every time, on signed-in adds).
 *
 * Measured in a browser on `main`: the map's signed-in add raises the one add toast and it stays 8,020 ms. The
 * signed-in adds that closed early were the ones that still raised their OWN toast — Radix's 5 s default, no View
 * plan, no Undo: the service page's add to a plan (service and room), the slip's saved places, and the guest-map add
 * that lands after sign-up. Each now raises the one add toast (`announceTripAdd`) when the write answers with an item.
 *
 *   S1 the pending map add carries the created item, so the caller can name it
 *   S2 PlanningContext: a landed pending add (and its retry) raises the one add toast
 *   S3 SlipSavedPlaces: a landed located add raises the one add toast (the not-on-map and add-checks notices stay)
 *   S4 service page: a plan add raises the one add toast; the cart add and an answer with no item keep the page's line
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/r4-3-signed-in-adds.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const { attachPendingMapAdd } = await import("../pending-map-add");
const read = (p: string) => fs.readFileSync(p, "utf8");

const ITEMS = "/api/trips/t1/itinerary-items";
const fetcher = (post: unknown) =>
  (async (url: string, init?: RequestInit) => {
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    const json =
      key === `GET ${ITEMS}` ? { days: [], total: 0 } :
      key === "GET /api/services/s1" ? { id: "s1", serviceName: "Tea ceremony", latitude: "35.01", longitude: "135.77" } :
      key === `POST ${ITEMS}` ? post : null;
    if (json === null) throw new Error(`unexpected ${key}`);
    return { ok: true, status: key.startsWith("POST") ? 201 : 200, json: async () => json } as Response;
  }) as any;

describe("QA round 4 R4-3 — every signed-in add raises the one add toast", () => {
  it("S1 the pending map add carries the created item", async () => {
    const add = { kind: "listing" as const, id: "s1", title: "Tea", dayNumber: 1 as const };
    const out: any = await attachPendingMapAdd("t1", add, fetcher({ id: "i1", dayNumber: 2 }));
    assert.equal(out.status, "added");
    assert.deepEqual(out.item, { id: "i1", dayNumber: 2 });
    const noId: any = await attachPendingMapAdd("t1", add, fetcher({ suggested: true }));
    assert.equal(noId.status, "added");
    assert.equal(noId.item, undefined, "no item in the answer ⇒ none claimed");
  });

  it("S2 PlanningContext: a landed pending add, and its retry, raise the one add toast", () => {
    const ctx = read("client/src/contexts/PlanningContext.tsx");
    assert.match(ctx, /import \{ announceTripAdd \} from "@\/lib\/plan-add-runner";/);
    assert.match(ctx, /if \(added\.status === "added" && added\.item\) announceTripAdd\(outcome\.tripId, added\.item\);/);
    assert.match(ctx, /if \(added\.status === "added" && added\.item\) announceTripAdd\(retry\.tripId, added\.item\);/);
  });

  it("S3 SlipSavedPlaces: a landed located add raises the one add toast", () => {
    const src = read("client/src/components/plancard/SlipSavedPlaces.tsx");
    assert.match(src, /else if \(out\?\.id && !createdItemIsLocated\(out\)\) toast\(\{ title: GUEST_PLAN_COPY\.savedNotOnMap \}\);\s*\/\/[^\n]*\n\s*else if \(out\?\.id\) announceTripAdd\(tripId, out\);/);
    assert.match(src, /if \(out\?\.id && out\?\.addChecks\) setChecked/, "the add-checks notice keeps its place");
  });

  it("S4 service page: plan adds raise the one add toast; the cart add keeps its own line", () => {
    const src = read("client/src/pages/service-detail.tsx");
    const hits = src.match(/\(row: any\) => \(row\?\.id \? announceTripAdd\(tripId, row\) : fallback\(\)\),/g) ?? [];
    assert.equal(hits.length, 2, "the service add and the room add");
    assert.equal((src.match(/if \(tripId && res\) \{/g) ?? []).length, 2);
    assert.equal((src.match(/\} else fallback\(\);/g) ?? []).length, 2, "the cart add keeps the page's sentence");
    assert.doesNotMatch(src, /void \([^)]*\)\?\.clone\(\)[\s\S]{0,200}\?\? fallback\(\)/, "no fallback that always runs");
  });

  it("the one add toast is the 8 s toast with View plan", () => {
    const host = read("client/src/components/plan/PlanAddFeedbackHost.tsx");
    assert.match(host, /toast\(\{ title: addedMessage\(f\.event\), action: addedActions\(f\.event\), duration: PLAN_ADD_TOAST_MS/);
    assert.match(host, /data-testid="toast-added-view-plan"/);
  });
});
