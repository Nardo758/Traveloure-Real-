/**
 * QA round 4 R4-9 (Leon, Nov 13, 2026): `POST /api/trips/:id/itinerary-items` answered 400 on two prod plans with
 * nothing logged. Decision (4): "A too-late day keeps being refused, logged with its code."
 *
 *   I1 the log line names the code, the plan, the caller and the detail (ids/numbers/paths only)
 *   I2 `refuseItemWrite` logs once and answers 400 with `{ code, ...body }` (the message is unchanged)
 *   I3 zod issues are logged as field paths, never values
 *   I4 the rail: every 400 in the POST handler goes through `refuseItemWrite` with a code, and the day-past-the-end
 *      refusal is logged as `day_past_plan_end` with the day and the plan's length
 *
 * STATED LIMIT (§18d): the handler lives in the `server/routes.ts` monolith, which no test mounts; I4 pins the source.
 *
 * Run: npx tsx --test server/__tests__/r4-item-write-refusal.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { issuePaths, itemWriteRefusalLine, refuseItemWrite } from "../services/item-write-refusal";

describe("QA round 4 R4-9 — every add-rail 400 is logged with its code", () => {
  it("I1 the one log line", () => {
    assert.equal(
      itemWriteRefusalLine("unplaceable", { tripId: "t1", userId: "u1", detail: { step: "day_past_plan_end", dayNumber: 7, planDays: 5, kind: undefined } }),
      '[itinerary-items] 400 unplaceable trip=t1 user=u1 {"step":"day_past_plan_end","dayNumber":7,"planDays":5}',
    );
    assert.equal(itemWriteRefusalLine("authoring_price_refused", { tripId: "t2", userId: null }), "[itinerary-items] 400 authoring_price_refused trip=t2 user=-");
  });

  it("I2 logs once, answers 400 with the code and the unchanged body", () => {
    const lines: string[] = [];
    let status = 0;
    let sent: any = null;
    const res: any = { status: (n: number) => ((status = n), res), json: (b: unknown) => ((sent = b), res) };
    refuseItemWrite(res, "event_outside_dates", { eventDate: "2026-11-17", message: "That event is on Nov 17, outside your plan's dates." }, { tripId: "t", userId: "u", detail: { eventDate: "2026-11-17" } }, (l) => lines.push(l));
    assert.equal(status, 400);
    assert.deepEqual(sent, { code: "event_outside_dates", eventDate: "2026-11-17", message: "That event is on Nov 17, outside your plan's dates." });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[itinerary-items\] 400 event_outside_dates trip=t user=u /);
  });

  it("I3 zod issues become field paths", () => {
    assert.deepEqual(issuePaths([{ path: ["dayNumber"], code: "too_big" }, { path: [], code: "custom" }, { path: ["ref", "placement", "day_number"] }]), [
      "dayNumber:too_big",
      "(root):custom",
      "ref.placement.day_number:invalid",
    ]);
  });

  it("I4 the POST handler: no bare 400, every refusal has a code, the too-late day is named", () => {
    const routes = fs.readFileSync("server/routes.ts", "utf8");
    const start = routes.indexOf('app.post("/api/trips/:tripId/itinerary-items", isAuthenticated');
    assert.ok(start > 0);
    const end = routes.indexOf("\n  app.", start + 10);
    const handler = routes.slice(start, end);
    assert.doesNotMatch(handler, /res\.status\(400\)/, "every 400 goes through refuseItemWrite");
    const calls = handler.match(/refuseItemWrite\(res, [^,]+,/g) ?? [];
    assert.equal(calls.length, 12, calls.join("\n"));
    for (const c of ["invalid_pending_gem", "invalid_body", "invalid_booking_inputs", "invalid_event_link", "event_link_refused", "invalid_affiliate_link", "affiliate_refused", "unknown_kind", "event_outside_dates", "authoring_price_refused"]) {
      assert.match(handler, new RegExp(`refuseItemWrite\\(res, "${c}"`), c);
    }
    assert.match(handler, /refuseItemWrite\(res, parsedRef\.reason,/);
    assert.match(handler, /refuseItemWrite\(res, resolved\.reason,/);
    assert.match(handler, /step: dayPastEnd \? "day_past_plan_end" : "resolve_ref"/);
    assert.match(handler, /dayNumber: chosenDay,\s*planDays,/);
  });
});
