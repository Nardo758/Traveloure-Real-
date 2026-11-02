/**
 * Row P-2 (ledger `2026-11-02-p2-ai-purge-round-2`): the /ai-assistant page's name and the nav,
 * sidebar and dashboard door to it. No traveler-visible "AI" and no vendor name. These names are
 * Leon's to choose; they are proposals until his wording approval on the PR names which he takes.
 * The route stays /ai-assistant this round.
 */
export const PLAN_ASSISTANT_COPY = {
  pageTitle: "Plan assistant",
  pageTagline: "Start here, hand it to a person whenever you want",
  sendFailed: "Something went wrong reaching the plan assistant. Your message wasn't lost — try sending again.",
  navName: "Plan assistant",
  navDescription: "Draft your days",
  startDoor: "Start a plan",
} as const;
