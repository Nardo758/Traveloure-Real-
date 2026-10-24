/**
 * Row 45 (H-21): the Discover page-foot "Need Help Deciding?" body. It names experts only when an expert is
 * available (the same `useExpertAvailability("any")` answer that gates "Talk to an Expert"), so the copy never
 * points at a button that is not there. FOUNDER WORDING REVIEW on the PR.
 */
export const NEED_HELP_BODY_EXPERTS =
  "Talk to one of our local experts or trip planners. They'll help you find a trip that fits your preferences, budget, and travel style.";
export const NEED_HELP_BODY_NO_EXPERTS =
  "Start with what you want to do, and we'll help you plan a trip around your dates, budget, and travel style.";

export function needHelpBody(anyExpertAvailable: boolean): string {
  return anyExpertAvailable ? NEED_HELP_BODY_EXPERTS : NEED_HELP_BODY_NO_EXPERTS;
}
