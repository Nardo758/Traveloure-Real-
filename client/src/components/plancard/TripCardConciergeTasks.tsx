/**
 * CN-1e-UI: the Trip Card's "Tasks" button on the YOUR EXPERT card, for a concierge advisor whose access is open.
 * The booking id is resolved from GET /api/my-bookings ON OPEN (one read when tapped, never on render) — the
 * confirmed concierge booking on this trip. Once access has ended there is no button (the CN-1d-UI ended line
 * shows instead).
 */
import React, { useState } from "react";
import { ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { serverMessageOf } from "@/lib/concierge-hire-copy";
import { CONCIERGE_TASK_COPY, conciergeAccessOpen, conciergeBookingForTrip } from "@/lib/concierge-task-copy";
import { ConciergeTaskLogDialog } from "@/components/concierge-task-log";
import type { SlipRailAdvisor } from "@/lib/slip-rail";

interface MyBookingRow {
  id: string;
  tripId?: string | null;
  serviceId?: string | null;
  status?: string | null;
  service?: { id?: string | null; serviceType?: string | null } | null;
}

export function TripCardConciergeTasks({ tripId, advisor, expertFirstName }: { tripId: string; advisor: SlipRailAdvisor | null; expertFirstName: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<MyBookingRow | null>(null);
  if (!conciergeAccessOpen(advisor, new Date())) return null;

  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      const rows = (await (await apiRequest("GET", "/api/my-bookings")).json()) as MyBookingRow[];
      const found = conciergeBookingForTrip(rows, tripId);
      if (found) setBooking(found);
    } catch (err) {
      toast({ title: "Error", description: serverMessageOf(err) ?? undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start h-auto py-2 px-2.5 text-[13px] font-semibold"
        onClick={() => void open()}
        disabled={loading}
        data-testid="trip-card-expert-tasks"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <ListChecks className="w-3.5 h-3.5 mr-2" />}
        {CONCIERGE_TASK_COPY.tasks}
      </Button>
      {booking && (
        <ConciergeTaskLogDialog
          open={!!booking}
          onOpenChange={(o) => {
            if (!o) setBooking(null);
          }}
          bookingId={booking.id}
          tripId={tripId}
          viewer="traveler"
          expertFirstName={expertFirstName}
          listingServiceId={booking.service?.id ?? booking.serviceId ?? null}
        />
      )}
    </>
  );
}
