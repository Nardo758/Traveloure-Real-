/**
 * Action engine rev 3 (Nov 13) — one case per rule the spec states.
 *
 * The engine carries no copy: every action reports a labelKey, so the assertions are about KEYS, order and
 * gating, never about wording.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_KEYS,
  ITEM_MENU_KEYS,
  SECONDARY_ORDER,
  askExpertAllowed,
  bookAllowed,
  officialSiteAllowed,
  pricedAllowed,
  resolveActions,
  saveAllowed,
  shareAllowed,
  type ActionContext,
  type ContentItem,
} from "../action-engine";

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  type: "gem",
  id: "x1",
  title: "A place",
  city: "Kyoto",
  origin: "platform",
  placeable: true,
  bookable: false,
  priced: false,
  hasExpert: false,
  detailHref: "/places/kyoto",
  officialUrl: null,
  publicOk: null,
  partnerSource: "none",
  shareUrl: "https://traveloure.example/places/kyoto",
  ...over,
});

const card = (over: Partial<ActionContext> = {}): ActionContext => ({
  mode: "open",
  signedIn: true,
  surface: "card",
  density: "full",
  ...over,
});

test("rule 1: primary per kind — Add for gems/events/activities, Book for a bookable hotel", () => {
  for (const type of ["gem", "event", "city_event", "activity"] as const) {
    assert.equal(resolveActions(item({ type }), card()).primary?.key, "add", type + " leads with Add");
  }
  const hotel = item({ type: "hotel", bookable: true, priced: true, placeable: true });
  assert.equal(resolveActions(hotel, card()).primary?.key, "book", "a bookable hotel leads with Book");
  // Add moves to the sheet: still offered, never the primary.
  assert.deepEqual(resolveActions(hotel, card()).secondary.map((a) => a.key), ["add", "details", "save", "share"]);
});

test("rule 1: a bookable hotel in waitlist leads with Add and never shows Book", () => {
  const hotel = item({ type: "hotel", bookable: true, priced: true });
  const got = resolveActions(hotel, card({ mode: "waitlist", signedIn: false }));
  assert.equal(got.primary?.key, "add");
  assert.ok(!got.secondary.some((a) => a.key === "book"), "no Book in waitlist");
  assert.ok(![got.primary?.key, ...got.secondary.map((a) => a.key)].includes("book"));
});

test("rule 1: on surface=plan the primary is Details, and the 4+1 menu is offered", () => {
  const got = resolveActions(item(), { mode: "open", signedIn: true, surface: "plan" });
  assert.equal(got.primary?.key, "details");
  assert.equal(got.primary?.href, "/places/kyoto");
  assert.deepEqual(got.itemMenu, [...ITEM_MENU_KEYS]);
  assert.ok(!got.secondary.some((a) => a.key === "book"), "no Book on the plan surface");
});

test("rule 2: Ask an expert is NOT gated like Book — unpriced and present in waitlist", () => {
  const expert = item({ type: "expert", placeable: false, hasExpert: true, priced: false, detailHref: "/p/abc" });
  const waitlist = resolveActions(expert, card({ mode: "waitlist", signedIn: false }));
  assert.equal(waitlist.primary?.key, "ask_expert");
  assert.equal(waitlist.primary?.priced, false, "the human ask is never priced");
  assert.equal(askExpertAllowed(expert, { mode: "waitlist", signedIn: false, surface: "card" }), true);
  // An expert with no availability falls back to Details.
  assert.equal(resolveActions({ ...expert, hasExpert: false }, card()).primary?.key, "details");
});

test("rule 3: the heart is signed-in only; a waitlist guest gets Add instead", () => {
  const gem = item();
  assert.equal(saveAllowed(gem, card()), true);
  assert.equal(saveAllowed(gem, card({ signedIn: false })), false);
  const guest = resolveActions(gem, card({ signedIn: false, mode: "waitlist" }));
  assert.ok(!guest.secondary.some((a) => a.key === "save"), "no heart for a guest");
  assert.equal(guest.primary?.key, "add", "the guest's write is Add");
});

test("rule 4: Share is a secondary icon, never primary, and never on a compact tile", () => {
  const got = resolveActions(item(), card());
  assert.equal(got.primary?.key, "add");
  assert.ok(got.secondary.some((a) => a.key === "share"), "share rides as a secondary");
  const shareOnly = resolveActions(item({ placeable: false, type: "curated", detailHref: null }), card());
  assert.notEqual(shareOnly.primary?.key, "share");
  assert.deepEqual(shareOnly.primary, null, "nothing to lead with when the only action is Share");
  assert.equal(shareAllowed(item(), card({ surface: "card", density: "compact" })), false);
});

test("R755: a compact bento tile draws exactly one action and no secondaries", () => {
  const got = resolveActions(item(), card({ density: "compact" }));
  assert.equal(got.primary?.key, "add");
  assert.deepEqual(got.secondary, []);
  assert.equal(got.itemMenu, undefined, "the 4+1 menu belongs to the plan surface only");
});

test("guardrail 1+2: no priced or provider-submitting control on the guest path", () => {
  const bookable = item({ type: "listing", bookable: true, priced: true });
  for (const ctx of [card({ mode: "waitlist" }), card({ signedIn: false }), { mode: "open" as const, signedIn: false, surface: "card" as const }]) {
    const got = resolveActions(bookable, ctx);
    const keys = [got.primary?.key, ...got.secondary.map((a) => a.key)];
    assert.ok(!keys.includes("book"), "no Book");
    assert.ok(!keys.includes("hire"), "no Hire");
    assert.equal(pricedAllowed(ctx), ctx.mode === "open");
  }
  assert.equal(bookAllowed(bookable, { mode: "open", signedIn: true, surface: "plan" }), false, "never on the plan");
});

test("LL-2: Official site is gated, in-app only on the plan, and never on a priced or listing row", () => {
  const place = item({ officialUrl: "https://official.example/x", publicOk: true });
  const off = { mode: "open" as const, signedIn: true, surface: "detail" as const, llOfficialSiteEnabled: false };
  assert.equal(officialSiteAllowed(place, off), false, "the flag is off in LL-1");
  const on = { ...off, llOfficialSiteEnabled: true };
  assert.equal(officialSiteAllowed(place, on), true);
  assert.equal(officialSiteAllowed(place, { ...on, surface: "plan" }), false, "LL-1 emits no outside link from the plan");
  assert.equal(officialSiteAllowed({ ...place, priced: true }, on), false, "never on a priced item");
  assert.equal(officialSiteAllowed({ ...place, publicOk: false }, on), false, "a non-public source is not public");
  assert.equal(officialSiteAllowed({ ...place, type: "listing" }, on), false, "never on a provider listing");
});

test("open plan: an expert reviewing a hired plan gets it as a secondary, not a second primary", () => {
  const got = resolveActions(item(), { mode: "open", signedIn: true, surface: "plan", role: "travel_expert" });
  assert.equal(got.primary?.key, "details");
  const open = got.secondary.find((a) => a.key === "open_plan");
  assert.ok(open, "Open plan is offered to the expert");
  assert.equal(open?.primary, false);
  const traveler = resolveActions(item(), { mode: "open", signedIn: true, surface: "plan", role: "traveler" });
  assert.ok(!traveler.secondary.some((a) => a.key === "open_plan"), "never for a traveler");
});

test("the ruled orders and key sets are the ones the spec names", () => {
  assert.deepEqual([...SECONDARY_ORDER], ["add", "ask_expert", "details", "book", "hire", "save", "share", "official_site"]);
  assert.deepEqual([...ITEM_MENU_KEYS], ["details", "swap", "move_up", "move_down", "remove"]);
  assert.ok(ACTION_KEYS.includes("ask_expert"), "the human ask is a key");
  assert.ok(!(ACTION_KEYS as readonly string[]).includes("ask_ai"), "the priced AI task is NOT an output of this engine");
});
