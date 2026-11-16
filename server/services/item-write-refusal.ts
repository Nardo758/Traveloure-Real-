/**
 * QA round 4 R4-9 (Leon, Nov 13, 2026: "A too-late day keeps being refused, logged with its code").
 *
 * `POST /api/trips/:tripId/itinerary-items` answered 400 on two prod plans and nothing was logged, so nobody could say
 * which check refused the write. Every 400 on that rail now goes through `refuseItemWrite`: the body carries a `code`
 * (machine-readable; the traveler's words are unchanged — `plan-save-refusal.ts` still names only
 * `event_outside_dates`, every other code keeps the caller's own failure words), and ONE log line names the code, the
 * plan, the caller and the detail that decided it. The detail is ids, numbers and field paths — never a body value.
 */
import type { Response } from "express";

/** Every code the add rail answers 400 with. The CAP-2 reasons (`PlanItemRejectReason`) are passed through as-is. */
export type ItemWriteRefusalCode =
  | "invalid_pending_gem"
  | "invalid_body"
  | "invalid_booking_inputs"
  | "invalid_event_link"
  | "event_link_refused"
  | "invalid_affiliate_link"
  | "affiliate_refused"
  | "authoring_price_refused"
  | "unknown_kind"
  | "unknown_source"
  | "source_withdrawn"
  | "city_mismatch"
  | "unplaceable"
  | "event_outside_dates";

export interface ItemWriteRefusalContext {
  tripId: string;
  userId: string | null | undefined;
  /** Ids, numbers, field paths — never a free-text value from the body. */
  detail?: Record<string, string | number | boolean | null | undefined | ReadonlyArray<string>>;
}

/** Pure: the one log line. `[itinerary-items] 400 <code> trip=<id> user=<id> <detail json>`. */
export function itemWriteRefusalLine(code: ItemWriteRefusalCode, ctx: ItemWriteRefusalContext): string {
  const detail = Object.fromEntries(Object.entries(ctx.detail ?? {}).filter(([, v]) => v !== undefined));
  const tail = Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : "";
  return `[itinerary-items] 400 ${code} trip=${ctx.tripId} user=${ctx.userId ?? "-"}${tail}`;
}

/** Zod issues → their field paths only (the message names the rule; no value is ever read). */
export function issuePaths(issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; code?: string }>): string[] {
  return issues.map((i) => `${i.path.join(".") || "(root)"}:${i.code ?? "invalid"}`).slice(0, 10);
}

/** Log the refusal, then answer 400 with `{ code, ...body }`. */
export function refuseItemWrite(
  res: Response,
  code: ItemWriteRefusalCode,
  body: Record<string, unknown>,
  ctx: ItemWriteRefusalContext,
  log: (line: string) => void = (line) => console.warn(line),
): Response {
  log(itemWriteRefusalLine(code, ctx));
  return res.status(400).json({ code, ...body });
}
