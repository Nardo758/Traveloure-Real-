/**
 * THE ASK CHOOSER'S OPTIONS (F1; Leon, Nov 19).
 *
 * "Ask an expert" opens three approved options (`ask-expert-copy.ts`). An option draws only when the card's
 * city has an expert of that kind, and choosing it starts the existing ask with one such expert. The answer
 * comes from the public directory read the ask already uses (`GET /api/experts?location=`), which lists
 * routable experts only - so there is no new route, and nothing here decides who is routable.
 *
 * PURE: no React, no fetch.
 */
import { ASK_CHOICES, type AskChoiceKind } from "./action-engine";

export interface AskChoiceOption {
  kind: AskChoiceKind;
  /** The first directory expert of this kind in the city; the ask opens with them. */
  expertId: string;
}

/** The directory's stored role for a chooser kind. The legacy `expert` role is a trip planner (`/api/experts`). */
function kindOfRole(role: unknown): AskChoiceKind | null {
  if (role === "local_expert") return "local_expert";
  if (role === "travel_expert" || role === "expert") return "travel_expert";
  if (role === "event_planner") return "event_planner";
  return null;
}

/** The options to draw, in the approved order. A kind with no expert in the answer is absent, never greyed. */
export function askChoiceOptions(experts: unknown): AskChoiceOption[] {
  if (!Array.isArray(experts)) return [];
  const first = new Map<AskChoiceKind, string>();
  for (const e of experts) {
    const kind = kindOfRole((e as any)?.role);
    const id = (e as any)?.id;
    if (kind && id != null && !first.has(kind)) first.set(kind, String(id));
  }
  return ASK_CHOICES.filter((c) => first.has(c.kind)).map((c) => ({ kind: c.kind, expertId: first.get(c.kind)! }));
}

/** The directory read for a city: the same URL `useAskExpert` resolves a city with. */
export function askChooserExpertsUrl(city: string): string {
  return `/api/experts?location=${encodeURIComponent(city)}`;
}
