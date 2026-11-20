/**
 * F1 (Leon, Nov 19, 2026): /services cards and the full-size city-feed cards draw their action row from the
 * action engine - Book or Hire, Add, "Ask an expert", Details - and "Ask an expert" opens the chooser.
 *
 *   T1 the table: every card type x mode -> the slots its row draws, in order
 *   T2 no priced action reaches a guest or a waitlist viewer from the engine, for any card type
 *   T3 the chooser's options: approved order, a kind with no expert is absent, the legacy role is a trip planner
 *   T4 the /services card, rendered: waitlist draws Add, "Ask an expert" and Details and no Book; Details is the
 *      listing's own page; no expert in the city -> no Ask; a message-only listing keeps Message
 *   T5 the Ask button: one label; a card that names an expert is direct (no chooser is mounted until a press)
 *   T6 source: the four full-size feed cards draw through CardActions, compact tiles keep ONE primary (R755),
 *      the sheet a tile opens carries the ask, and the retired Ask labels are gone from these files
 *
 * Run: npx tsx --test client/src/lib/__tests__/f1-card-actions.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { resolveActions, type ActionContext, type ContentItemType } from "../action-engine";
import { cardActionSlots, cardContentItem, type CardActionSlot, type CardContentInput } from "../card-actions";
import { askChoiceOptions, askChooserExpertsUrl } from "../ask-expert-chooser";
import { ASK_EXPERT_COPY } from "../ask-expert-copy";
import { PLAN_ACTIONS_COPY } from "../plan-actions";
import { expertAvailabilityUrl } from "../expert-availability";
import { AskExpertButton } from "../../components/ask-expert-button";
import { ServiceCard } from "../../pages/discover";
import { SignInModalProvider } from "../../contexts/SignInModalContext";

(globalThis as any).React = React;
const ROOT = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const MODES: Record<string, Pick<ActionContext, "mode" | "signedIn">> = {
  "waitlist guest": { mode: "waitlist", signedIn: false },
  "waitlist signed-in": { mode: "waitlist", signedIn: true },
  "open guest": { mode: "open", signedIn: false },
  "open signed-in": { mode: "open", signedIn: true },
};
const base: CardContentInput = { type: "listing", id: "x", title: "X", city: "Kyoto", placeable: true, bookable: false, hasExpert: true };
const CARDS: Record<string, { input: CardContentInput; slots: CardActionSlot[] }> = {
  "/services listing, bookable": { input: { ...base, bookable: true, detailHref: "/services/x" }, slots: ["book", "add", "ask_expert", "details"] },
  "/services listing, add only": { input: { ...base, detailHref: "/services/x" }, slots: ["add", "ask_expert", "details"] },
  "/services listing, message-only": { input: { ...base, placeable: false, detailHref: "/services/x" }, slots: ["ask_expert", "details"] },
  "feed gem": { input: { ...base, type: "gem", detailSheet: true }, slots: ["add", "ask_expert", "details"] },
  "feed gem with a listing to book": { input: { ...base, type: "gem", bookable: true, detailSheet: true }, slots: ["book", "add", "ask_expert", "details"] },
  "feed event": { input: { ...base, type: "event", detailSheet: true }, slots: ["add", "ask_expert", "details"] },
  "feed vendor": { input: { ...base, bookable: true, detailHref: "/services/x" }, slots: ["book", "add", "ask_expert", "details"] },
  "feed hotel": { input: { ...base, type: "hotel", detailSheet: true }, slots: ["add", "ask_expert", "details"] },
  "feed activity": { input: { ...base, type: "activity", detailSheet: true }, slots: ["add", "ask_expert", "details"] },
  "no expert in the city": { input: { ...base, type: "gem", hasExpert: false, detailSheet: true }, slots: ["add", "details"] },
  "nothing to open": { input: { ...base, type: "gem", hasExpert: false }, slots: ["add"] },
  "the sheet a tile opens": { input: { ...base, type: "gem", placeable: false }, slots: ["ask_expert"] },
};

function render(node: React.ReactNode, opts: { mode: "waitlist" | "open"; expertCity?: string | null }): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  qc.setQueryData(["/api/public/signup-mode"], { mode: opts.mode });
  qc.setQueryData(["/api/auth/user"], null);
  if (opts.expertCity) qc.setQueryData([expertAvailabilityUrl({ city: opts.expertCity })], { available: true });
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/services">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}
const order = (html: string, ids: string[]) => ids.map((id) => html.indexOf(`data-testid="${id}"`));

describe("F1 - card actions from the action engine", () => {
  it("T1 the table: card type x mode -> the row's slots", () => {
    for (const [card, { input, slots }] of Object.entries(CARDS)) {
      for (const [modeName, who] of Object.entries(MODES)) {
        const surface = card === "the sheet a tile opens" ? "sheet" : "card";
        const got = cardActionSlots(cardContentItem(input), { ...who, surface, density: "full" });
        assert.deepEqual(got, slots, `${card} / ${modeName}`);
      }
    }
  });

  it("T2 the engine hands no priced action to a guest or a waitlist viewer", () => {
    const types: ContentItemType[] = ["gem", "event", "city_event", "listing", "affiliate_product", "hotel", "activity", "expert", "viator", "deal", "recommendation"];
    for (const type of types) {
      for (const [modeName, who] of Object.entries(MODES)) {
        if (modeName === "open signed-in") continue;
        for (const density of ["compact", "full"] as const) {
          const item = cardContentItem({ ...base, type, bookable: true, detailHref: "/x" });
          const got = resolveActions(item, { ...who, surface: "card", density });
          const all = [...(got.primary ? [got.primary] : []), ...got.secondary];
          if (who.signedIn === false || who.mode === "waitlist") {
            // `hire` on a partner row is the one priced primary the engine allows a signed-out visitor in OPEN
            // mode; a card row never draws it from the engine (no `hire` slot), so it is out of F1's reach.
            const priced = all.filter((a) => a.priced && !(a.key === "hire" && who.mode === "open"));
            assert.deepEqual(priced.map((a) => a.key), [], `${type} / ${modeName} / ${density}`);
          }
        }
      }
    }
    // The row itself: Book and Hire are PlanActions outputs, hidden in waitlist mode by its own rule (T4).
    assert.ok(read("client/src/lib/card-actions.ts").includes("OPEN RULING"), "the open-mode signed-out Book question is written down where the rule lives");
  });

  it("T3 the chooser's options", () => {
    const experts = [
      { id: 7, role: "event_planner" },
      { id: 3, role: "expert" },
      { id: 4, role: "travel_expert" },
      { id: 9, role: "local_expert" },
      { id: 1, role: "provider" },
      { role: "local_expert" },
    ];
    assert.deepEqual(askChoiceOptions(experts), [
      { kind: "local_expert", expertId: "9" },
      { kind: "travel_expert", expertId: "3" },
      { kind: "event_planner", expertId: "7" },
    ]);
    assert.deepEqual(askChoiceOptions([{ id: 2, role: "local_expert" }]), [{ kind: "local_expert", expertId: "2" }], "a kind with no expert is absent");
    assert.deepEqual(askChoiceOptions(null), []);
    assert.deepEqual(askChoiceOptions({ error: "x" }), []);
    assert.equal(askChooserExpertsUrl("São Paulo"), "/api/experts?location=S%C3%A3o%20Paulo");
  });

  it("T4 the /services card, rendered", () => {
    const service: any = {
      id: "svc-f1", serviceName: "Tea ceremony", price: "40", location: "Kyoto", deliveryMethod: "in_person",
      buyAction: { primary: { kind: "request_to_book", label: "Request to book" }, landing: { store: "request" } },
    };
    const ids = ["button-add-to-cart-svc-f1", "button-service-ask-svc-f1", "button-service-details-svc-f1"];
    const wait = render(<ServiceCard service={service} onAddToCart={() => {}} />, { mode: "waitlist", expertCity: "Kyoto" });
    assert.doesNotMatch(wait, /data-testid="button-service-action-svc-f1"/, "waitlist: no Book");
    const at = order(wait, ids);
    assert.ok(at.every((i) => i > 0), `Add, Ask and Details all draw (${at})`);
    assert.deepEqual([...at].sort((a, b) => a - b), at, "in the engine's order: Add, Ask an expert, Details");
    assert.match(wait, new RegExp(`data-testid="button-service-ask-svc-f1"[^>]*>${ASK_EXPERT_COPY.button}<`));
    assert.match(wait, new RegExp(`href="/services/svc-f1"[^>]*data-testid="button-service-details-svc-f1"[^>]*>${PLAN_ACTIONS_COPY.details}<|data-testid="button-service-details-svc-f1"[^>]*href="/services/svc-f1"`));
    assert.doesNotMatch(wait, /ask-expert-chooser/, "the chooser is not mounted until a press");
    assert.doesNotMatch(wait, /showExperts/, "the ask no longer jumps to the services list");

    const noExpert = render(<ServiceCard service={service} onAddToCart={() => {}} />, { mode: "waitlist" });
    assert.doesNotMatch(noExpert, /button-service-ask-svc-f1/, "no expert in the city: no Ask");
    assert.match(noExpert, /button-service-details-svc-f1/, "Details does not depend on an expert");

    const open = render(<ServiceCard service={service} onAddToCart={() => {}} />, { mode: "open", expertCity: "Kyoto" });
    const openAt = order(open, ["button-service-action-svc-f1", ...ids]);
    assert.ok(openAt.every((i) => i > 0) && [...openAt].sort((a, b) => a - b).join() === openAt.join(), "open: Book leads, then Add, Ask, Details");

    const messageOnly: any = { ...service, id: "svc-msg", buyAction: { primary: { kind: "message", label: "Message" } } };
    const msg = render(<ServiceCard service={messageOnly} onAddToCart={() => {}} />, { mode: "open", expertCity: "Kyoto" });
    assert.match(msg, /data-testid="button-service-message-svc-msg"/, "a message-only listing keeps Message");
    assert.doesNotMatch(msg, /button-add-to-cart-svc-msg|button-service-action-svc-msg/, "and offers no add and no booking");
    assert.match(msg, /button-service-ask-svc-msg/);
    assert.match(msg, /button-service-details-svc-msg/);
  });

  it("T5 the Ask button is one label, and mounts no dialog before a press", () => {
    for (const direct of [null, { expertId: "42", fallbackName: "A curator" }]) {
      const html = render(<AskExpertButton testId="ask-x" city="Kyoto" subject="Gion" direct={direct} />, { mode: "waitlist" });
      assert.match(html, new RegExp(`data-testid="ask-x"[^>]*>${ASK_EXPERT_COPY.button}<`));
      assert.doesNotMatch(html, /ask-expert-chooser/);
    }
    const src = read("client/src/components/ask-expert-button.tsx");
    assert.match(src, /if \(directed\) void askExpert\(\{ \.\.\.base, \.\.\.direct \}\);\s*else setOpen\(true\);/, "a card that names an expert skips the chooser");
    assert.match(src, /askChoiceLabel\(o\.kind\)/, "the options read the approved labels");
    assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), />\s*[A-Z][a-z]+ [a-z]/, "and the component carries no words of its own");
  });

  it("T6 the feed cards, the compact tiles and the sheet", () => {
    const feed = read("client/src/components/city-feed-card.tsx");
    assert.equal((feed.match(/<CardActions\b/g) ?? []).length, 5, "four full-size rows and the sheet");
    for (const id of ["btn-ask-gem-", "btn-ask-event-", "btn-ask-svc-", "btn-ask-supply-", "btn-details-gem-", "btn-details-event-", "btn-details-svc-", "btn-details-supply-", "btn-ask-sheet-"]) {
      assert.ok(feed.includes(id), `${id} is drawn`);
    }
    assert.equal((feed.match(/layout="primary"/g) ?? []).length, 4, "the four compact tiles keep their ONE primary (R755)");
    assert.doesNotMatch(feed, /density="compact"[\s\S]{0,200}<CardActions|<CardActions[^>]*compact/, "no compact tile draws the row");
    assert.equal((feed.match(/<MoreInfoSheet\b[^>]*\bask=\{\{|<MoreInfoSheet\b[\s\S]{0,160}?\bask=\{\{/g) ?? []).length, 6, "every sheet a tile opens carries the ask");
    for (const [file, src] of [["city-feed-card.tsx", feed], ["discover.tsx", read("client/src/pages/discover.tsx")]] as const) {
      const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.doesNotMatch(code, /`Ask \$\{|Ask this expert|Ask the local|>\s*Ask an expert\s*</, `${file}: no Ask label of its own`);
      assert.doesNotMatch(code, /useAskExpert\(\)[\s\S]*askExpert\(\{ city,/, `${file}: no city ask outside the one button`);
    }
    assert.equal(PLAN_ACTIONS_COPY.details, "Details");
  });
});
