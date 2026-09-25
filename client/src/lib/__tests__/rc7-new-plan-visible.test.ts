/**
 * RC-7 — A NEW PLAN IS VISIBLE ON AN ALREADY-LOADED MY PLANS (ledger
 * `2026-09-25-rc7-new-plan-visible`; decision-maker ruled Sep 25, 2026: "both").
 *
 * The client's queries default to `staleTime: Infinity`, so a plan list refetches only when it is
 * invalidated — and most doors that create a plan invalidated nothing. The audit proved it in the
 * browser (J1 R5 step 13): a pre-cached My Plans read "No plans yet" beside a plan just made.
 *
 * What these hold:
 *   R1–R2  `refreshPlanLists` marks exactly the plan lists stale, and never throws into the write
 *          that created the plan.
 *   R3     the plan list re-fetches whenever a reader mounts (the second half of the ruling).
 *   R4     every client door that creates or claims a plan calls the ONE helper.
 *
 * Run: npx tsx --test client/src/lib/__tests__/rc7-new-plan-visible.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLAN_LIST_QUERY_KEYS, refreshPlanLists } from "../plan-lists";

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("refreshPlanLists (RC-7)", () => {
  it("R1: invalidates the plan list and Home's time axis — and nothing else", async () => {
    const seen: unknown[] = [];
    await refreshPlanLists({ invalidateQueries: (f: any) => (seen.push(f.queryKey), Promise.resolve()) } as any);
    assert.deepEqual(seen, [["/api/trips"], ["/api/me/upcoming"]]);
    assert.deepEqual(PLAN_LIST_QUERY_KEYS.map((k) => [...k]), seen);
  });

  it("R2: a failing client never throws into the mint that preceded it", async () => {
    await assert.doesNotReject(
      refreshPlanLists({
        invalidateQueries: () => {
          throw new Error("boom");
        },
      } as any),
    );
  });
});

describe("the plan list re-fetches on mount (RC-7, half 2)", () => {
  it("R3: useTrips sets refetchOnMount 'always'", () => {
    const src = read("client/src/hooks/use-trips.ts");
    const hook = src.slice(src.indexOf("export function useTrips()"), src.indexOf("export function useTrip("));
    assert.match(hook, /refetchOnMount: "always"/);
  });
});

describe("every door that creates or claims a plan refreshes the lists (RC-7, half 1)", () => {
  const doors: Array<[string, RegExp]> = [
    ["client/src/lib/trip-slip.ts", /refreshPlanLists\(\)/], // the modal, concierge and template doors
    ["client/src/hooks/use-trips.ts", /refreshPlanLists\(queryClient\)/], // IntakePanel's create
    ["client/src/pages/cart.tsx", /refreshPlanLists\(queryClient\)[\s\S]*refreshPlanLists\(queryClient\)/], // convert + resolve-trip
    ["client/src/components/ai-itinerary-builder.tsx", /refreshPlanLists\(\)/],
    ["client/src/components/EnhancedPlanningModal.tsx", /refreshPlanLists\(\)/],
    ["client/src/components/ea/PlanForClientDialog.tsx", /refreshPlanLists\(queryClient\)/],
    ["client/src/contexts/GuestTripContext.tsx", /refreshPlanLists\(\)/],
    ["client/src/components/dashboard/SavedTripsSection.tsx", /refreshPlanLists\(queryClient\)/],
    ["client/src/pages/ready-made-detail.tsx", /refreshPlanLists\(queryClient\)/],
  ];
  for (const [file, pattern] of doors) {
    it(`R4: ${file}`, () => {
      const src = read(file);
      assert.match(src, pattern, `${file} creates or claims a plan and must refresh the plan lists`);
      assert.match(src, /(from|import\() ?"@\/lib\/plan-lists"/);
    });
  }
});
