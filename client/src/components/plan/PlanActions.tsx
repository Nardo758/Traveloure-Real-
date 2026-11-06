/**
 * CAP-2 Phase 3 (dispatch ruling 5; ledger `2026-11-06-cap2-phase3-plan-actions`): the ONE renderer of a browse tile's
 * save / book / hire / more-info actions. Words and visibility come from `lib/plan-actions.ts` (labels, the Book variant
 * by booking mode, the fail-closed mode + guest-capabilities rule); the card brings its handlers, test ids and styles.
 *
 * A card never renders one of these labels itself — the guard in `cap2-phase3.test.ts` fails CI on a traveler file
 * that does.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useSignupMode } from "@/lib/signup-mode";
import { useGuestCapabilities } from "@/lib/use-guest-capabilities";
import {
  bookLabel,
  PLAN_ACTIONS_COPY,
  planActionsPrimary,
  planActionsVisible,
  type BookVariant,
  type PlanActionsSite,
  type PlanActionsVisible,
} from "@/lib/plan-actions";

export interface PlanActionSpec {
  testId: string;
  className?: string;
  onClick?: () => void;
  /** In-app path (wouter Link) unless `external`. */
  href?: string;
  /** A partner page: new tab, `rel="sponsored noopener noreferrer"`. */
  external?: boolean;
  disabled?: boolean;
  /** Drawn before the label (an icon). */
  icon?: ReactNode;
  /** Extra data-* attributes the card's tests or layout read. */
  data?: Record<string, string>;
}

type Output = keyof PlanActionsVisible;

export interface PlanActionsProps {
  site: PlanActionsSite;
  /** The tile's area: the guest-capabilities read answers Hire for it. */
  city?: string | null;
  /** Save: the card's own label is the add label ("Add to plan" / "Add to Nov 3" / "Save to plan"). */
  save?: (PlanActionSpec & { placeable: boolean; label: string }) | null;
  book?: (PlanActionSpec & { variant: BookVariant; done?: boolean }) | null;
  hire?: PlanActionSpec | null;
  moreInfo?: PlanActionSpec | null;
  browse?: (PlanActionSpec & { category: string }) | null;
  /** "primary": a compact tile's one action (row 302b). "row": every output that draws, in `order`. */
  layout?: "row" | "primary";
  order?: Output[];
  /** Set on a bento tile's primary so row 302b's one-primary check reads it. */
  primaryAttr?: string;
  /** Wraps the drawn outputs (row layout); omitted when nothing draws. */
  wrapperClassName?: string;
}

const DEFAULT_ORDER: Output[] = ["book", "hire", "save", "browse", "moreInfo"];

function ActionEl({ spec, label, primaryAttr }: { spec: PlanActionSpec; label: string; primaryAttr?: string }) {
  const dataAttrs: Record<string, string> = { ...(spec.data ?? {}) };
  if (primaryAttr) dataAttrs["data-bento-primary-action"] = primaryAttr;
  const body = (
    <>
      {spec.icon}
      {label}
    </>
  );
  if (spec.href && spec.external) {
    return (
      <a href={spec.href} target="_blank" rel="sponsored noopener noreferrer" className={spec.className} data-testid={spec.testId} onClick={spec.onClick} {...dataAttrs}>
        {body}
      </a>
    );
  }
  if (spec.href && !spec.disabled) {
    return (
      <Link href={spec.href} className={spec.className} data-testid={spec.testId} onClick={spec.onClick} {...dataAttrs}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={spec.className}
      data-testid={spec.testId}
      disabled={spec.disabled}
      onClick={(e) => {
        e.stopPropagation();
        spec.onClick?.();
      }}
      {...dataAttrs}
    >
      {body}
    </button>
  );
}

/** The visibility a card's props ask for, under the current mode and capabilities. Exported for cards that lay out around it. */
export function usePlanActionsVisible(props: Pick<PlanActionsProps, "site" | "city" | "save" | "book" | "hire" | "moreInfo" | "browse">): PlanActionsVisible {
  const { mode } = useSignupMode();
  const capabilities = useGuestCapabilities(props.city);
  return planActionsVisible({
    mode,
    capabilities,
    site: props.site,
    intent: {
      save: props.save ? { placeable: props.save.placeable } : null,
      book: props.book ? { variant: props.book.variant } : null,
      hire: props.hire ? {} : null,
      moreInfo: props.moreInfo ? {} : null,
      browse: props.browse ? { category: props.browse.category } : null,
    },
  });
}

export function PlanActions(props: PlanActionsProps) {
  const visible = usePlanActionsVisible(props);
  const order = props.layout === "primary" ? [planActionsPrimary(visible)].filter((o): o is Output => !!o) : props.order ?? DEFAULT_ORDER;
  const els: ReactNode[] = [];
  for (const out of order) {
    if (!visible[out]) continue;
    const primaryAttr = props.layout === "primary" ? props.primaryAttr : undefined;
    if (out === "save" && props.save) els.push(<ActionEl key="save" spec={props.save} label={props.save.label} primaryAttr={primaryAttr} />);
    if (out === "book" && props.book) els.push(<ActionEl key="book" spec={props.book} label={bookLabel(props.book.variant, { done: props.book.done })} primaryAttr={primaryAttr} />);
    if (out === "hire" && props.hire) els.push(<ActionEl key="hire" spec={props.hire} label={PLAN_ACTIONS_COPY.hire} primaryAttr={primaryAttr} />);
    if (out === "moreInfo" && props.moreInfo) els.push(<ActionEl key="moreInfo" spec={props.moreInfo} label={PLAN_ACTIONS_COPY.moreInfo} primaryAttr={primaryAttr} />);
    if (out === "browse" && props.browse) els.push(<ActionEl key="browse" spec={props.browse} label={PLAN_ACTIONS_COPY.browseCategory(props.browse.category)} primaryAttr={primaryAttr} />);
  }
  if (els.length === 0) return null;
  if (props.wrapperClassName) return <div className={props.wrapperClassName}>{els}</div>;
  return <>{els}</>;
}
