/**
 * A CARD'S ACTION ROW (F1; Leon, Nov 19): Book or Hire, Add, "Ask an expert", Details - whichever the engine
 * answers for this item, in its order (`lib/card-actions.ts`). The card brings its item, its two `PlanActions`
 * elements, and the test ids and styles for Ask and Details; it never decides which of the four draw.
 *
 * Add, Book and Hire stay `PlanActions` outputs (their words, their mode rule, the confirmed-add state), so
 * every site still renders them through that one component. This row places them and draws the two actions
 * `PlanActions` has no output for.
 */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useSignupMode } from "@/lib/signup-mode";
import { PLAN_ACTIONS_COPY } from "@/lib/plan-actions";
import { cardActionSlots } from "@/lib/card-actions";
import type { ActionSurface, ContentItem } from "@/lib/action-engine";
import { AskExpertButton, type AskExpertButtonProps } from "@/components/ask-expert-button";

export interface CardActionsProps {
  item: ContentItem;
  /** "card" is a full-size card; a sheet a tile opens is "sheet". */
  surface?: Extract<ActionSurface, "card" | "detail" | "sheet">;
  /** The card's `<PlanActions>` drawing Book and Hire only. */
  book?: ReactNode;
  /** The card's `<PlanActions>` drawing the add only. */
  add?: ReactNode;
  ask?: Omit<AskExpertButtonProps, "city"> | null;
  /** Details: the item's `detailHref`, or `onClick` for a card whose Details is its own sheet. */
  details?: { testId: string; className?: string; style?: CSSProperties; onClick?: () => void } | null;
}

export function CardActions({ item, surface = "card", book, add, ask, details }: CardActionsProps) {
  const { user } = useAuth();
  // Fail-closed: an unread mode is waitlist (`useSignupMode`).
  const { mode } = useSignupMode();
  const slots = cardActionSlots(item, { mode: mode === "open" ? "open" : "waitlist", signedIn: !!user, surface, density: "full" });
  const openDetails = details?.onClick;
  return (
    <>
      {slots.map((slot) => {
        if (slot === "book") return book ? <span key={slot} className="contents">{book}</span> : null;
        if (slot === "add") return add ? <span key={slot} className="contents">{add}</span> : null;
        if (slot === "ask_expert") return ask ? <AskExpertButton key={slot} {...ask} city={item.city} /> : null;
        if (!details) return null;
        if (openDetails) {
          return (
            <button
              key={slot}
              type="button"
              className={details.className}
              style={details.style}
              data-testid={details.testId}
              onClick={(e) => {
                // A card is often itself a link: the press is this action's, never the card's.
                e.preventDefault();
                e.stopPropagation();
                openDetails();
              }}
            >
              {PLAN_ACTIONS_COPY.details}
            </button>
          );
        }
        return item.detailHref ? (
          <Link key={slot} href={item.detailHref} className={details.className} style={details.style} data-testid={details.testId} onClick={(e: any) => e?.stopPropagation?.()}>
            {PLAN_ACTIONS_COPY.details}
          </Link>
        ) : null;
      })}
    </>
  );
}
