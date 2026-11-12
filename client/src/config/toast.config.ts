/**
 * QA round 3 PR 5 (Leon, Nov 11, 2026: "toast ≥8 s, paused on hover, set in config").
 *
 * How long a plan-add toast stays visible — the "Added to Day {n}." toast with Undo / Change day, and the add's
 * failure toast with Retry. Radix's own default is 5 s (`@radix-ui/react-toast`, `duration = 5e3`), too short to reach
 * Undo. Pausing is Radix's own: the viewport pauses the timer on hover, on focus inside it and while the window is
 * blurred, and resumes on leave — nothing here re-implements it.
 *
 * Set on the plan-add calls only (`PlanAddFeedbackHost`), never on the provider: every other toast keeps its timing.
 */
export const PLAN_ADD_TOAST_MS = 8000;
