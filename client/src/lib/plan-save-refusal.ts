/**
 * R4b-1 (round 4b, Nov 6, 2026): the refusals a save names to the traveler. Both rails answer an event outside the
 * plan's confirmed dates with 400 `{ code: "event_outside_dates", eventDate }`; this turns that answer into the
 * approved toast ("That event is on {date}, outside your plan's dates." — Wording approved — Leon). Any other answer ⇒
 * null, and the caller keeps its own failure words.
 */
import { DAY_PAST_PLAN_END_MESSAGE, DAY_PAST_PLAN_END_REASON, eventOutsideDatesMessage } from "@shared/plan-dates";

/**
 * From a parsed body. QA round 4 R4-9: a stop whose day is past the plan's last day — `unplaceable` with
 * `reason: "day_past_plan_end"` on either rail — says "That day is past your plan's last day." (Wording approved —
 * Leon, t2011u). Every other `unplaceable` keeps the caller's own words.
 */
export function planSaveRefusalFromBody(body: unknown): string | null {
  const b = body as { code?: unknown; eventDate?: unknown; reason?: unknown } | null;
  if (!b) return null;
  if (b.code === "unplaceable" && b.reason === DAY_PAST_PLAN_END_REASON) return DAY_PAST_PLAN_END_MESSAGE;
  if (b.code !== "event_outside_dates" || typeof b.eventDate !== "string") return null;
  return eventOutsideDatesMessage(b.eventDate);
}

/** From an `apiRequest` error ("<status>: <body text>") or any error whose message carries that shape. */
export function planSaveRefusalMessage(err: unknown): string | null {
  const msg = String((err as Error | null)?.message ?? "");
  const m = /^\d{3}:\s*([\s\S]*)$/.exec(msg);
  if (!m) return null;
  try {
    return planSaveRefusalFromBody(JSON.parse(m[1]));
  } catch {
    return null;
  }
}
