/**
 * WHAT A CARD OFFERS (F1; Leon, Nov 19) - the engine's answer, shaped for a card's action row.
 *
 * `resolveActions` is the one author of which of Add, Ask an expert and Details a card draws, and in what order.
 * Book and Hire are drawn by `PlanActions`, which owns their words and Hire's area answer, and lead the row when
 * they draw. Their mode rule is the engine's: open mode, signed in or not (Leon, Nov 19).
 *
 * PURE: no React.
 */
import { resolveActions, type ActionContext, type ActionKey, type ContentItem, type ContentItemType } from "./action-engine";

/** The slots a card row can draw, in order. `book` is the Book-or-Hire slot. */
export type CardActionSlot = "book" | "add" | "ask_expert" | "details";

/** Book or Hire first when it draws, then the engine's ruled order (Add, Ask an expert, Details). */
const CARD_ROW_ORDER: readonly CardActionSlot[] = ["book", "add", "ask_expert", "details"];

export interface CardContentInput {
  type: ContentItemType;
  id: string | number;
  title: string;
  city: string | null | undefined;
  /** The card built a PlanItemRef for it (its Add intent). */
  placeable: boolean;
  /** The card holds a Book or Hire intent for it. */
  bookable: boolean;
  /** The city has an expert to ask (`useExpertAvailability`). */
  hasExpert: boolean;
  detailHref?: string | null;
  detailSheet?: boolean;
}

/** The engine's item, from what a card already holds. Nothing here is fetched or guessed. */
export function cardContentItem(input: CardContentInput): ContentItem {
  return {
    type: input.type,
    id: String(input.id),
    title: input.title,
    city: input.city?.trim() || null,
    origin: "platform",
    placeable: input.placeable,
    bookable: input.bookable,
    priced: input.bookable,
    hasExpert: input.hasExpert,
    detailHref: input.detailHref ?? null,
    detailSheet: input.detailSheet === true,
    officialUrl: null,
    publicOk: null,
    partnerSource: "none",
    shareUrl: null,
  };
}

/**
 * The slots a FULL card, a detail view or a sheet draws, in order. A compact tile is not drawn from this: it
 * keeps its ONE primary through `PlanActions layout="primary"` (R755), and the engine returns it no secondaries.
 */
export function cardActionSlots(item: ContentItem, ctx: ActionContext): CardActionSlot[] {
  const resolved = resolveActions(item, ctx);
  const keys = new Set<ActionKey>([...(resolved.primary ? [resolved.primary.key] : []), ...resolved.secondary.map((a) => a.key)]);
  return CARD_ROW_ORDER.filter((slot) => (slot === "book" ? item.bookable : keys.has(slot)));
}
