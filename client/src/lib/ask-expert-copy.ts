/**
 * THE ASK CHOOSER'S COPY — final.
 *
 * Wording approved — Leon, Nov 13, 2026: "Ask an expert", "Ask a local", "Ask a trip planner",
 * "Ask an event planner". These are approved constants, NOT pending placeholders, so the chooser PR that
 * mounts the dialog consumes this module and adds no strings of its own.
 *
 * WHY THIS IS NOT IN `action-engine.ts`: the engine owns no copy. It reports `labelKey`s (and the three
 * `askChoices` kinds); this module is the one place those keys turn into words, so a surface never invents a
 * label and a wording change is one edit here.
 *
 * The button is ONE button everywhere. Tapping it opens the three options below; it is never a second
 * primary and never carries a price (the human ask is not `actions.ask`, which is the paid AI task).
 */
import type { AskChoiceKind } from "./action-engine";

export const ASK_EXPERT_COPY = {
  /** The one button. Reuses the feed/discover label the app already ships. */
  button: "Ask an expert",
  /** Option A — `local_expert`. Reuses ExpertDoor's title. */
  local: "Ask a local",
  /** Option B — `travel_expert` (includes the legacy `expert` role). */
  tripPlanner: "Ask a trip planner",
  /** Option C — `event_planner`. */
  eventPlanner: "Ask an event planner",
} as const;

/** The label for a chooser kind. Unknown kinds cannot occur (`AskChoiceKind` is closed), so no fallback copy. */
export function askChoiceLabel(kind: AskChoiceKind): string {
  switch (kind) {
    case "local_expert":
      return ASK_EXPERT_COPY.local;
    case "travel_expert":
      return ASK_EXPERT_COPY.tripPlanner;
    case "event_planner":
      return ASK_EXPERT_COPY.eventPlanner;
  }
}
