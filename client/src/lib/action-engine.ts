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
 * The spec's table has a line saying an open-mode guest MAY see the control. Leon's standing rule is
 * stricter - no priced control on the guest path at all - and the stricter rule wins here, so `signedIn` is
 * required. Noted under Assumptions in the PR.
 */
export function bookAllowed(item: ContentItem, ctx: ActionContext): boolean {
  return item.bookable && pricedAllowed(ctx) && ctx.signedIn === true && ctx.surface !== "plan";
}

/** The human ask: unpriced, so it survives waitlist; it needs an expert to exist. */
export function askExpertAllowed(item: ContentItem, ctx: ActionContext): boolean {
  return item.hasExpert === true && item.type === "expert";
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
      return addAllowed(item, ctx) ? "add" : item.detailHref ? "details" : null;
    case "hotel":
    case "listing":
    case "affiliate_product":
      if (bookAllowed(item, ctx)) return "book";
      return addAllowed(item, ctx) ? "add" : item.detailHref ? "details" : null;
    case "expert":
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
  if (item.detailHref) available.push("details");
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
