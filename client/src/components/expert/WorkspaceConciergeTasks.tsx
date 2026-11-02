/**
 * CN-1e-UI: the Workstation's Distribute → Client card shows the task log INLINE when this trip's assignment is a
 * concierge hire. The booking is resolved client-side from GET /api/expert/bookings (the confirmed concierge booking
 * on this trip); with none, nothing renders.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { firstNameOf } from "@/lib/concierge-hire-copy";
import { conciergeBookingForTrip } from "@/lib/concierge-task-copy";
import { ConciergeTaskLog } from "@/components/concierge-task-log";

interface ExpertBookingRow {
  id: string;
  tripId?: string | null;
  serviceId?: string | null;
  status?: string | null;
  service?: { id?: string | null; serviceType?: string | null } | null;
}

/** Whether the Workstation mounts the task log: only for an assignment that came from a concierge hire. */
export function workspaceMountsTaskLog(assignment: { source?: string | null } | null | undefined): boolean {
  return assignment?.source === "concierge";
}

export function WorkspaceConciergeTasks({ tripId, assignment }: { tripId: string; assignment: { source?: string | null } | null | undefined }) {
  const { user } = useAuth();
  const mounted = workspaceMountsTaskLog(assignment);
  const { data: bookings } = useQuery<ExpertBookingRow[]>({ queryKey: ["/api/expert/bookings"], enabled: mounted });
  if (!mounted) return null;
  const booking = conciergeBookingForTrip(bookings, tripId);
  if (!booking) return null;
  return (
    <div style={{ padding: "12px", borderBottom: "1px solid #E8E8E2" }} data-testid="workspace-concierge-tasks">
      <ConciergeTaskLog
        bookingId={booking.id}
        tripId={tripId}
        viewer="expert"
        expertFirstName={firstNameOf((user as any)?.firstName ?? null) ?? ""}
        listingServiceId={booking.service?.id ?? booking.serviceId ?? null}
      />
    </div>
  );
}
