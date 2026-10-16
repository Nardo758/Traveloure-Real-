import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminBookingDetailPath,
  adminBookingListQueryString,
  parseAdminBookingListQuery,
} from "../admin-booking-list";

test("AL1: defaults to service bookings with no other filter", () => {
  assert.deepEqual(parseAdminBookingListQuery({}), {
    ok: true,
    filters: { kind: "service", status: null, from: null, to: null },
  });
});

test("AL2: status, kind and a day range are accepted; blanks are no filter", () => {
  assert.deepEqual(
    parseAdminBookingListQuery({ kind: "liteapi", status: "needs_review", from: "2026-10-01", to: "2026-10-16" }),
    { ok: true, filters: { kind: "liteapi", status: "needs_review", from: "2026-10-01", to: "2026-10-16" } },
  );
  assert.deepEqual(parseAdminBookingListQuery({ kind: "legacy", status: "", from: " ", to: "" }), {
    ok: true,
    filters: { kind: "legacy", status: null, from: null, to: null },
  });
});

test("AL3: a bad filter is refused, never guessed", () => {
  for (const query of [
    { kind: "trips" },
    { kind: ["service", "legacy"] },
    { status: "Needs Review" },
    { status: "x'; drop table" },
    { from: "2026-02-30" },
    { to: "16/10/2026" },
    { from: "2026-10-16", to: "2026-10-01" },
  ]) {
    assert.equal(parseAdminBookingListQuery(query as any).ok, false, JSON.stringify(query));
  }
});

test("AL4: the page's query string and the row link", () => {
  assert.equal(
    adminBookingListQueryString({ kind: "service", status: "needs_review", from: null, to: "2026-10-16" }),
    "kind=service&status=needs_review&to=2026-10-16",
  );
  assert.equal(adminBookingDetailPath("legacy", "42"), "/admin/bookings/legacy/42");
  assert.equal(adminBookingDetailPath("service", "booking-1/x"), "/admin/bookings/service/booking-1%2Fx");
});
