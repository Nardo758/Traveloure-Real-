/**
 * QA round 3 PR 5 (Leon, Nov 12, 2026) — add-to-plan feedback and the guest read.
 *
 *   T1 toast: the plan-add toasts stay PLAN_ADD_TOAST_MS (config, ≥ 8 s) — all three calls, no literal at a call site,
 *      and the provider sets no duration (every other toast keeps Radix's own). Pausing is Radix's own, not re-built.
 *   T2 the known day: `feedAddDay` names a day only on a confirmed window with the card's day inside it (the guest rail's
 *      own `guestChosenDay`); the guest map's add and the four day-filtered feed cards pass it to the label.
 *   T3 one guest read: `guestPlanReadAllowed` is signed out AND the session read settled; `useGuestPlan` applies it, and
 *      every caller (layout, both guest-map reads, the saved-refs read) goes through it — none keeps its own `!user`.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/qa3-pr5.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PLAN_ADD_TOAST_MS } from "../../config/toast.config";
import { feedAddDay } from "../feed-add-day";
import { addLabel } from "../add-to-plan";
import { guestChosenDay, guestPlanReadAllowed } from "../waitlist-guest-plan";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("QA round 3 PR 5", () => {
  it("T1 the plan-add toasts stay 8 s from config; nothing else changes", () => {
    assert.ok(PLAN_ADD_TOAST_MS >= 8000);
    const host = read("client/src/components/plan/PlanAddFeedbackHost.tsx");
    const calls = host.match(/toast\(\{[\s\S]*?\}( as any)?\);/g) ?? [];
    assert.equal(calls.length, 3, "the added, failed and changed-day toasts");
    for (const c of calls) assert.match(c, /duration: PLAN_ADD_TOAST_MS/, c.slice(0, 60));
    assert.doesNotMatch(host, /duration:\s*\d/, "no literal at a call site");
    assert.match(host, /from "@\/config\/toast\.config"/);
    const toaster = read("client/src/components/ui/toaster.tsx");
    assert.match(toaster, /<ToastProvider>/, "the provider keeps Radix's default for every other toast");
    assert.doesNotMatch(read("client/src/hooks/use-toast.ts"), /onPointerMove|pause/i, "pausing is Radix's, not re-implemented");
  });

  it("T2 the known day: confirmed window, the card's day inside it — else no day is claimed", () => {
    const plan = { startDate: "2026-12-01", endDate: "2026-12-04", datesConfirmed: true };
    assert.equal(feedAddDay("2026-12-03", plan), 3);
    assert.equal(feedAddDay("2026-12-01", plan), 1);
    assert.equal(feedAddDay("2026-12-04", plan), 4);
    assert.equal(feedAddDay("2026-12-05", plan), null, "after the window: lands on Day 1, so no day is named");
    assert.equal(feedAddDay("2026-11-30", plan), null, "before the window");
    assert.equal(feedAddDay("2026-12-03", { ...plan, datesConfirmed: false }), null, "a placeholder window is not a range (LD 30)");
    assert.equal(feedAddDay(null, plan), null, "a feed that is not day-filtered");
    assert.equal(feedAddDay("2026-12-03", null), null, "no plan known");
    // The same rule the guest save applies.
    for (const d of ["2026-11-30", "2026-12-01", "2026-12-03", "2026-12-05"]) {
      assert.equal(feedAddDay(d, plan), guestChosenDay(d, plan.startDate, plan.endDate), d);
    }
    assert.equal(addLabel({ dayNumber: feedAddDay("2026-12-03", plan) }), "Add to Day 3");
    assert.equal(addLabel({ dayNumber: feedAddDay("2026-12-09", plan) }), "Add to plan");

    // The guest map's add passes the chip's day — the same `dayNumber ?? 1` its save is handed.
    const map = read("client/src/components/plancard/MapControlCenter.tsx");
    assert.match(map, /<GuestBrowseAdd [^>]*dayNumber=\{dayNumber \?\? 1\}/);
    assert.match(map, /onAdd: \(place: BrowsePlace\) => mode\.onSave\(place, dayNumber \?\? 1\)/);
    assert.match(map, /addedInert=\{inert\} dayNumber=\{dayNumber\} onClick=\{onAdd\}/);

    // The four day-filtered feed cards carry the day into their save (and the event card's sheet).
    const cards = read("client/src/components/city-feed-card.tsx");
    for (const v of ["gem", "event", "svc", "supply"]) {
      assert.match(cards, new RegExp(`const ${v}AddDay = useFeedAddDay\\(scheduledDate\\);`), v);
      assert.match(cards, new RegExp(`const ${v}Save = \\{ \\.\\.\\.feedSaveIntent\\([^\\n]*\\), dayNumber: ${v}AddDay \\};`), v);
    }
    assert.match(cards, /dayNumber: action\.dayNumber \?\? null,/);
    // A signed-in add with no `?tripId=` opens the picker, so no day is claimed there; nothing mounts the refetching list.
    const hook = read("client/src/lib/feed-add-day.ts");
    assert.match(hook, /resolveTargetTripId\(search\)/);
    assert.doesNotMatch(hook, /useTrips\(|useAddPlanResolution\(/);
  });

  it("T3 one guest read: signed out and the session read settled, for every caller", () => {
    assert.equal(guestPlanReadAllowed({ authLoading: false, signedIn: false }), true);
    assert.equal(guestPlanReadAllowed({ authLoading: true, signedIn: false }), false, "the session read is in flight");
    assert.equal(guestPlanReadAllowed({ authLoading: false, signedIn: true }), false, "signed in ⇒ 409 signed_in");
    assert.equal(guestPlanReadAllowed({ authLoading: true, signedIn: true }), false);
    const lib = read("client/src/lib/waitlist-guest-plan.ts");
    assert.match(lib, /enabled: enabled && guestPlanReadAllowed\(auth\),/);
    const callers = [
      ["client/src/components/layout.tsx", /useGuestPlan\(\{ authLoading: isAuthLoading, signedIn: !!user \}, guestPresent\)/],
      ["client/src/pages/guest-plan-map.tsx", /useGuestPlan\(\{ authLoading: isLoading, signedIn: !!user \}, mode === "waitlist"\)/],
      ["client/src/pages/guest-plan-map.tsx", /useGuestPlan\(\{ authLoading: planAuthLoading, signedIn: !!planUser \}, !creating\)/],
    ] as const;
    for (const [file, re] of callers) assert.match(read(file), re, file);
    assert.match(read("client/src/lib/saved-refs.ts"), /guestPlanReadAllowed\(\{ authLoading: !authKnown, signedIn \}\) && mode === "waitlist"/);
    // Every `useGuestPlan(` call in the client passes the session read (no caller restates `!user`).
    const all = fs
      .readdirSync("client/src", { recursive: true })
      .map(String)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"))
      .flatMap((f) => (read(`client/src/${f}`).match(/useGuestPlan\([^)]*\)/g) ?? []).filter((c) => !c.startsWith("useGuestPlan(auth")));
    assert.equal(all.length, 3, all.join(" | "));
    for (const c of all) assert.match(c, /^useGuestPlan\(\{ authLoading: /, c);
    // A browser with a guest reads as loading while the session read settles — never "idle".
    assert.match(read("client/src/components/layout.tsx"), /guestPlanQuery\.isLoading \|\| \(guestPresent && isAuthLoading\)/);
  });
});
