/**
 * TRAVELER ACTION ENGINE — rev 3 (Nov 13, 2026).
 *
 * One pure function answers which traveler actions draw, which ONE is primary, and which approved string key
 * each uses. Pages pass handlers and styles. Nothing here is wired to a surface in PR 1: same behaviour as
 * main, one rule home, so the order and the gating are testable in a table.
 *
 * "Carries no copy": every action reports a `labelKey`, never a rendered string. The labels live in the
 * approved tables (`ADD_COPY`, `plan-actions.ts`, ASK_LOCAL_WORDS); a surface resolves the key. This is
 * deliberately stricter than the spec's `ResolvedAction.label`, per the review's own item 5.
 *
 * PURE: no imports, no React, no fetch, no store, no Date.
 */

export type ActionMode = "waitlist" | "open";
export type ActionSurface = "card" | "detail" | "sheet" | "map" | "plan";
export type ActionDensity = "compact" | "full";

/** Every traveler action the engine can return. `ask_expert` is the HUMAN ask, never the priced AI task. */
export const ACTION_KEYS = [
  "add",
  "ask_expert",
  "details",
  "book",
  "hire",
  "save",
  "share",
  "official_site",
  "open_plan",
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

/** The plan surface's 4+1 item menu, which is a different set from the traveler actions. */
export const ITEM_MENU_KEYS = ["details", "swap", "move_up", "move_down", "remove"] as const;
export type ItemMenuKey = (typeof ITEM_MENU_KEYS)[number];

export type ContentItemType =
  | "gem"
  | "event"
  | "city_event"
  | "listing"
  | "affiliate_product"
  | "hotel"
  | "activity"
  | "expert"
  | "ready_made"
  | "deal"
  | "viator"
  | "recommendation"
  | "blog"
  | "curated";

export interface ContentItem {
  type: ContentItemType;
  id: string;
  title: string;
  city: string | null;
  /** `sourced` content never reaches a traveler surface. */
  origin: "platform" | "affiliate" | "sourced";
  /** A PlanItemRef can be built for it. */
  placeable: boolean;
  bookable: boolean;
  /** A charge, quote, hire fee, or a "from $n" sits behind the action. */
  priced: boolean;
  hasExpert: boolean;
  /** In-app path. */
  detailHref: string | null;
  /**
   * F1 (Leon, Nov 19): the card's Details is its OWN in-app detail sheet, not a page - a city-feed gem, event or
   * place. Details draws for either; only a `detailHref` gives the action an `href`.
   */
  detailSheet?: boolean;
  officialUrl: string | null;
  /** null = not an official-source row. */
  publicOk: boolean | null;
  partnerSource: "none" | "viator" | "fever" | "deal" | "other";
  shareUrl?: string | null;
}

export interface ActionContext {
  mode: ActionMode;
  signedIn: boolean;
  role?: string | null;
  /** From `useFeedAddDay`; null means no "Add to Day {n}". */
  knownDay?: number | null;
  surface: ActionSurface;
  density?: ActionDensity;
  alreadyOnPlan?: boolean;
  planId?: string | null;
  /** Surface=plan only; unread hides every paid action. */
  planCapabilities?: { ask?: boolean; handoff?: boolean } | null;
  /** LL-2 gate; false in LL-1. */
  llOfficialSiteEnabled?: boolean;
}

export interface ResolvedAction {
  key: ActionKey;
  /** The approved string key a surface resolves; the engine never carries the words. */
  labelKey: string;
  /** `ask_expert` only: the chooser the press opens. Empty for every other action. */
  askChoices?: readonly AskChoiceKind[];
  href?: string;
  /** Only `official_site`, and never on `surface=plan` in LL-1. */
  external?: boolean;
  priced: boolean;
  primary: boolean;
}

export interface ResolvedActions {
  primary: ResolvedAction | null;
  /** Empty on a compact card (R755 — the tile draws one action only). */
  secondary: ResolvedAction[];
  /** `surface=plan` only. */
  itemMenu?: ItemMenuKey[];
}

/** The ruled secondary order. Share is an icon; official site is last and LL-2 only. */
export const SECONDARY_ORDER: readonly ActionKey[] = [
  "add",
  "ask_expert",
  "details",
  "book",
  "hire",
  "save",
  "share",
  "official_site",
];

function action(key: ActionKey, opts: { labelKey?: string; href?: string; external?: boolean; priced?: boolean } = {}): ResolvedAction {
  return {
    key,
    labelKey: opts.labelKey ?? key,
    ...(key === "ask_expert" ? { askChoices: ASK_CHOICES.map((c) => c.kind) } : {}),
    ...(opts.href ? { href: opts.href } : {}),
    ...(opts.external ? { external: true } : {}),
    priced: opts.priced ?? false,
    primary: false,
  };
}

/** Prices are never shown in waitlist mode, and never on the guest path (guardrail 1). */
export function pricedAllowed(ctx: ActionContext): boolean {
  return ctx.mode === "open";
}

/**
 * Book / Hire / Request / Book on partner: open mode only, never on the plan surface.
 *
 * RULED (Leon, Nov 19, 2026): a signed-out visitor in open mode SEES Book; the press asks them to sign in
 * (the existing gate). That is what main has always drawn (`planActionsVisible`) and what the spec's table
 * says. "No priced control on the guest path" is the WAITLIST guest rail, which `pricedAllowed` already covers.
 */
export function bookAllowed(item: ContentItem, ctx: ActionContext): boolean {
  return item.bookable && pricedAllowed(ctx) && ctx.surface !== "plan";
}

/**
 * THE ASK CHOOSER (spec §5). "Ask an expert" is ONE unpriced button; tapping it opens these three kinds.
 * It is NOT a provider submit: it shows in waitlist mode and to a signed-out guest, never with a price.
 * labelKeys only - the words live in the approved tables, except the two the spec marks NEW.
 */
export const ASK_CHOICES = [
  { kind: "local_expert", labelKey: "ask_local" },
  { kind: "travel_expert", labelKey: "ask_trip_planner" },
  { kind: "event_planner", labelKey: "ask_event_planner" },
] as const;
export type AskChoiceKind = (typeof ASK_CHOICES)[number]["kind"];

/**
 * The human ask: unpriced, NOT gated by mode or sign-in. It needs an expert to exist for the city; the press
 * opens the chooser above, then the chosen rail (and, for a guest, the existing sign-in gate after the tap).
 */
export function askExpertAllowed(item: ContentItem, ctx: ActionContext): boolean {
  // F1 (Leon, Nov 19): every card whose city has an expert offers the ask, not only an expert's own card
  // (spec section 4: "Shows when: hasExpert").
  return item.hasExpert === true;
}

/** Details has somewhere in-app to go: the item's page, or the card's own detail sheet. */
export function detailsAllowed(item: ContentItem): boolean {
  return !!item.detailHref || item.detailSheet === true;
}

export function saveAllowed(item: ContentItem, ctx: ActionContext): boolean {
  if (!ctx.signedIn) return false;
  return item.type === "gem" || item.type === "hotel" || item.type === "activity" || item.type === "listing";
}

export function shareAllowed(item: ContentItem, ctx: ActionContext): boolean {
  // Never on a compact tile (R755) and never inside the 4+1 menu.
  if (ctx.surface === "card" && (ctx.density ?? "compact") === "compact") return false;
  return !!item.shareUrl;
}

export function officialSiteAllowed(item: ContentItem, ctx: ActionContext): boolean {
  if (!ctx.llOfficialSiteEnabled) return false;
  if (ctx.surface === "plan") return false; // LL-1 emits no outside links from the plan
  if (!item.officialUrl) return false;
  if (item.priced) return false;
  if (item.type === "listing") return false;
  if (item.publicOk === false) return false;
  return item.type === "gem" || item.type === "event" || item.type === "city_event";
}

/** Add is refused once the item is on the plan, and for kinds that name no row of ours. */
export function addAllowed(item: ContentItem, ctx: ActionContext): boolean {
  if (!item.placeable) return false;
  if (ctx.alreadyOnPlan) return false;
  return ["gem", "event", "city_event", "listing", "affiliate_product", "hotel", "activity"].includes(item.type);
}

/**
 * THE PRIMARY, by content type (Leon, Nov 13). Exactly one; compact tiles draw only this.
 * Plan stops and any surface=plan primary are Details whenever a detailHref exists (LL-1).
 */
export function primaryKeyFor(item: ContentItem, ctx: ActionContext): ActionKey | null {
  if (ctx.surface === "plan") return item.detailHref ? "details" : null;

  switch (item.type) {
    case "gem":
    case "event":
    case "city_event":
    case "activity":
      return addAllowed(item, ctx) ? "add" : detailsAllowed(item) ? "details" : null;
    case "hotel":
    case "listing":
    case "affiliate_product":
      if (bookAllowed(item, ctx)) return "book";
      return addAllowed(item, ctx) ? "add" : detailsAllowed(item) ? "details" : null;
    case "expert":
      // "Ask an expert", or View profile when nobody is available for the city. Both are Details-shaped when
      // there is no Ask: the labelKey differs, the destination does not.
      return askExpertAllowed(item, ctx) ? "ask_expert" : "details";
    case "viator":
    case "deal":
    case "recommendation":
      // A row we did not author: no Book on the guest path, so Details leads, Add lives on the sheet.
      return item.bookable && pricedAllowed(ctx) ? "hire" : "details";
    case "ready_made":
    case "blog":
    case "curated":
      return item.detailHref ? "details" : null;
    default:
      return null;
  }
}

export function resolveActions(item: ContentItem, ctx: ActionContext): ResolvedActions {
  const primaryKey = primaryKeyFor(item, ctx);
  const primary = primaryKey
    ? (() => {
        const a = action(primaryKey, {
          href: primaryKey === "details" ? item.detailHref ?? undefined : undefined,
          priced: primaryKey === "book" || primaryKey === "hire",
          // An expert card with nobody available offers View profile: same destination, its own label key.
          ...(primaryKey === "details" && item.type === "expert" && !askExpertAllowed(item, ctx)
            ? { labelKey: "view_profile" }
            : {}),
        });
        a.primary = true;
        return a;
      })()
    : null;

  // Compact bento: ONE action, no secondaries at all (R755).
  if (ctx.surface === "card" && (ctx.density ?? "compact") === "compact") {
    return { primary, secondary: [] };
  }

  const available: ActionKey[] = [];
  if (addAllowed(item, ctx)) available.push("add");
  if (askExpertAllowed(item, ctx)) available.push("ask_expert");
  if (detailsAllowed(item)) available.push("details");
  if (bookAllowed(item, ctx)) available.push("book");
  if (saveAllowed(item, ctx)) available.push("save");
  if (shareAllowed(item, ctx)) available.push("share");
  if (officialSiteAllowed(item, ctx)) available.push("official_site");
  const expertReviewer = !!ctx.role && ctx.role !== "traveler" && ctx.role !== "user";

  const secondary = SECONDARY_ORDER.filter((k) => k !== primaryKey && available.includes(k)).map((k) =>
    action(k, {
      href: k === "details" ? item.detailHref ?? undefined : k === "official_site" ? item.officialUrl ?? undefined : undefined,
      external: k === "official_site",
      priced: k === "book" || k === "hire",
    }),
  );

  // Open plan is a secondary that is NOT in the traveler order: it belongs to an expert reviewing a plan.
  if (expertReviewer && ctx.surface === "plan") {
    const openPlan = action("open_plan");
    openPlan.priced = false;
    secondary.push(openPlan);
  }

  const result: ResolvedActions = { primary, secondary };
  if (ctx.surface === "plan") result.itemMenu = [...ITEM_MENU_KEYS];
  return result;
}
