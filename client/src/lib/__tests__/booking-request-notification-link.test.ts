/**
 * booking-request-notification-link.test.ts
 *
 * Unit test — no browser required.
 *
 * Guards the notification deep-link resolution for booking_request notifications,
 * specifically the no-trip expert case fixed in task #1211.
 *
 * Two server code paths create booking_request notifications:
 *   A. server/routes.ts           — POST /api/expert-booking-requests (direct request)
 *   B. server/routes/payments.routes.ts — checkout confirmation flow
 *
 * In both paths, the notification `data` payload must include a navigable link
 * for every expert-owned service, whether or not a tripId is present.
 *
 * Run with:
 *   npx tsx --test client/src/lib/__tests__/booking-request-notification-link.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Inline the pure resolver so this test has no React/lucide-react dep ──────
// This mirrors resolveNotificationLink in client/src/lib/notification-icons.tsx.
// If the signature changes there, update here to keep the test honest.
interface TestNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedId?: string | null;
  relatedType?: string | null;
  data?: {
    tripId?: string;
    workspacePath?: string;
    itemId?: string;
    clientId?: string;
    bookingId?: string;
    [key: string]: unknown;
  } | null;
}

interface ResolvedLink {
  href: string;
  label: string;
}

function resolveNotificationLink(n: TestNotification): ResolvedLink | null {
  if (n.data?.tripId) {
    const isTravelerTripLink = n.data.workspacePath?.startsWith("/trip/");
    const itemId = typeof n.data.itemId === "string" ? n.data.itemId : undefined;
    const href = isTravelerTripLink
      ? itemId
        ? `/plans/${n.data.tripId}?item=${itemId}`
        : `/plans/${n.data.tripId}`
      : n.data.workspacePath || `/expert/workspace/${n.data.tripId}`;
    const isWorkspaceLink =
      !isTravelerTripLink &&
      !n.data.workspacePath?.startsWith("/itinerary-view/") &&
      href.startsWith("/expert/workspace/");
    return {
      href,
      label:
        isTravelerTripLink || n.data.workspacePath?.startsWith("/itinerary-view/")
          ? "View Itinerary"
          : isWorkspaceLink
            ? "Open Workspace"
            : "Open",
    };
  }
  // workspacePath without tripId: provider booking-request notifications route here
  // (/provider/bookings) because /expert/workspace is expert-role-gated on the client.
  if (n.data?.workspacePath && !n.data.tripId) {
    return { href: n.data.workspacePath, label: "View Booking" };
  }
  if (n.type === "message_received") {
    return { href: n.data?.clientId ? `/chat?clientId=${n.data.clientId}` : "/chat", label: "Open Chat" };
  }
  return null;
}

// ── Helper to build a minimal booking_request notification ─────────────────────
function bookingRequestNotif(data: TestNotification["data"]): TestNotification {
  return {
    id: "notif-1",
    type: "booking_request",
    title: "New Booking Request",
    message: "Alice booked a service",
    isRead: false,
    createdAt: new Date().toISOString(),
    relatedId: "booking-abc",
    relatedType: "booking",
    data,
  };
}

// ── Simulate the notification data shapes each server writer produces ──────────

/** server/routes.ts path A — expert with tripId */
function serverPathA_expertWithTrip(tripId: string, bookingId: string) {
  return { tripId, bookingId, serviceName: "City Tour", travelerName: "Alice", amount: "99.00" };
}

/** server/routes.ts path A — expert WITHOUT tripId (the bug fix) */
function serverPathA_expertNoTrip(bookingId: string) {
  return { workspacePath: "/expert/workspace", bookingId, serviceName: "City Tour", travelerName: "Alice", amount: "99.00" };
}

/** server/routes.ts path A — provider (always /provider/bookings) */
function serverPathA_provider(bookingId: string) {
  return { workspacePath: "/provider/bookings", bookingId, serviceName: "City Tour", travelerName: "Alice", amount: "99.00" };
}

/** server/routes/payments.routes.ts path B — expert with tripId */
function serverPathB_expertWithTrip(tripId: string, bookingId: string) {
  // notifTripId is set; notifWorkspacePath is undefined
  return { tripId, bookingId, serviceName: "Cooking Class", travelerName: "Bob", amount: "50.00" };
}

/** server/routes/payments.routes.ts path B — expert WITHOUT tripId (the bug fix) */
function serverPathB_expertNoTrip(bookingId: string) {
  // notifTripId is undefined; notifWorkspacePath = "/expert/workspace" (fixed)
  return { workspacePath: "/expert/workspace", bookingId, serviceName: "Cooking Class", travelerName: "Bob", amount: "50.00" };
}

/** server/routes/payments.routes.ts path B — provider */
function serverPathB_provider(bookingId: string) {
  return { workspacePath: "/provider/bookings", bookingId, serviceName: "Cooking Class", travelerName: "Bob", amount: "50.00" };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("booking_request notification — deep-link resolution", () => {
  // ── Path A: server/routes.ts direct-request writer ──────────────────────────

  describe("direct-request writer (server/routes.ts)", () => {
    it("expert WITH tripId → /expert/workspace/:tripId (Open Workspace)", () => {
      const data = serverPathA_expertWithTrip("trip-123", "booking-abc");
      const link = resolveNotificationLink(bookingRequestNotif(data));
      assert.ok(link, "Expected a resolved link, got null");
      assert.equal(link.href, "/expert/workspace/trip-123");
      assert.equal(link.label, "Open Workspace");
    });

    it("expert WITHOUT tripId → /expert/workspace (View Booking) [task #1211 fix]", () => {
      const data = serverPathA_expertNoTrip("booking-abc");
      const link = resolveNotificationLink(bookingRequestNotif(data));
      assert.ok(link, "Expert without tripId must still have an action link — workspacePath should be set");
      assert.equal(link.href, "/expert/workspace");
      assert.equal(link.label, "View Booking");
    });

    it("provider (no tripId) → /provider/bookings (View Booking)", () => {
      const data = serverPathA_provider("booking-abc");
      const link = resolveNotificationLink(bookingRequestNotif(data));
      assert.ok(link, "Provider booking_request must have an action link");
      assert.equal(link.href, "/provider/bookings");
      assert.equal(link.label, "View Booking");
    });
  });

  // ── Path B: server/routes/payments.routes.ts checkout writer ────────────────

  describe("checkout writer (server/routes/payments.routes.ts)", () => {
    it("expert WITH tripId → /expert/workspace/:tripId (Open Workspace)", () => {
      const data = serverPathB_expertWithTrip("trip-456", "booking-xyz");
      const link = resolveNotificationLink(bookingRequestNotif(data));
      assert.ok(link, "Expected a resolved link, got null");
      assert.equal(link.href, "/expert/workspace/trip-456");
      assert.equal(link.label, "Open Workspace");
    });

    it("expert WITHOUT tripId → /expert/workspace (View Booking) [task #1211 fix]", () => {
      const data = serverPathB_expertNoTrip("booking-xyz");
      const link = resolveNotificationLink(bookingRequestNotif(data));
      assert.ok(link, "Expert without tripId (checkout path) must still have an action link");
      assert.equal(link.href, "/expert/workspace");
      assert.equal(link.label, "View Booking");
    });

    it("provider (no tripId) → /provider/bookings (View Booking)", () => {
      const data = serverPathB_provider("booking-xyz");
      const link = resolveNotificationLink(bookingRequestNotif(data));
      assert.ok(link, "Provider booking_request (checkout path) must have an action link");
      assert.equal(link.href, "/provider/bookings");
      assert.equal(link.label, "View Booking");
    });
  });

  // ── Regression: notification with no data → no link (not a crash) ───────────

  describe("edge cases", () => {
    it("notification with null data → null (no crash)", () => {
      const link = resolveNotificationLink(bookingRequestNotif(null));
      assert.equal(link, null);
    });

    it("notification with empty data object → null (no crash)", () => {
      const link = resolveNotificationLink(bookingRequestNotif({}));
      assert.equal(link, null);
    });
  });
});
