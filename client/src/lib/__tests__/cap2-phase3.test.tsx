/**
 * CAP-2 Phase 3 — PlanActions (ledger `2026-11-06-cap2-phase3-plan-actions`; dispatch rulings 5–6, scope rulings Nov 6).
 *
 *   P1 the pure rule: Save when placeable · Book in open mode only (the shared mode read) · Hire in open mode AND the
 *      guest-capabilities answer's `hire` · More info per site (off on bento) · Browse only in waitlist mode.
 *   P2 the Book words follow the listing's booking mode; the server buy action maps to Book / Hire / Save / nothing.
 *   P3 the add is "Add to plan" / "Add to Day {n}" everywhere (cut-list #1 slice C supersedes the Nov 6 "Save to plan") and "Added ✓" once confirmed.
 *   P4 the renderer: waitlist draws no Book; open draws it; a compact tile draws one primary; a confirmed save is inert.
 *   P5 the GUARD: a traveler-facing file that draws a save / book / hire / more-info label without PlanActions fails.
 *      Label tables and the ruled-out surfaces are named, each with its reason; the list only shrinks.
 *   P6 every Phase 3 site renders through PlanActions, and the public guest-capabilities read carries no price.
 *   P7 the sites a local build cannot reach with data (Discover service and result cards, curated content, Deals),
 *      rendered in both modes: waitlist draws no Book; open draws the mode-honest Book; the add reads "Add to plan".
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/cap2-phase3.test.tsx
 */
import { describe, it, beforeEach } from "node:test";
import "../../components/__tests__/node-navigator";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import {
  bookLabel,
  feedSaveIntent,
  guestCapabilitiesUrl,
  PLAN_ACTIONS_COPY,
  PLAN_ACTIONS_SITES,
  planActionFromBuyAction,
  planActionsPrimary,
  planActionsVisible,
  saveLabel,
} from "../plan-actions";
import { savedRefKey } from "../saved-refs";
import { GUEST_PLAN_QUERY_KEY } from "../waitlist-guest-plan";
import { PlanActions } from "../../components/plan/PlanActions";
import { UnifiedResultCard } from "../../components/unified-result-card";
import { CuratedCard } from "../../components/curated-content-section";
import { DealCard } from "../../pages/deals";
import { ServiceCard } from "../../pages/discover";
import { SignInModalProvider } from "../../contexts/SignInModalContext";

(globalThis as any).React = React;

const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let planKeys: string[] | null = null;
function render(node: React.ReactNode, mode: "waitlist" | "open", caps?: unknown): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  qc.setQueryData(["/api/public/signup-mode"], { mode });
  if (caps) qc.setQueryData([guestCapabilitiesUrl("Kyoto")], caps);
  // R4b-3: "Saved to plan" reads the signed-in plan's keys from the server answer.
  // On the guest rail (one plan) a saved action is inert; signed in it stays pressable (R4b-3 ruling).
  if (planKeys) {
    qc.setQueryData(["/api/auth/user"], null);
    qc.setQueryData(GUEST_PLAN_QUERY_KEY, { plan: {}, items: planKeys.map((k, i) => { const [t, c] = k.split(":"); return t === "listing" ? { id: `i${i}`, providerServiceId: c } : { id: `i${i}`, contentType: t, contentId: c }; }), retentionDays: null });
  }
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/discover/location/kyoto">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("CAP-2 Phase 3 — PlanActions", () => {
  beforeEach(() => {
    planKeys = null;
  });

  it("P1 the pure rule, fail-closed", () => {
    const all = { save: { placeable: true }, book: { variant: "instant" as const }, hire: {}, moreInfo: {}, browse: { category: "Photographers" } };
    const caps = { mode: "open", actions: { save: true, book: true, hire: true } };
    const wait = planActionsVisible({ mode: "waitlist", capabilities: caps, site: "catalogue", intent: all });
    assert.deepEqual(wait, { save: true, book: false, hire: false, moreInfo: true, browse: true });
    const open = planActionsVisible({ mode: "open", capabilities: caps, site: "catalogue", intent: all });
    assert.deepEqual(open, { save: true, book: true, hire: true, moreInfo: true, browse: false });
    // Hire needs the area answer: unread, or "no expert here", hides it; Book does not depend on it.
    assert.equal(planActionsVisible({ mode: "open", capabilities: undefined, site: "catalogue", intent: all }).hire, false);
    assert.equal(planActionsVisible({ mode: "open", capabilities: { mode: "open", actions: { hire: false } }, site: "catalogue", intent: all }).hire, false);
    assert.equal(planActionsVisible({ mode: "open", capabilities: undefined, site: "catalogue", intent: all }).book, true);
    // 302b stands: no More info on a bento tile, whatever the card asks for.
    assert.equal(PLAN_ACTIONS_SITES.bento.moreInfo, false);
    assert.equal(planActionsVisible({ mode: "open", capabilities: caps, site: "bento", intent: all }).moreInfo, false);
    // Not placeable ⇒ no save.
    assert.equal(planActionsVisible({ mode: "open", capabilities: caps, site: "bento", intent: { save: { placeable: false } } }).save, false);
    // One primary: Book when it draws, else Save.
    assert.equal(planActionsPrimary(open), "book");
    assert.equal(planActionsPrimary(wait), "save");
  });

  it("P2 the Book words follow the booking mode", () => {
    assert.equal(bookLabel("instant"), "Book");
    assert.equal(bookLabel("request"), "Request to book");
    assert.equal(bookLabel("quote"), "Request a quote");
    assert.equal(bookLabel("partner"), "Book on partner");
    assert.equal(bookLabel("availability"), "Check availability");
    assert.equal(bookLabel("stay_here"), "Stay here");
    assert.equal(bookLabel("see_rates"), "See rates");
    assert.equal(bookLabel("request", { done: true }), "Requested");
    assert.equal(PLAN_ACTIONS_COPY.hire, "Hire for this trip");
    assert.equal(PLAN_ACTIONS_COPY.browseCategory("Photographers"), "Browse Photographers");
    assert.deepEqual(planActionFromBuyAction({ primary: { kind: "book" } }), { output: "book", variant: "instant" });
    assert.deepEqual(planActionFromBuyAction({ primary: { kind: "request_to_book" } }), { output: "book", variant: "request" });
    assert.deepEqual(planActionFromBuyAction({ primary: { kind: "agent_rail" } }), { output: "book", variant: "request" });
    assert.deepEqual(planActionFromBuyAction({ primary: { kind: "request_quote" } }), { output: "book", variant: "quote" });
    assert.deepEqual(planActionFromBuyAction({ primary: { kind: "book" }, refusal: { reason: "no_published_price" } }), { output: "book", variant: "quote" });
    assert.deepEqual(planActionFromBuyAction({ primary: { kind: "hire" } }), { output: "hire" });
    assert.deepEqual(planActionFromBuyAction({ primary: { kind: "add_to_plan" } }), { output: "save" });
    assert.equal(planActionFromBuyAction({ primary: { kind: "message" } }), null);
    assert.equal(planActionFromBuyAction({ primary: { kind: "book" }, refusal: { reason: "not_available" } }), null);
  });

  // Cut-list #1 slice C (ledger `2026-11-11-cutlist1-slice-c-add-actions`): the add reads "Add to plan" / "Add to Day
  // {n}", "Added ✓" once confirmed — superseding the Nov 6 "Save to plan" for the add action.
  it("P3 the add is 'Add to plan' everywhere (or 'Add to Day {n}'), 'Added ✓' once confirmed", () => {
    assert.equal(saveLabel(false), "Add to plan");
    assert.equal(saveLabel(false, 3), "Add to Day 3");
    assert.equal(saveLabel(true), "Added ✓");
    assert.ok(!Object.values(PLAN_ACTIONS_COPY).includes("Save to plan" as any), "'Save to plan' is superseded for the add");
    // A card that names its row is placeable; a Viator result names none (ruling, Nov 5).
    assert.deepEqual(feedSaveIntent({ type: "gem", sourceContentId: "g1" }, "Kyoto"), { placeable: true, savedKey: "gem:g1" });
    assert.deepEqual(feedSaveIntent({ type: "activity", viatorProductCode: "V1" }, "Kyoto"), { placeable: false, savedKey: null });
    assert.equal(savedRefKey({ kind: "listing", source_id: "s1" }), "listing:s1");
  });

  it("P4 the renderer: mode, one primary, the confirmed save", () => {
    const node = (
      <PlanActions
        site="bento"
        city="Kyoto"
        book={{ variant: "availability", testId: "b", href: "/services/s1" }}
        save={{ placeable: true, savedKey: "listing:s1", testId: "s", onClick: () => {} }}
      />
    );
    const wait = render(node, "waitlist");
    assert.doesNotMatch(wait, /data-testid="b"/, "waitlist: no Book");
    assert.match(text(wait), /Add to plan/);
    const open = render(node, "open");
    assert.match(open, /data-testid="b"[^>]*>Check availability</);
    assert.match(open, /data-testid="s"[^>]*><span[^>]*>Add to plan</);
    // A compact tile: one primary only.
    const primary = render(
      <PlanActions site="bento" layout="primary" primaryAttr="" book={{ variant: "availability", testId: "b" }} save={{ placeable: true, testId: "s" }} />,
      "open",
    );
    assert.equal((primary.match(/data-bento-primary-action=/g) ?? []).length, 1);
    assert.doesNotMatch(primary, /data-testid="s"/);
    // Added: the guest plan's items on the server hold the row (R4b-3) ⇒ "Added ✓", disabled (guest rail).
    planKeys = ["listing:s1"];
    const saved = render(node, "waitlist");
    assert.match(saved, /data-testid="s"[^>]*disabled=""[^>]*><span[^>]*>Added ✓</);
    // Hire: open mode and an approved expert in the area.
    const hire = <PlanActions site="discoverService" city="Kyoto" hire={{ testId: "h" }} />;
    assert.doesNotMatch(render(hire, "open"), /data-testid="h"/, "no area answer ⇒ no Hire");
    assert.match(render(hire, "open", { mode: "open", actions: { save: true, book: true, hire: true } }), /data-testid="h"[^>]*>Hire for this trip</);
    assert.doesNotMatch(render(hire, "waitlist", { mode: "waitlist", actions: { save: true, book: false, hire: false } }), /data-testid="h"/);
    // The caller's own mode read wins when passed (AnchorPanel's view).
    assert.match(render(<PlanActions site="anchor" bookingShown book={{ variant: "stay_here", testId: "st" }} />, "waitlist"), />Stay here</);
  });

  it("P5 the guard: no save / book / hire / more-info label outside PlanActions", () => {
    const LABEL = /(["'`>]\s*)(Save to plan|Saved to plan|Add to plan|Add to Plan|Add to trip|Book|Book now|Book Now|Request to book|Request a quote|Book on partner|Book via Traveloure|Book on Viator|Check availability|Stay here|See rates|Hire for this trip|More info|Reserve)(\s*["'`<])/;
    // Every file here is named with its reason (ruling, Nov 6, unless stated). The list only shrinks.
    const NAMED: Record<string, string> = {
      "client/src/lib/plan-actions.ts": "PlanActions' own label table",
      "client/src/lib/waitlist-copy.ts": "the approved Save to plan / Saved to plan strings the P-1c stand-ins read",
      "client/src/lib/add-to-plan.ts": "cut-list #1 slice C: the add action's approved strings AddToPlanButton and PlanActions read",
      "client/src/lib/stay-card.ts": "the approved Stay here / See rates strings PlanActions reads",
      "client/src/lib/storefront-offering-action.ts": "the buy-action wording mapper; its tile callers render through PlanActions and read it only for the intent hash",
      "client/src/components/backoffice/booking-mode-toggle.tsx": "seller backoffice, not a traveler surface",
      "client/src/lib/booking-mode-prompt.ts": "seller backoffice, not a traveler surface",
      "client/src/pages/expert/dmo-library.tsx": "expert console, not a traveler surface",
      "client/src/lib/catalog-preview-presentation.ts": "the seller console's listing preview (the landing hero reads only its price)",
      "client/src/components/plan/LegRow.tsx": "in-plan leg row, not a tile (ruling: in-plan surfaces stay)",
      "client/src/components/plancard/SlipView.tsx": "in-plan slip, not a tile (ruling: in-plan surfaces stay)",
      "client/src/components/plancard/TransportSection.tsx": "in-plan transport, not a tile (ruling: in-plan surfaces stay)",
      "client/src/pages/plan-compare.tsx": "in-plan compare, not a tile",
      "client/src/lib/stay-booking.ts": "in-plan stay booking, not a tile",
      "client/src/components/travelpulse/CityCard.tsx": "a caller-passed season link, not a PlanActions output",
    };
    const offenders: string[] = [];
    for (const file of walk("client/src")) {
      if (file.includes("__tests__") || NAMED[file]) continue;
      if (LABEL.test(stripComments(read(file)))) offenders.push(file);
    }
    assert.deepEqual(offenders, [], "a save / book / hire label drawn outside PlanActions");
    for (const file of Object.keys(NAMED)) assert.ok(LABEL.test(stripComments(read(file))), `${file} no longer needs naming — remove it`);
  });

  it("P6 every Phase 3 site renders through PlanActions; the public read carries no price", () => {
    for (const f of [
      "client/src/components/city-feed-card.tsx",
      "client/src/components/city-feed-card-recommendation.tsx",
      "client/src/components/catalogue-search-results.tsx",
      "client/src/components/plan/AnchorPanel.tsx",
      "client/src/components/storefront/StorefrontBookingPanel.tsx",
      "client/src/components/landing/landing-hero.tsx",
      "client/src/components/curated-content-section.tsx",
      "client/src/pages/deals.tsx",
      "client/src/pages/discover.tsx",
      "client/src/pages/storefront.tsx",
      "client/src/components/unified-result-card.tsx",
      "client/src/components/spontaneous-discovery.tsx",
    ]) {
      assert.match(read(f), /<PlanActions\b/, f);
      assert.doesNotMatch(stripComments(read(f)), /<SaveToPlanButton\b/, `${f}: SaveToPlanButton is replaced`);
    }
    const route = read("server/routes/launch-public.routes.ts");
    const i = route.indexOf("export async function guestCapabilitiesFor");
    assert.ok(i > 0);
    const body = route.slice(i, route.indexOf('router.get("/api/public/guest-capabilities"', i) + 400);
    assert.doesNotMatch(body, /price|fee|amount|cents/i, "the guest-capabilities read carries no price");
    assert.match(body, /hire = \(await expertAvailabilityForMarket\(key\)\)\.canAsk/);
  });
});

describe("CAP-2 Phase 3 — the sites without local data, rendered in both modes (P7)", () => {
  it("P7a the Discover service card: Book by booking mode in open mode only; the save reads Add to plan (slice C)", () => {
    const service: any = {
      id: "svc-p7", serviceName: "Tea ceremony", price: "40", location: "Kyoto", deliveryMethod: "in_person",
      buyAction: { primary: { kind: "request_to_book", label: "Request to book" }, landing: { store: "request" } },
    };
    const node = <ServiceCard service={service} onAddToCart={() => {}} />;
    const wait = render(node, "waitlist");
    assert.doesNotMatch(wait, /data-testid="button-service-action-svc-p7"/, "waitlist: no Book");
    assert.match(wait, /data-testid="button-add-to-cart-svc-p7"[^>]*><span[^>]*>Add to plan</);
    const open = render(node, "open");
    assert.match(open, /data-testid="button-service-action-svc-p7"[^>]*>Request to book</);
    assert.match(open, /data-testid="button-add-to-cart-svc-p7"[^>]*><span[^>]*>Add to plan</);
    const hire: any = { ...service, id: "svc-hire", buyAction: { primary: { kind: "hire", label: "Hire for this trip" }, landing: { store: "hire" } } };
    assert.doesNotMatch(render(<ServiceCard service={hire} />, "open"), /Hire for this trip/, "no area answer ⇒ no Hire");
    assert.match(render(<ServiceCard service={hire} />, "open", { mode: "open", actions: { save: true, book: true, hire: true } }), />Hire for this trip</);
  });

  it("P7b the Discover search-result card: the agent request and a partner's booking in open mode only", () => {
    const agent: any = { id: "r1", title: "Kaiseki dinner", source: "viator", isPartner: true, bookingToken: "tok" };
    assert.doesNotMatch(render(<UnifiedResultCard result={agent} />, "waitlist"), /data-testid="button-view-r1"/);
    assert.match(render(<UnifiedResultCard result={agent} />, "open"), /data-testid="button-view-r1"[^>]*>(<svg[\s\S]*?<\/svg>)?Request to book</);
    const site: any = { id: "r2", title: "Kyoto museum", source: "local", isPartner: false, websiteUrl: "https://example.org" };
    assert.match(render(<UnifiedResultCard result={site} />, "waitlist"), />View</, "a venue's own site keeps View in any mode");
  });

  it("P7c curated content: Book on partner / Book in open mode only; Add to plan (slice C) when it names its partner product", () => {
    const base: any = { id: "c1", sourceId: "s", type: "affiliate", contentCategory: "activity", title: "Tea", description: "", cover_image: null, price: null, price_display: null, source: "x", rating: null, city: "Kyoto", country: "Japan", duration: null, highlights: [], metadata: {}, tracking: { productId: "ap-1", partnerId: null, isAffiliateTracked: true } };
    const aff = { ...base, affiliate_url: "https://partner.example" };
    const wait = render(<CuratedCard item={aff} onAddToTrip={() => {}} />, "waitlist");
    assert.doesNotMatch(wait, /button-book-via-traveloure-c1/);
    assert.match(wait, /data-testid="button-add-trip-c1"[^>]*>(<svg[\s\S]*?<\/svg>)?<span[^>]*>Add to plan</);
    assert.match(render(<CuratedCard item={aff} onAddToTrip={() => {}} />, "open"), /data-testid="button-book-via-traveloure-c1"[^>]*>(<svg[\s\S]*?<\/svg>)?Book on partner</);
    const none = { ...base, affiliate_url: null, tracking: { productId: null, partnerId: null, isAffiliateTracked: false } };
    const noneOpen = render(<CuratedCard item={none} onAddToTrip={() => {}} />, "open");
    assert.doesNotMatch(noneOpen, /button-add-trip-c1/, "no partner product ⇒ not placeable ⇒ no save");
    assert.match(noneOpen, /data-testid="button-book-now-c1"[^>]*>(<svg[\s\S]*?<\/svg>)?Book</);
    const priced = { ...none, price: "30" };
    assert.doesNotMatch(render(<CuratedCard item={priced} onAddToTrip={() => {}} />, "open"), /Not available yet|button-book-now-c1/, "no checkout ⇒ nothing, never a dead button");
  });

  it("P7d Deals: the booking-agent request in open mode only; no dead 'Unavailable'", () => {
    const deal: any = { id: "d1", type: "hotel", title: "Ryokan", destination: "Kyoto", price: null, currency: "USD", rating: null, reviewCount: null, imageUrl: null, bookingToken: "tok", provider: "p", providerLabel: "Partner", featured: false };
    assert.doesNotMatch(render(<DealCard deal={deal} idx={0} />, "waitlist"), /data-testid="button-book-d1"/);
    assert.match(render(<DealCard deal={deal} idx={0} />, "open"), /data-testid="button-book-d1"[^>]*>Request to book</);
    const tokenless = { ...deal, id: "d2", bookingToken: null };
    assert.doesNotMatch(render(<DealCard deal={tokenless} idx={0} />, "open"), /Unavailable|button-book-d2/);
  });
});

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
