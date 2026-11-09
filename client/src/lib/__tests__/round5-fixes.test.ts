/**
 * Round 5 fixes (ledger `2026-11-09-round5-fixes`): R5-1 the draft re-read, R5-4 no paid AI task in waitlist,
 * R5-5 no day date before the dates are confirmed, R5-6 "Which dates?".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planShowsDraft, rereadUntilDraftShows, DRAFT_REREAD_DELAYS_MS } from "../slip-free-draft";
import { mapDayChips } from "../map-days";
import { dayBlockHeading } from "../plan-day";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const plan = (n: number) => ({ days: [{ activities: Array.from({ length: n }, (_, i) => ({ id: String(i) })) }] });

test("R5-1a the plan shows the draft only when it holds the rows the draft wrote", () => {
  assert.equal(planShowsDraft(plan(0), 20), false);
  assert.equal(planShowsDraft(plan(19), 20), false);
  assert.equal(planShowsDraft(plan(20), 20), true);
  assert.equal(planShowsDraft(plan(0), null), false, "an unknown count asks for a non-empty plan");
  assert.equal(planShowsDraft(plan(3), null), true);
  assert.equal(planShowsDraft(undefined, 4), false);
});

test("R5-1b a failed or stale re-read is retried, bounded, and never throws", async () => {
  const waits: number[] = [];
  const sleep = async (ms: number) => void waits.push(ms);
  // First re-read fails (a 429), second is stale, third shows the draft.
  const answers: Array<() => unknown> = [() => { throw new Error("429"); }, () => plan(0), () => plan(20)];
  let i = 0;
  const out = await rereadUntilDraftShows(async () => answers[i++](), 20, sleep);
  assert.deepEqual(out, { shown: true, reads: 3 });
  assert.deepEqual(waits, [1000, 2000]);
  // Never shows: every delay is spent, then it stops.
  const never = await rereadUntilDraftShows(async () => plan(0), 20, async () => {});
  assert.deepEqual(never, { shown: false, reads: DRAFT_REREAD_DELAYS_MS.length });
});

test("R5-1c the hook awaits the plan re-read with the draft's own count", () => {
  const hook = src("client/src/components/plan/useSlipFreeDraft.tsx");
  assert.match(hook, /rereadUntilDraftShows\(async \(\) => \{\s*await queryClient\.refetchQueries\(\{ queryKey: plancardKey, exact: true \}\);\s*return queryClient\.getQueryData\(plancardKey\);\s*\}, result\.itemsWritten\);/);
  assert.match(src("client/src/lib/slip-free-draft.ts"), /const written = Array\.isArray\(body\?\.itinerary\?\.items\) \? body\.itinerary\.items\.length : null;/);
});

test("R5-4 the Ask drawer renders nothing in waitlist, through the shared mode read", () => {
  const drawer = src("client/src/components/plancard/AskAiDrawer.tsx");
  assert.match(drawer, /const waitlist = !useBookingActionsShown\(\);/);
  assert.match(drawer, /if \(!visibility\.visible \|\| !askShown\(caps\.data\)\) return null;\s*\/\/[^\n]*\n[^\n]*\n\s*if \(waitlist\) return null;/);
});

test("R5-5 an unconfirmed plan's days carry no date; a confirmed one keeps its weekday", () => {
  const unconfirmed = mapDayChips([], { startDate: "2026-11-08", endDate: "2026-11-10", datesConfirmed: false });
  assert.equal(unconfirmed.length, 3, "the window still sets the day count");
  for (const d of unconfirmed) {
    assert.equal(d.dateIso, null);
    assert.equal(d.date, "");
    assert.equal(dayBlockHeading({ dayNum: d.dayNum, date: d.date, dateIso: d.dateIso ?? null }), `Day ${d.dayNum}`);
  }
  const confirmed = mapDayChips([], { startDate: "2026-11-08", endDate: "2026-11-10", datesConfirmed: true });
  assert.equal(confirmed[0].dateIso, "2026-11-08");
  assert.equal(dayBlockHeading({ dayNum: 1, date: confirmed[0].date, dateIso: confirmed[0].dateIso ?? null }), "Sun · Nov 8");
  // Server: the live plan DTO dates its days only from a confirmed start.
  const svc = src("server/services/trip-plan.service.ts");
  assert.match(svc, /const dayDateStart: Date \| null = planDatesAreConfirmed\(\(trip as any\)\.datesConfirmedAt\) \? startDate : null;/);
  assert.equal((svc.match(/dateIso: dayDateIso\(dayDateStart, dayNum\)/g) ?? []).length, 2);
  assert.match(src("client/src/lib/waitlist-guest-plan.ts"), /datesConfirmed: view\.plan\.datesConfirmed === true,/);
});

test("R5-6 the event-night picker asks 'Which dates?' (Wording approved — Leon)", () => {
  const entry = src("client/src/components/plan/PlanEntry.tsx");
  assert.equal((entry.match(/>Which dates\?<\/p>/g) ?? []).length, 2);
  assert.doesNotMatch(entry, /Which night\?/);
});

test("R5-3 (option b) the eyebrow: a group's default occasion ⇒ the group label; another occasion ⇒ its name; none ⇒ 'Your plan'", async () => {
  // TEST EDIT (R5-3 amended, ledger `2026-11-09-r5-3-group-eyebrow`): replaces the "Your plan · {occasion}" pins.
  const { planEyebrowLabel, phaseShown, occasionGroupForDefaultSlug } = await import("@shared/plan-dates");
  for (const datesConfirmed of [false, null, undefined, true]) {
    // 1. the group's default — "A trip" stores `travel`, "A hosted event" stores `wedding`.
    assert.equal(planEyebrowLabel({ datesConfirmed, occasionSlug: "travel", occasionName: "Travel" }), "A trip");
    assert.equal(planEyebrowLabel({ datesConfirmed, occasionSlug: "wedding", occasionName: "Wedding" }), "A hosted event");
    // 2. any other occasion — its own name, alone.
    assert.equal(planEyebrowLabel({ datesConfirmed, occasionSlug: "proposal", occasionName: "Proposal" }), "Proposal");
    // 3. no occasion.
    assert.equal(planEyebrowLabel({ datesConfirmed, occasionSlug: null, occasionName: null }), "Your plan");
    assert.equal(planEyebrowLabel({ datesConfirmed }), "Your plan");
  }
  // Every group's default maps to its own label (the existing OCCASION_GROUP_LABELS — no new string).
  const { OCCASION_GROUP_DEFAULT_SLUG, OCCASION_GROUP_LABELS } = await import("@shared/experience-group");
  for (const [g, slug] of Object.entries(OCCASION_GROUP_DEFAULT_SLUG)) {
    assert.equal(occasionGroupForDefaultSlug(slug), g);
    assert.equal(planEyebrowLabel({ occasionSlug: slug, occasionName: "x" }), (OCCASION_GROUP_LABELS as any)[g]);
  }
  assert.doesNotMatch(src("shared/plan-dates.ts"), /"Your plan · Proposal"|`Your plan · \$\{/);
  // The slug reaches the eyebrow: the plan DTO and the guest view carry it, and the slip header passes it.
  assert.match(src("server/services/trip-plan.service.ts"), /occasionSlug: \(trip as any\)\.occasionSlug \?\? null,/);
  assert.match(src("server/services/guest-plan.service.ts"), /occasionSlug: \(trip as any\)\.occasionSlug \?\? null,/);
  assert.match(src("client/src/lib/waitlist-guest-plan.ts"), /occasionSlug: plan\.occasionSlug \?\? null,/);
  assert.match(src("client/src/components/plancard/SlipView.tsx"), /planEyebrowLabel\(\{ datesConfirmed, occasionName, occasionSlug \}\)/);
  // The UPCOMING badge rule is unchanged: the phase needs confirmed dates.
  assert.equal(phaseShown(false), false);
  assert.equal(phaseShown(true), true);
});
