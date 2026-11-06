/**
 * Lane 2 — one mode read for every booking action (ledger `2026-11-05-lane2-mode-read`; briefs A-3, A-7, K-10, A-28).
 *
 *   M1  the shared rule: booking actions show only in open mode; an unread mode hides them (fail-closed).
 *   M2  the tile rule: in waitlist mode no tile says Book, Book on partner or Check availability — the tile adds.
 *   M3  the service detail page: in waitlist mode no book, request or hire control, no ask line, no refusal about
 *       booking and no payment claim; add-to-plan stays.
 *   M4  every listed site reads the shared rule (source pins, one per site).
 *   M5  the guard: a traveler-facing file that draws a booking label must read the shared rule (or the tile rule
 *       that reads it, or the service-detail filter). A new booking CTA without the mode read fails here.
 *   M6  A-7: traveler sign-up is hidden in waitlist mode in the header menu and the sign-in modal; a supply sign-up
 *       is not.
 *
 * Run: npx tsx --test client/src/lib/__tests__/lane2-mode-read.test.ts
 */
import { planActionsVisible } from "../plan-actions";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { bookingActionsShown } from "../signup-mode";
import { tileActionLabel } from "../bento-action-state";
import { serviceDetailBuyRender, withoutBookingActions } from "../service-buy-action";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("Lane 2 mode read", () => {
  it("M1 shows booking actions only in open mode", () => {
    assert.equal(bookingActionsShown("open"), true);
    assert.equal(bookingActionsShown("waitlist"), false);
  });

  it("M2 no tile books in waitlist mode", () => {
    // CAP-2 Phase 3 (sanctioned edit): a tile's save / book is PlanActions'. In waitlist mode it draws the save and
    // never a Book, whatever the card asks for; in open mode the Book draws.
    const intent = { save: { placeable: true }, book: { variant: "availability" as const } };
    assert.deepEqual(planActionsVisible({ mode: "waitlist", capabilities: undefined, site: "bento", intent }), { save: true, book: false, hire: false, moreInfo: false, browse: false });
    assert.equal(planActionsVisible({ mode: "open", capabilities: undefined, site: "bento", intent }).book, true);
    assert.equal(tileActionLabel("vendor-service"), null, "the tile label table no longer words a save or a book");
    assert.equal(tileActionLabel("recommendation"), null);
  });

  it("M3 the service detail page keeps only add-to-plan in waitlist mode", () => {
    const action: any = {
      primary: { kind: "book", label: "Book now" },
      secondary: { kind: "add_to_plan", label: "Add to plan" },
      ask: ["date"],
      landing: { store: "checkout" },
      refusal: null,
    };
    const open = serviceDetailBuyRender(action);
    assert.ok(open.book && open.add && open.platformCharge);
    const shut = withoutBookingActions(open);
    assert.equal(shut.book, null);
    assert.equal(shut.request, null);
    assert.equal(shut.hire, null);
    assert.deepEqual(shut.asks, []);
    assert.equal(shut.refusal, null);
    assert.equal(shut.platformCharge, false);
    assert.equal(shut.add?.label, "Add to plan");
    assert.equal(shut.noBuyControl, false);
    assert.equal(withoutBookingActions(serviceDetailBuyRender({ ...action, secondary: null })).noBuyControl, true);
  });

  it("M4 every listed site reads the shared rule", () => {
    const pins: Array<[string, RegExp]> = [
      ["client/src/components/city-feed-card.tsx", /function BookingBadge[\s\S]{0,200}if \(!shown\) return null;/],
      ["client/src/components/city-feed-card.tsx", /if \(!bookingShown && !isRequest && !isExpertSuggestion\) return null;/],
      ["client/src/components/landing/landing-hero.tsx", /const price = bookingShown \? derivePreviewPrice\(slot\.listing\) : null;/],
      ["client/src/components/storefront/StorefrontBookingPanel.tsx", /if \(kind === "provider" && !bookingShown\) return null;[\s\S]*if \(kind === "provider" && !bookingShown\) return null;/],
      ["client/src/pages/storefront.tsx", /const noBooking = bookingClosed \|\| !bookingShown;/],
      ["client/src/pages/service-detail.tsx", /const buy = bookingShown \? serviceDetailBuyRender\(service\.buyAction\) : withoutBookingActions\(/],
      ["client/src/pages/service-detail.tsx", /\{bookingShown && \(<>\s*\{isRoom \? \(/],
      ["client/src/pages/service-detail.tsx", /\{bookingShown && hasLeadTime && \(/],
      ["client/src/pages/ready-made-detail.tsx", /\{purchaseCopyShown && \(<>/],
      ["client/src/pages/providers-directory.tsx", /\{bookingShown && provider\.instantBooking && \(/],
      // R3-24 (A-3 regression): the plan's lodging panel — "Stay here" and "See rates".
      ["client/src/components/plan/AnchorPanel.tsx", /const bookingShown = useBookingActionsShown\(\);/],
      ["client/src/components/plan/AnchorPanel.tsx", /bookingShown=\{bookingShown\}/],
      ["client/src/components/plan/AnchorPanel.tsx", /\{bookingShown && h\.kind === "liteapi" \? <StayRatesRow/],
      // CAP-2 Phase 3 (sanctioned edit): the tile book / stay / rates controls moved into PlanActions, whose Book draws
      // only on the shared mode read; the sites pass intent and the view passes its wrapper's read.
      ["client/src/lib/plan-actions.ts", /book: !!input\.intent\.book && open,/],
      ["client/src/components/plan/PlanActions.tsx", /const read = useSignupMode\(\)\.mode;/],
      ["client/src/components/plan/AnchorPanel.tsx", /\{canChoose && bookingShown \? \([\s\S]{0,200}<PlanActions\s+site="anchor"\s+bookingShown=\{bookingShown\}/],
    ];
    for (const [file, re] of pins) assert.match(read(file), re, file);
    // The P-1c reads on the plan surfaces are the shared rule now, not a second copy of it.
    for (const file of walk("client/src")) {
      if (file.includes("__tests__") || file === "client/src/lib/signup-mode.ts") continue;
      assert.doesNotMatch(stripComments(read(file)), /useSignupMode\(\)\.mode === "(waitlist|open)"/, `${file} reads the mode itself — use useBookingActionsShown`);
    }
  });

  it("M5 a traveler file that draws a booking label reads the shared rule", () => {
    const LABEL = /(["'`>]\s*)(Book now|Book Now|Check availability|Instant booking|Book via Traveloure|Book on Traveloure|Book this leg)(\s*["'`<])/;
    // CAP-2 Phase 3 (sanctioned edit): a file whose booking control is PlanActions' reads the rule through it.
    const READS = /useBookingActionsShown|withoutBookingActions|tileActionLabel\(|<PlanActions\b|usePlanActionsVisible\(/;
    // Not traveler surfaces, or a label only in a comment / a label table read through a gated caller.
    const NOT_TRAVELER: Record<string, string> = {
      "client/src/components/backoffice/booking-mode-toggle.tsx": "seller backoffice: what travelers will see",
      "client/src/lib/booking-mode-prompt.ts": "seller backoffice prompt",
      "client/src/lib/tile-action-copy.ts": "the label table; read only through tileActionLabel",
      "client/src/lib/plan-actions.ts": "PlanActions' label table; read only through PlanActions, which reads the shared rule",
      "client/src/lib/storefront-offering-action.ts": "the label mapper; its two callers (storefront, discover) gate it",
    };
    const offenders: string[] = [];
    for (const file of walk("client/src")) {
      if (file.includes("__tests__") || NOT_TRAVELER[file]) continue;
      const code = stripComments(read(file));
      if (LABEL.test(code) && !READS.test(code)) offenders.push(file);
    }
    assert.deepEqual(offenders, [], "a booking label drawn without the shared mode read");
  });

  // R4-7 (round 4): a price on a traveler tile is booking copy too — a file that draws a nightly / per-unit price
  // suffix must read the shared rule. The unit helper and the seller console are named.
  it("M7 a traveler file that draws a price suffix reads the shared rule", () => {
    const PRICE = /(["'`>]\s*)(\/night|\/person|\/day|per night)(\s*["'`<])/;
    const READS = /useBookingActionsShown|withoutBookingActions|<PlanActions\b|usePlanActionsVisible\(/;
    const NAMED: Record<string, string> = {
      "client/src/lib/price-unit.ts": "the unit-suffix helper; its callers are gated",
      "client/src/pages/provider/property-create.tsx": "seller console, not a traveler surface",
    };
    const offenders: string[] = [];
    for (const file of walk("client/src")) {
      if (file.includes("__tests__") || NAMED[file]) continue;
      const code = stripComments(read(file));
      if (PRICE.test(code) && !READS.test(code)) offenders.push(file);
    }
    assert.deepEqual(offenders, [], "a tile price drawn without the shared mode read");
    assert.match(read("client/src/components/travelpulse/CityCard.tsx"), /const showAvgPrice = bookingShown && isPositive\(avgPriceNum\);/);
    assert.match(read("client/src/pages/deals.tsx"), /\{!bookingShown \? null : formattedPrice \? \(/);
  });

  it("M6 traveler sign-up is hidden in waitlist mode", () => {
    const menu = read("client/src/components/user-menu.tsx");
    assert.match(menu, /const travelerSignupShown = useTravelerSignupShown\(\);/);
    assert.match(menu, /\{travelerSignupShown && \(\s*<Button[\s\S]*?data-testid="button-sign-up"/);
    const modal = read("client/src/components/SignInModal.tsx");
    assert.match(modal, /const travelerSignupShown = useTravelerSignupShown\(\) \|\| intent === "supply";/);
    assert.match(modal, /!travelerSignupShown \? null : <>\s*\{t\("modal\.noAccount"\)\}/);
  });
});

/** JSX comments, block comments and line comments out; strings are left as they are. */
function stripComments(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .split("\n")
    .map((line) => (/^\s*(\/\/|\*|\/\*)/.test(line) ? "" : line))
    .join("\n");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(resolve(ROOT, dir))) {
    const full = join(resolve(ROOT, dir), name);
    const rel = relative(ROOT, full);
    if (statSync(full).isDirectory()) out.push(...walk(rel));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(rel);
  }
  return out;
}
