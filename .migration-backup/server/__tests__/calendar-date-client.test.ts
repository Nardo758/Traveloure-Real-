import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calendarDateToIso, parseCalendarDate } from "../../client/src/lib/calendar-date";

describe("client calendar-date parsing", () => {
  it("keeps date-only values on the same calendar day", () => {
    const date = parseCalendarDate("2034-06-20");
    assert.ok(date);
    assert.equal(date.getFullYear(), 2034);
    assert.equal(date.getMonth(), 5);
    assert.equal(date.getDate(), 20);
    assert.equal(calendarDateToIso("2034-06-20T00:00:00.000Z"), "2034-06-20");
  });

  it("rejects impossible calendar dates", () => {
    assert.equal(parseCalendarDate("2034-02-29"), null);
    assert.equal(calendarDateToIso("not-a-date"), "");
  });
});