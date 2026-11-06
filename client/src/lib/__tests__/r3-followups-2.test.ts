/**
 * Round 3 follow-ups 2 (ledger `2026-11-05-r3-followups-2`) — the client rows.
 *
 *   R3-18 (ruled) Build-around stays hidden in waitlist mode; Quick draft and the Trip Card banner read no mode; the
 *         dashboard handover row follows the banner and waits for chosen dates.
 *   R3-19 /plans redirects to the plan list (/my-trips), and /plans/new and /plans/:id are untouched.
 *   R3-20 ONE preset row on every entry path; "This weekend" is the coming Sat–Sun (Thursday) or the rest of the
 *         weekend (Saturday), and it sets both dates — a mint with both dates confirms them.
 *   R3-21 the dashboard greets by display name, never "Traveler".
 *   R3-22 the party reads "{n} adults" / "{n} adults, {m} children".
 *   R3-23 one occasion label from `occasion_slug` (null stays null); the phase badge only once dates are set.
 *   R3-25 the stay ranking is not drawn until a stop has a point.
 *   R3-26 /places gives a signed-in member the city page's add dialog (it had no add action at all).
 *   R3-27 waitlist mode: the sign-in line is "Sign in to continue." only.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/r3-followups-2.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { thisWeekend, planEntryMintBasics } from "../plan-entry";
import { memberDisplayName, welcomeBackLine } from "../display-name";
import { partyCompositionLabel, planHeaderCountLabel } from "../plan-vocabulary";
import { occasionLabelFromSlug } from "@shared/occasion-label";

const read = (p: string) => readFileSync(p, "utf8");

describe("Round 3 follow-ups 2", () => {
  it("R3-19 /plans redirects to the plan list before the /plans/* routes", () => {
    const app = read("client/src/App.tsx");
    const at = app.search(/<Route path="\/plans">\s*<Redirect to="\/my-trips" replace \/>\s*<\/Route>/);
    assert.ok(at > 0, "the /plans redirect exists");
    assert.ok(at < app.indexOf('path="/plans/new"'), "and sits before /plans/new");
  });

  it("R3-20 This weekend: Thursday ⇒ the coming Sat–Sun; Saturday ⇒ that weekend; Sunday ⇒ that day", () => {
    assert.deepEqual(thisWeekend(new Date(2026, 10, 5)), { startDate: "2026-11-07", endDate: "2026-11-08" }); // Thu
    assert.deepEqual(thisWeekend(new Date(2026, 10, 7)), { startDate: "2026-11-07", endDate: "2026-11-08" }); // Sat
    assert.deepEqual(thisWeekend(new Date(2026, 10, 8)), { startDate: "2026-11-08", endDate: "2026-11-08" }); // Sun
    const basics = planEntryMintBasics({ city: "Kyoto", ...thisWeekend(new Date(2026, 10, 5)) } as any);
    assert.equal(basics.datesConfirmed, true);
    assert.equal(basics.startDate, "2026-11-07");
    assert.equal(basics.endDate, "2026-11-08");
  });

  it("R3-20 both entry steps draw the ONE DatePresets row", () => {
    const src = read("client/src/components/plan/PlanEntry.tsx");
    assert.equal((src.match(/<DatePresets\b/g) ?? []).length, 2, "the A-date step and the details step");
    assert.doesNotMatch(src.replace(/export function DatePresets[\s\S]*?\n}\n/, ""), /testId="plan-entry-date-weekend"/, "no second weekend chip");
  });

  it("R3-21 the greeting is the display name, never a placeholder noun", () => {
    assert.equal(welcomeBackLine({ firstName: "Ana", email: "a@x.test" }), "Welcome back, Ana");
    assert.equal(welcomeBackLine({ firstName: "  ", email: "kenji@x.test" }), "Welcome back, kenji");
    assert.equal(welcomeBackLine({}), "Welcome back");
    assert.equal(memberDisplayName(null), null);
    assert.doesNotMatch(read("client/src/pages/dashboard.tsx"), /"Traveler"/);
  });

  it("R3-22 the party reads adults and children", () => {
    assert.equal(partyCompositionLabel(2, null), "2 adults");
    assert.equal(partyCompositionLabel(2, 0), "2 adults");
    assert.equal(partyCompositionLabel(2, 3), "2 adults, 3 children");
    assert.equal(partyCompositionLabel(null, 2), "");
    assert.equal(planHeaderCountLabel(5, null, null, null, true, { adults: 2, kids: 3 }), "2 adults, 3 children");
    // No stated pair ⇒ the label it always printed; the guest-list header still names both populations.
    assert.equal(planHeaderCountLabel(3, null, null, null, true), "3 travelers");
    assert.equal(planHeaderCountLabel(2, 64, "guests", true, true, { adults: 2 }), "2 traveling · 64 invited");
  });

  it("R3-23 one occasion label from the slug; null stays null; phase only with set dates", () => {
    const names = new Map([["wedding", "Wedding"]]);
    assert.equal(occasionLabelFromSlug("wedding", names), "Wedding");
    assert.equal(occasionLabelFromSlug(null, names), null);
    assert.equal(occasionLabelFromSlug("not-in-catalog", names), null);
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /occasionName=\{\(data\.trip as any\)\?\.occasionLabel \?\? null\}/);
    assert.match(slip, /const phase = phaseShown\(datesConfirmed\) \? derivePhase\(start, end\) : null;/);
    assert.match(read("client/src/pages/my-trips.tsx"), /chip-plan-occasion-/);
    for (const f of ["server/routes.ts", "server/routes/trips.routes.ts"]) {
      assert.match(read(f), /res\.json\(await withOccasionLabels\(trips as any\[\]\)\);/, f);
    }
    assert.match(read("server/services/trip-plan.service.ts"), /occasionLabel,\n/);
  });

  it("R3-25 the stay ranking waits for a located stop", () => {
    const panel = read("client/src/components/plan/AnchorPanel.tsx");
    assert.equal((panel.match(/props\.locatedStopCount !== 0 \? <StayPickCard/g) ?? []).length, 2);
    assert.equal((panel.match(/staysShown=\{props\.locatedStopCount !== 0\}/g) ?? []).length, 2);
    assert.match(panel, /const showStays = staysShown && anchorPanelMode/);
    assert.match(read("client/src/components/plancard/SlipView.tsx"), /locatedStopCount=\{whereToStayQuery\.data\?\.locatedStops\}/);
    assert.match(read("server/services/where-to-stay.service.ts"), /locatedStops: Array\.from\(byDay\.values\(\)\)\.reduce/);
  });

  it("R3-26 /places passes the gem card an add action that opens the add-to-plan dialog", () => {
    const page = read("client/src/pages/hidden-gems.tsx");
    assert.match(page, /<CityFeedCardGem [^>]*onAdd=\{onAdd\}/);
    assert.match(page, /<AddToExperienceDialog item=\{addItem\} open=\{addOpen\} onOpenChange=\{setAddOpen\} \/>/);
  });

  it("R3-18 the split: Build-around waits for open mode; Quick draft and the Trip Card banner read no mode", () => {
    const rail = read("client/src/components/plancard/SlipRail.tsx");
    // Build-around lives in the optimizer block, which waitlist mode hides (paid optimizer, P-1c).
    assert.match(rail, /const optimizerWaitlist = !useBookingActionsShown\(\) \|\| !optimizeShown\(caps\.data\);/);
    assert.match(rail, /\{isOwner && !optimizerWaitlist \? \(optimizerSlot \? createPortal\(optimizerBlock, optimizerSlot\) : optimizerBlock\) : null\}/);
    const blockStart = rail.indexOf("const optimizerBlock");
    assert.ok(blockStart > 0 && rail.indexOf("setBuildAroundOpen(true)", blockStart) > blockStart, "Build-around is inside the optimizer block");
    // Quick draft: owner + empty plan only — both placements read no mode.
    const draftRow = rail.slice(rail.indexOf("export function SlipDraftAiRow"), rail.indexOf("export function SlipDraftAiRow") + 3000);
    assert.doesNotMatch(draftRow, /useBookingActionsShown|useSignupMode/);
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /const emptyStartShown = isOwner && aiAction === "draft" && slipView === "list";/);
    // PLAN-1 (sanctioned edit): the map band is the owner mode's slots (MapControlCenter draws the box).
    assert.match(slip, /quickDraft: isOwner && aiAction === "draft" \? <SlipDraftAiRow trip=\{data\.trip\} tripId=\{tripId\} \/> : null,/);
    const emptyStart = read("client/src/components/plan/SlipEmptyStart.tsx");
    // Quick draft still reads no mode; only the handoff row uses HandoffChooser's waitlist gate.
    const draftCard = emptyStart.slice(
      emptyStart.indexOf('data-testid="slip-empty-draft-card"'),
      emptyStart.indexOf('data-testid="slip-empty-browse"'),
    );
    assert.ok(draftCard.length > 50, "expected the empty-start draft card");
    assert.doesNotMatch(draftCard, /useBookingActionsShown|useSignupMode|waitlist/);
    assert.match(emptyStart, /const waitlist = !useBookingActionsShown\(\);/);
    assert.match(emptyStart, /expertsAvailable && !waitlist \? \(/);
    assert.match(emptyStart, /data-testid="slip-empty-handoff"/);
    assert.doesNotMatch(emptyStart, /disabled=\{[^}]*waitlist/);
    // The Trip Card banner: dates confirmed (GATE-1) and the R-F rule — no mode read.
    assert.match(slip, /\{isPrimary && data\.trip && !guest && <TripCardPrimaryBanner trip=\{data\.trip\} \/>\}/);
    const banner = slip.slice(slip.indexOf("function TripCardPrimaryBanner"), slip.indexOf("function TripCardPrimaryBanner") + 1500);
    assert.doesNotMatch(banner, /useBookingActionsShown|useSignupMode|waitlist/i);
    // The dashboard row follows the banner: chosen dates only.
    assert.match(read("server/services/upcoming.service.ts"), /if \(!hasFinal && !trip\.finalizedAt && planDatesAreConfirmed\(trip\.datesConfirmedAt\)\) \{/);
  });

  it("R3-27 waitlist mode: Sign in to continue.", () => {
    const en = JSON.parse(read("client/src/locales/en/auth.json"));
    assert.equal(en.modal.descSignInWaitlist, "Sign in to continue.");
    assert.ok(JSON.parse(read("client/src/locales/ja/auth.json")).modal.descSignInWaitlist);
    assert.match(read("client/src/components/SignInModal.tsx"), /t\(travelerSignupShown \? "modal\.descSignInDefault" : "modal\.descSignInWaitlist"\)/);
  });
});
