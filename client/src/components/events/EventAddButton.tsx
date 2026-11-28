/**
 * AN EVENT'S ADD (cut-list #1 slice C; F2, Leon, Nov 19) - the one AddToPlanButton over the event's `city_event`
 * row: spinner while it saves, "Added" once the plan holds it, the add toast and the first-add calendar from the
 * runner. Drawn beside "Plan around it" on the /experiences cards, the /events calendar rows and the landing strip.
 *
 * An event that names no row of ours draws nothing: no source id, or a partner-catalog event (it has no
 * `city_events` row for the add to name).
 */
import type { CityEventCard } from "@shared/city-events";
import { planItemRefFromFeedItem } from "@shared/plan-item-ref";
import { AddToPlanButton } from "@/components/plan/AddToPlanButton";
import { useDirectPlanAdd } from "@/lib/browse-save";
import { savedRefKey, useRefSavedState } from "@/lib/saved-refs";

const DEFAULT_CLASS = "inline-flex h-9 items-center rounded-md border border-border px-3 text-[13px] font-semibold";

export function EventAddButton({
  event,
  testIdPrefix = "plan-entry-event-add",
  className = DEFAULT_CLASS,
}: {
  event: CityEventCard & { partner?: boolean };
  testIdPrefix?: string;
  className?: string;
}) {
  const add = useDirectPlanAdd();
  // The city_event rail names the event by its source id (the resolver's key); an event that carries none names no row.
  const ref =
    event.sourceId && !event.partner
      ? planItemRefFromFeedItem({ type: "city_event", sourceContentId: event.sourceId, startsAt: event.startsAt, endsAt: event.endsAt }, event.city)
      : null;
  const key = savedRefKey(ref);
  const { saved, inert } = useRefSavedState(key);
  if (!ref) return null;
  return (
    <AddToPlanButton
      testId={`${testIdPrefix}-${event.id}`}
      className={className}
      pendingKey={key}
      added={saved}
      addedInert={inert}
      onClick={() => add({ ref, city: event.city })}
    />
  );
}
