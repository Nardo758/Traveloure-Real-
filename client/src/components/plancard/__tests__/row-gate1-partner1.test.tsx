/**
 * GATE-1 + PARTNER-1 (ledger `2026-11-03-gate1-partner1`): the waitlist is the only traveler gate; partner text only
 * when reviewed.
 *
 *   T1 waitlist + signed out: a gem card, a supply card, a search result and the event drawer render "Save to plan";
 *      the press toasts "Saved to plan" and calls no dialog; "Sign In Required" is never drawn in waitlist mode.
 *   T2 open mode + signed out: today's labels and today's add path (the dialog) — unchanged.
 *   T3 the commission note: only with a usable partner link AND open mode; never in waitlist, even with a token.
 *   T5 the drawer with no reviewed description draws no "About" heading.
 *   T6 a browse tab with zero items → the empty state; /ready-made [] → empty, error → error, in flight → loading.
 *   T7 tripCardIsPrimary false while datesConfirmed false; TripCardPrimaryBanner draws nothing on a null state.
 *
 * Harness: react-dom/server with a QueryClient seeded with the signup mode and the session (queries disabled — nothing
 * is fetched). The sheet and the dialog render through Radix portals, which draw nothing on the server, so the drawer's
 * body (`EventSheetBody`) is rendered directly and the dialog's waitlist guard is pinned in its source.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-gate1-partner1.test.tsx
 */
import { describe, it } from "node:test";
import "../../__tests__/node-navigator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import type { CatalogueResult } from "@shared/catalogue-search";
import { tripCardBannerState, tripCardIsPrimary } from "@shared/trip-primary-surface";
import { SignInModalProvider } from "../../../contexts/SignInModalContext";
import { CityFeedCardGem, CityFeedCardSupply, EventSheetBody } from "../../city-feed-card";
import { CatalogueResultRow } from "../../catalogue-search-results";
import { useBrowseSaveToPlan } from "../../../lib/browse-save";
import { browseSavesToPlan } from "../../../lib/signup-mode";
import { BROWSE_EMPTY_COPY, PARTNER_COMMISSION_NOTE, browseTabEmptyShown, partnerCommissionShown } from "../../../lib/browse-supply";
import { READY_MADE_SHELF_COPY, readyMadeShelfState } from "../../../lib/ready-made-shelf-state";
import { WAITLIST_COPY } from "../../../lib/waitlist-copy";

(globalThis as any).React = React;

const ROOT = resolve(import.meta.dirname, "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const CITY = "Kyoto";

type Mode = "waitlist" | "open";

function render(node: React.ReactNode, mode: Mode, user: { id: string } | null = null): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  qc.setQueryData(["/api/public/signup-mode"], { mode });
  qc.setQueryData(["/api/auth/user"], user);
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/discover/location/kyoto">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

function text(html: string): string {
  return html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
}

const gem = { id: "g1", placeName: "Philosopher's Path", placeType: "temple" };
const supply = { id: "sup-1", name: "A tea house" };
const searchResult: CatalogueResult = {
  id: "listing:s2",
  kind: "listing",
  title: "Private dinner",
  action: { type: "add_to_plan" },
  addToPlan: { title: "Private dinner", providerServiceId: "s2" },
} as CatalogueResult;
const viatorResult: CatalogueResult = {
  id: "viator:1",
  kind: "partner_viator",
  title: "Arashiyama walk",
  action: { type: "book_on_site", site: "Viator", href: "https://www.viator.com/tours/x" },
  addToPlan: { title: "Arashiyama walk" },
} as CatalogueResult;

/** Captures the hook's answer during a server render (no effects run; the hook is a pure read of the seeded cache). */
function browseHookAnswer(mode: Mode, user: { id: string } | null) {
  let answer: ReturnType<typeof useBrowseSaveToPlan> | null = null;
  function Probe() {
    answer = useBrowseSaveToPlan();
    return null;
  }
  render(<Probe />, mode, user);
  assert.ok(answer);
  return answer as ReturnType<typeof useBrowseSaveToPlan>;
}

describe("GATE-1 + PARTNER-1", () => {
  it("T1 waitlist + signed out: gem, supply, search result and event drawer read 'Save to plan'; the press opens no dialog", () => {
    assert.equal(browseSavesToPlan("waitlist", false), true);
    for (const html of [
      render(<CityFeedCardGem gem={gem} city={CITY} onAdd={() => {}} />, "waitlist"),
      render(<CityFeedCardSupply item={supply} kind="supply-activity" city={CITY} onAdd={() => {}} />, "waitlist"),
      // CAP-2 Phase 3 (sanctioned edit): the row takes the searched city (its save's city), and the drawer's action is
      // PlanActions' save (placeable, with its saved-ref key).
      render(<ul><CatalogueResultRow result={searchResult} timeZone={null} city={CITY} onAdd={() => {}} /></ul>, "waitlist"),
      render(<EventSheetBody data={{ id: "ev-1", title: "Gion Matsuri" }} action={{ placeable: true, savedKey: "event:ev-1", city: CITY, onAdd: () => {} }} />, "waitlist"),
    ]) {
      assert.ok(text(html).includes(WAITLIST_COPY.saveToPlan), text(html).slice(0, 200));
      assert.ok(!text(html).includes("Sign In Required"));
      assert.ok(!text(html).includes("Add to plan"), "no 'Add to plan' left on the card");
    }
    // The press: the card's add path is replaced by the "Saved to plan" toast — the dialog opener is never called.
    const hook = browseHookAnswer("waitlist", null);
    assert.equal(hook.saveToPlan, true);
    let dialogOpened = 0;
    const opener = () => {
      dialogOpened++;
    };
    const wrapped = hook.wrapAdd(opener);
    assert.ok(wrapped && wrapped !== opener);
    wrapped({ title: "x" });
    assert.equal(dialogOpened, 0, "no dialog in waitlist mode for a signed-out viewer");
    const browseSave = read("client/src/lib/browse-save.ts");
    // GATE-1B (G-2, sanctioned edit): the press writes to the guest plan and toasts "Saved to plan" only on the
    // server's confirmation — never a bare toast (the bug G-2 names).
    // Lane 1 A-18 (sanctioned edit): the confirmed save's toast is "Saved to plan", or the not-on-the-map hint.
    assert.match(browseSave, /saveToGuestPlan\(body, city, chosenDate\)\.then\(\s*\(result\) => toast\(\{ title: guestSavedMessage\(result\) \}\),/);
    assert.doesNotMatch(browseSave, /return \(\) => toast\(\{ title: WAITLIST_COPY\.savedToPlan \}\);/);
    // "Sign In Required" is never reached in waitlist mode: the dialog returns before it, and the page's add path
    // and SaveToggle never open it / the sign-in modal.
    const dialog = read("client/src/components/add-to-experience-dialog.tsx");
    const guard = dialog.indexOf("if (waitlistSave) return null;");
    assert.ok(guard > 0 && guard < dialog.indexOf("<DialogTitle>Sign In Required</DialogTitle>"));
    assert.match(read("client/src/pages/discover-location.tsx"), /const handleAdd =\s*browseSave\.wrapAdd\(/);
    assert.match(read("client/src/components/SaveToggle.tsx"), /if \(saveToPlan\) toast\(\{ title: WAITLIST_COPY\.savedToPlan \}\);\s*else openSignInModal\(\);/);
    // Signed in, waitlist mode: today's path.
    assert.equal(browseHookAnswer("waitlist", { id: "u1" }).saveToPlan, false);
  });

  // CAP-2 Phase 3 (sanctioned edit): "Add to plan" is retired (ruling, Nov 6) — the save reads "Save to plan" in open
  // mode too. The open-mode PATH is unchanged: a signed-out viewer's press keeps the card's own add (the dialog).
  it("T2 open mode + signed out: 'Save to plan', and the dialog path, unchanged", () => {
    assert.equal(browseSavesToPlan("open", false), false);
    const gemHtml = text(render(<CityFeedCardGem gem={gem} city={CITY} onAdd={() => {}} />, "open"));
    assert.ok(gemHtml.includes(WAITLIST_COPY.saveToPlan));
    assert.ok(!gemHtml.includes("Add to plan"));
    const hook = browseHookAnswer("open", null);
    assert.equal(hook.saveToPlan, false);
    const opener = () => {};
    assert.equal(hook.wrapAdd(opener), opener, "open mode keeps the card's own add path (the dialog)");
  });

  it("T3 commission note only with a usable link AND open mode", () => {
    assert.equal(partnerCommissionShown(true, true), true);
    assert.equal(partnerCommissionShown(true, false), false);
    assert.equal(partnerCommissionShown(false, true), false);
    const tokenEvent = { id: "ev-2", title: "Candlelight", bookingToken: "tok-1" };
    assert.ok(text(render(<EventSheetBody data={tokenEvent} />, "open")).includes(PARTNER_COMMISSION_NOTE));
    assert.ok(!text(render(<EventSheetBody data={tokenEvent} />, "waitlist")).includes(PARTNER_COMMISSION_NOTE), "waitlist: none, even with a token");
    assert.ok(!text(render(<EventSheetBody data={{ id: "ev-3", title: "No link" }} />, "open")).includes(PARTNER_COMMISSION_NOTE));
    // The catalogue's Viator disclosure follows the same rule.
    const vOpen = render(<ul><CatalogueResultRow result={viatorResult} timeZone={null} city={CITY} onAdd={() => {}} /></ul>, "open");
    const vWait = render(<ul><CatalogueResultRow result={viatorResult} timeZone={null} city={CITY} onAdd={() => {}} /></ul>, "waitlist");
    assert.match(vOpen, /data-testid="catalogue-commission-viator:1"/);
    assert.doesNotMatch(vWait, /data-testid="catalogue-commission-viator:1"/);
    // Every remaining commission site reads the gate.
    const card = read("client/src/components/city-feed-card.tsx");
    assert.equal(card.match(/partnerCommissionShown\(/g)?.length, 3, "drawer + compact event + full event");
    const map = read("client/src/components/plancard/MapControlCenter.tsx");
    assert.equal(map.match(/partnerCommissionShown\(/g)?.length, 2, "partner price link + Viator row");
    assert.match(map, /caps\?\.signup\.purchasesAllowed === true/);
  });

  it("T5 the drawer with no reviewed description draws no About heading", () => {
    const none = render(<EventSheetBody data={{ id: "ev-4", title: "Gion Matsuri", description: null, shortDescription: "Supplier words" }} />, "open");
    assert.ok(!text(none).includes("About"));
    assert.ok(!text(none).includes("Supplier words"), "a supplier short description is never drawn");
    const reviewed = render(<EventSheetBody data={{ id: "ev-5", title: "Gion Matsuri", description: "Our words." }} />, "open");
    assert.ok(text(reviewed).includes("About"));
    assert.ok(text(reviewed).includes("Our words."));
  });

  it("T6 empty browse tab and /ready-made branches", () => {
    assert.equal(browseTabEmptyShown({ browseOn: true, loaded: true, count: 0, city: CITY }), true);
    assert.equal(browseTabEmptyShown({ browseOn: true, loaded: false, count: 0, city: CITY }), false, "never while loading");
    assert.equal(browseTabEmptyShown({ browseOn: true, loaded: true, count: 2, city: CITY }), false);
    assert.equal(browseTabEmptyShown({ browseOn: true, loaded: true, count: 0, city: "" }), false);
    assert.equal(BROWSE_EMPTY_COPY.tab(CITY), "Nothing here yet for Kyoto.");
    assert.match(read("client/src/components/plancard/MapControlCenter.tsx"), /data-testid="map-browse-empty"[\s\S]{0,80}BROWSE_EMPTY_COPY\.tab\(city\)/);

    assert.equal(readyMadeShelfState({ isLoading: false, isError: false, listings: [] }), "empty");
    assert.equal(readyMadeShelfState({ isLoading: false, isError: true, listings: undefined }), "error");
    assert.equal(readyMadeShelfState({ isLoading: true, isError: false, listings: undefined }), "loading");
    assert.equal(readyMadeShelfState({ isLoading: false, isError: false, listings: [{}] }), "ready");
    assert.equal(READY_MADE_SHELF_COPY.empty, "No Ready-Made plans yet.");
    const discover = read("client/src/pages/discover.tsx");
    for (const id of ["ready-made-loading", "ready-made-error", "ready-made-empty"]) assert.ok(discover.includes(`data-testid="${id}"`), id);
  });

  it("T7 the Trip Card waits for dates", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const inWindow = { startDate: "2026-11-11", endDate: "2026-11-14", now, finalizedAt: null };
    assert.equal(tripCardIsPrimary({ ...inWindow, datesConfirmed: false }), false);
    assert.equal(tripCardIsPrimary({ ...inWindow, datesConfirmed: true }), true);
    assert.equal(tripCardIsPrimary(inWindow), true, "a caller that states nothing about the dates is unchanged");
    assert.equal(tripCardBannerState({ ...inWindow, datesConfirmed: false, finalVersion: 3 }), null);
    const slip = read("client/src/components/plancard/SlipView.tsx");
    assert.match(slip, /datesConfirmed: planDatesAreConfirmed\(trip\.datesConfirmed \?\? null\),\s*\}\);\s*\/\/ GATE-1[^\n]*\n\s*if \(state === null\) return null;/);
    assert.match(slip, /datesConfirmed: planDatesAreConfirmed\(trip\?\.datesConfirmed \?\? null\)/);
  });
});
