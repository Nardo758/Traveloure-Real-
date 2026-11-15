/**
 * THE ACTION ENGINE — one pure function that answers "what may this surface offer?", per the action-engine
 * rulings (rev 3, Nov 13): Add / Book / "Ask an expert" / Details, ONE primary per tile, Share as a
 * secondary icon only, and no priced or provider-submitting control in waitlist mode or on the guest path.
 *
 * WHY IT IS SEPARATE FROM `plan-actions.ts`: that module owns the COPY and the per-site table a tile reads
 * today (`planActionsVisible` / `planActionsPrimary`, `PLAN_ACTIONS_SITES`). This engine owns the DECISION as
 * data with tags, so a surface can ask what is available without re-deriving the order, and so the rules are
 * testable in a table with no React and no fetch. PR 1 deliberately wires it to nothing: same behaviour as
 * today, one new rule home. The surfaces move onto it in later PRs.
 *
 * PURE: no imports, no React, no fetch, no store. Every rule below is a line in a test table.
 */

/** The actions a surface can offer. No priced or provider-submitting tag exists beyond these. */
export const ACTION_TAGS = ["book", "add", "ask", "details", "share"] as const;
export type ActionTag = (typeof ACTION_TAGS)[number];

/** What a content item CAN support, independent of who is looking at it. */
export interface ActionIntent {
  /** A priced booking (a listing, a stay, a service with a price). */
  book?: boolean;
  /** The add/save onto a plan — allowed for a guest, it is not a priced control. */
  add?: boolean;
  /** "Ask an expert" / hire: submits to a person and may lead to a provider conversation. */
  ask?: boolean;
  /** A page or a sheet to open; never priced, never submitting. */
  details?: boolean;
  /** A share link — ALWAYS secondary, never the one primary. */
  share?: boolean;
}

export interface ActionContext {
  mode: "waitlist" | "open";
  signedIn: boolean;
}

export interface ResolvedActions {
  /** Exactly one, or null when the surface offers nothing. Never `share`. */
  primary: ActionTag | null;
  /** Everything else available, in the ruled order. `share` can only appear here. */
  secondary: ActionTag[];
  /** Present in the intent but refused here, with the reason. */
  hidden: { tag: ActionTag; reason: "priced_in_waitlist" | "provider_submit" }[];
}

/**
 * The one ruled order for the primary: Book, then Add, then Ask, then Details. It mirrors
 * `planActionsPrimary` today, and that is the point — the engine and the tile agree on WHICH action wins.
 */
export const PRIMARY_ORDER: readonly ActionTag[] = ["book", "add", "ask", "details"];

/** Priced and provider-submitting actions need a real, signed-in, open-mode traveler. */
export function actionAllowed(tag: ActionTag, ctx: ActionContext): boolean {
  if (tag === "book" || tag === "ask") return ctx.mode === "open" && ctx.signedIn === true;
  return true;
}

export function resolveActions(intent: ActionIntent, ctx: ActionContext): ResolvedActions {
  const offered = ACTION_TAGS.filter((tag) => intent[tag] === true);
  const hidden: ResolvedActions["hidden"] = [];
  const usable: ActionTag[] = [];
  for (const tag of offered) {
    if (actionAllowed(tag, ctx)) {
      usable.push(tag);
    } else {
      hidden.push({ tag, reason: tag === "book" ? "priced_in_waitlist" : "provider_submit" });
    }
  }
  // ONE primary. `share` is excluded by construction: it is an icon beside the primary, never the primary.
  const primary = PRIMARY_ORDER.find((tag) => usable.includes(tag)) ?? null;
  const secondary = usable.filter((tag) => tag !== primary);
  return { primary, secondary, hidden };
}
