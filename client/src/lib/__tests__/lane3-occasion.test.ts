/**
 * Lane 3 — the plan's occasion, client half (ledger `2026-11-05-lane3-occasion`; briefs A-8, A-9, A-34, A-35).
 *
 *   C1  A-8: nothing picked ⇒ no occasion; a chosen group gives its default; "More specific" wins.
 *   C2  A-34: one title rule — "{Occasion} in {City}" with an occasion; otherwise "{City}, {date range}", or the city
 *       alone when no dates were chosen. The mint body always states `eventType: null`.
 *   C3  A-9: the occasion save is retried three times with backoff; a mocked failure then success persists; a
 *       persistent failure ends after four tries; a 4xx refusal is not retried.
 *   C4  A-9 / A-35: both create doors save the occasion through the retry and say the approved sentence on failure;
 *       PlanEntry sends an occasion name only when one was picked; the guest record replays no default occasion.
 *
 * Run: npx tsx --test client/src/lib/__tests__/lane3-occasion.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chosenOccasionSlug, emptyPlanEntry } from "../plan-entry";
import { buildTripMintBody, planTitle } from "../trip-slip";
import { OCCASION_SAVE_BACKOFF_MS, OCCASION_SAVE_FAILED, isRetryable, sendWithRetry } from "../occasion-save";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Lane 3 occasion (client)", () => {
  it("C1 stores no occasion when nothing is picked", () => {
    const s = emptyPlanEntry();
    assert.equal(chosenOccasionSlug(s, false), null);
    assert.equal(chosenOccasionSlug(s, true), "travel");
    assert.equal(chosenOccasionSlug({ ...s, group: "hosted_events" }, true), "wedding");
    assert.equal(chosenOccasionSlug({ ...s, occasionSlug: "proposal" }, false), "proposal");
  });

  it("C2 one title rule for every door", () => {
    assert.equal(planTitle({ city: "Kyoto", occasionName: "Proposal" }), "Proposal in Kyoto");
    assert.equal(planTitle({ city: "Kyoto", startDate: "2027-04-09", endDate: "2027-04-12" }), "Kyoto, Fri 9 – Mon 12 Apr 2027");
    assert.equal(planTitle({ city: "Kyoto", startDate: "2027-04-09", endDate: "2027-04-09" }), "Kyoto, Fri 9 Apr 2027");
    assert.equal(planTitle({ city: "Kyoto" }), "Kyoto");
    const body = buildTripMintBody({ destination: "Kyoto, Japan" });
    assert.equal(body.title, "Kyoto");
    assert.equal(body.eventType, null);
  });

  it("C3 retries with backoff, then stops", async () => {
    assert.equal(OCCASION_SAVE_FAILED, "Couldn't save the occasion. Try again.");
    assert.deepEqual([...OCCASION_SAVE_BACKOFF_MS], [500, 1000, 2000]);
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);

    let n = 0;
    const flaky = await sendWithRetry(async () => {
      n += 1;
      if (n === 1) throw new Error("500: boom");
      return "saved";
    }, { sleep });
    assert.deepEqual(flaky, { ok: true, value: "saved", attempts: 2 });
    assert.deepEqual(waits, [500]);

    waits.length = 0;
    let m = 0;
    const down = await sendWithRetry(async () => {
      m += 1;
      throw new Error("fetch failed");
    }, { sleep });
    assert.equal(down.ok, false);
    assert.equal(down.attempts, 4, "the first try and three retries");
    assert.equal(m, 4);
    assert.deepEqual(waits, [500, 1000, 2000]);

    waits.length = 0;
    const refused = await sendWithRetry(async () => {
      throw new Error("400: Unknown occasion");
    }, { sleep });
    assert.equal(refused.ok, false);
    assert.equal(refused.attempts, 1);
    assert.deepEqual(waits, []);
    assert.equal(isRetryable(new Error("429: slow down")), true);
    assert.equal(isRetryable(new Error("403: Forbidden")), false);
  });

  it("C4 both doors save through the retry and say the approved sentence", () => {
    const ctx = read("client/src/contexts/PlanningContext.tsx");
    assert.match(ctx, /const saved = await sendWithRetry\(\(\) => apiRequest\("PATCH", `\/api\/trips\/\$\{tripId\}\/occasion`, occasionBody\)\);/);
    assert.match(ctx, /toast\(\{ variant: "destructive", title: OCCASION_SAVE_FAILED \}\)/);
    assert.match(ctx, /\.\.\.\(start\.occasionSlug \? \{ experienceSlug: start\.occasionSlug, eventType: eventTypeForSlug\(start\.occasionSlug\) \} : \{\}\)/);
    assert.doesNotMatch(ctx, /OCCASION_GROUP_DEFAULT_SLUG\.trips/, "a replayed record never invents the trips default");
    assert.doesNotMatch(ctx, /console\.warn\("\[plan-entry\] occasion not saved/);
    const intake = read("client/src/components/intake-panel.tsx");
    assert.match(intake, /sendWithRetry\(\(\) => apiRequest\("PATCH", `\/api\/trips\/\$\{trip\.id\}\/occasion`, \{ experienceSlug: slug \}\)\)/);
    assert.match(intake, /if \(!saved\.ok\) toast\(\{ variant: "destructive", title: OCCASION_SAVE_FAILED \}\)/);
    assert.match(intake, /title: planTitle\(/);
    assert.doesNotMatch(intake, /\} Trip`/, "no second title rule");
    const entry = read("client/src/components/plan/PlanEntry.tsx");
    // R3-6 (sanctioned edit): `groupChosen` starts from `doorChoseGroup(source)`, so it alone carries the door's group.
    assert.match(entry, /const pickedSlug = chosenOccasionSlug\(state, groupChosen\);/);
    assert.match(entry, /useState\(doorChoseGroup\(source\)\)/);
    assert.match(entry, /\.\.\.\(pickedSlug \? \{ occasionName: choiceLabel \} : \{\}\)/);
  });
});
