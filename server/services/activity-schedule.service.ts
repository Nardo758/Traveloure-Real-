export interface ScheduleActivity {
  id: string;
  dayNumber: number;
  order: number;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
}

export interface ScheduleLeg {
  dayNumber: number;
  fromActivityId?: string | null;
  toActivityId?: string | null;
  estimatedDurationMinutes: number;
}

export interface ScheduleUpdate {
  id: string;
  startTime: string | null;
  endTime: string | null;
  travelTimeFromPrevious: number | null;
}

export interface ScheduleUnresolved {
  activityId: string;
  reason: "missing_departure" | "missing_duration" | "route_unavailable" | "day_boundary" | "schedule_conflict";
}

function parseWallClock(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function formatWallClock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Advances only genuinely unscheduled activities. Explicit starts remain fixed. A downstream
 * time is produced only when the prior start, prior activity duration, and routed leg all exist.
 */
export function propagateActivitySchedule(
  activities: ScheduleActivity[],
  legs: ScheduleLeg[],
): { updates: ScheduleUpdate[]; unresolved: ScheduleUnresolved[] } {
  const updates: ScheduleUpdate[] = [];
  const unresolved: ScheduleUnresolved[] = [];
  const legByPair = new Map(
    legs
      .filter((leg) => leg.fromActivityId && leg.toActivityId)
      .map((leg) => [`${leg.dayNumber}|${leg.fromActivityId}|${leg.toActivityId}`, leg]),
  );

  const byDay = new Map<number, ScheduleActivity[]>();
  for (const activity of activities) {
    const day = byDay.get(activity.dayNumber) ?? [];
    day.push(activity);
    byDay.set(activity.dayNumber, day);
  }

  for (const [dayNumber, dayActivities] of Array.from(byDay.entries())) {
    const ordered = [...dayActivities].sort((a, b) => a.order - b.order);
    let previous: ScheduleActivity | null = null;
    let previousStart: number | null = null;

    for (const activity of ordered) {
      const explicitStart = parseWallClock(activity.startTime);
      let computedStart = explicitStart;
      let travelTimeFromPrevious: number | null = null;

      if (previous) {
        const leg = legByPair.get(`${dayNumber}|${previous.id}|${activity.id}`);
        travelTimeFromPrevious = leg?.estimatedDurationMinutes ?? null;

        if (
          computedStart !== null &&
          previousStart !== null &&
          previous.durationMinutes != null &&
          previous.durationMinutes > 0 &&
          leg &&
          computedStart < previousStart + previous.durationMinutes + leg.estimatedDurationMinutes
        ) {
          // Explicit authored times remain fixed, but an impossible gap must be visible to callers.
          unresolved.push({ activityId: activity.id, reason: "schedule_conflict" });
        } else if (computedStart === null) {
          if (previousStart === null) {
            unresolved.push({ activityId: activity.id, reason: "missing_departure" });
          } else if (previous.durationMinutes == null || previous.durationMinutes <= 0) {
            unresolved.push({ activityId: activity.id, reason: "missing_duration" });
          } else if (!leg || leg.estimatedDurationMinutes < 0) {
            unresolved.push({ activityId: activity.id, reason: "route_unavailable" });
          } else {
            const candidate: number = previousStart + previous.durationMinutes + leg.estimatedDurationMinutes;
            if (candidate >= 24 * 60) {
              unresolved.push({ activityId: activity.id, reason: "day_boundary" });
            } else {
              computedStart = candidate;
            }
          }
        }
      }

      let endTime: string | null = activity.endTime ?? null;
      if (computedStart !== null && activity.durationMinutes != null && activity.durationMinutes > 0) {
        const candidateEnd = computedStart + activity.durationMinutes;
        if (candidateEnd < 24 * 60) {
          endTime = formatWallClock(candidateEnd);
        } else {
          endTime = null;
          unresolved.push({ activityId: activity.id, reason: "day_boundary" });
        }
      }

      updates.push({
        id: activity.id,
        startTime: computedStart === null ? null : formatWallClock(computedStart),
        endTime,
        travelTimeFromPrevious,
      });
      previous = activity;
      previousStart = computedStart;
    }
  }

  return { updates, unresolved };
}