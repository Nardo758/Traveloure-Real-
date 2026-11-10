/**
 * Cut-list #1, slice A — ONE header control for every viewport.
 *
 * The header used to be a single "Start a plan" button that always called `openNewPlan()`. It now
 * speaks for the plan the traveler actually has:
 *
 *   start  → "Start a plan" (unchanged, `newPlan`)
 *   resume → "Start a plan" that REOPENS the bound plan (no `newPlan`): a guest or owner whose plan
 *            holds no stops yet is continuing it, not starting a second one
 *   chip   → "Your {city} plan · {n}" with the dates (or "Add dates"), linking `/plans/{id}` with no
 *            `?view=` — the slip's Days view, which is the ruled landing
 *
 * Both mounts (`layout.tsx` desktop nav and the phone menu) render THIS component, so the two can
 * never drift — "one header for every viewport" is a structural fact, not a convention.
 *
 * 375px budget: the chip is `min-w-0` inside a `max-w-[200px]` box and its label `truncate`s, so a
 * long city name (or a three-digit stop count) never pushes the logo or the menu off-screen.
 */
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLAN_START_HREF } from "@/lib/plan-entry";
import { START_PLAN_LABEL } from "@/lib/plan-vocabulary";
import { headerDatesLine, headerPlanLabel, type HeaderPlanState } from "@/lib/header-plan";

const CHIP_CLASS =
  "inline-flex items-center gap-1.5 min-w-0 max-w-[200px] rounded-full border px-3 py-1 text-xs font-semibold " +
  "hover:bg-[color:var(--earn-teal-wash)] transition-colors";
const CHIP_STYLE = {
  fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  background: "var(--earn-chip)",
  borderColor: "var(--earn-teal)",
} as const;

export function HeaderPlanCTA({
  state,
  variant,
  onStart,
}: {
  state: HeaderPlanState;
  variant: "desktop" | "mobile";
  onStart: (event: { preventDefault(): void }) => void;
}) {
  const wide = variant === "mobile" ? "w-full justify-center" : "hidden xl:inline-flex";

  if (state.kind === "chip") {
    const label = headerPlanLabel(state) ?? "";
    const dates = headerDatesLine(state) ?? "";
    return (
      <Link
        href={`/plans/${state.planId}`}
        className={cn(CHIP_CLASS, wide)}
        style={CHIP_STYLE}
        data-testid={variant === "mobile" ? "chip-mobile-plan" : "chip-nav-plan"}
      >
        <span className="truncate" style={{ color: "var(--earn-ink)" }} data-testid="chip-nav-plan-label">
          {label}
        </span>
        <span className="shrink-0" aria-hidden="true" style={{ color: "var(--earn-faint)" }}>
          ·
        </span>
        <span className="shrink-0" style={{ color: "var(--earn-teal-ink)" }} data-testid="chip-nav-plan-dates">
          {dates}
        </span>
      </Link>
    );
  }

  // "Start a plan" that REOPENS the plan already there. It is a LINK, not a modal call: a bare
  // `openPlanning()` is forbidden by row-ps2 T1 ("every door starts a new plan") and would aim at
  // the wrong object anyway — a guest's plan id is not a trip id, and a trip id is exactly what
  // `/plans/{id}` takes. No `?view=`: Days is the ruled landing.
  const reopen = state.kind === "resume";
  const href = reopen ? (state.guest ? PLAN_START_HREF : `/plans/${state.planId}`) : PLAN_START_HREF;
  return (
    <Button
      asChild
      size={variant === "mobile" ? "default" : "sm"}
      className={cn(
        "text-white bg-[color:var(--coral-fill)] hover:bg-[color:var(--coral-fill)]/90",
        variant === "mobile" ? "w-full" : "hidden xl:inline-flex text-sm",
      )}
      onClick={reopen ? undefined : onStart}
      data-testid={variant === "mobile" ? "button-mobile-start-plan" : "button-nav-start-plan"}
    >
      <Link href={href}>{START_PLAN_LABEL}</Link>
    </Button>
  );
}
