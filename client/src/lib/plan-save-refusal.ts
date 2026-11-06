/**
 * R4b-1 (round 4b, Nov 6, 2026): the one refusal a save names to the traveler. Both rails answer an event outside the
 * plan's confirmed dates with 400 `{ code: "event_outside_dates", eventDate }`; this turns that answer into the
 * approved toast ("That event is on {date}, outside your plan's dates." — Wording approved — Leon). Any other answer ⇒
 * null, and the caller keeps its own failure words.
 */
import { eventOutsideDatesMessage } from "@shared/plan-dates";

/** From a parsed body. */
export function planSaveRefusalFromBody(body: unknown): string | null {
  const b = body as { code?: unknown; eventDate?: unknown } | null;
  if (!b || b.code !== "event_outside_dates" || typeof b.eventDate !== "string") return null;
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
