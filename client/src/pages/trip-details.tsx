import { useParams, Link } from "wouter";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/hooks/use-trips";
import { useQuery } from "@tanstack/react-query";
import { PlanCard } from "@/components/plancard/PlanCard";
import type { PlanCardTrip } from "@/components/plancard/plancard-types";

interface Notification {
  id: string | number;
  title?: string;
  message?: string;
  type?: string;
  createdAt?: string;
  tripId?: string | null;
  read?: boolean;
}

interface Conversation {
  id: number;
  title: string;
  userId?: string | null;
  createdAt: string;
}

interface ShareInfo {
  shareToken?: string | null;
  variantId?: string | null;
  expertStatus?: string | null;
  expertNotes?: string | null;
}

export default function TripDetails() {
  const { id } = useParams();
  const { data: trip, isLoading } = useTrip(id || "");

  const { data: notificationsData } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: shareInfo } = useQuery<ShareInfo>({
    queryKey: ["/api/trips", id, "itinerary-token"],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${id}/itinerary-token`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!id,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-foreground">Trip not found</h2>
        <Link href="/dashboard">
          <Button variant="outline" data-testid="button-back-dashboard">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const resolvedShareToken = shareInfo?.shareToken ?? (trip as any).shareToken ?? null;

  const planCardTrip: PlanCardTrip = {
    id: trip.id,
    destination: trip.destination ?? "",
    title: trip.title ?? undefined,
    startDate: trip.startDate ?? undefined,
    endDate: trip.endDate ?? undefined,
    numberOfTravelers: trip.numberOfTravelers ?? 1,
    budget: trip.budget ?? undefined,
    eventType: trip.eventType ?? undefined,
    status: trip.status ?? undefined,
    shareToken: resolvedShareToken,
    trackingNumber: (trip as any).trackingNumber ?? null,
    expertNotes: trip.expertNotes ?? null,
  };

  const score = resolvedShareToken
    ? { tripId: trip.id, optimizationScore: null, shareToken: resolvedShareToken }
    : undefined;

  return (
    <div className="py-4 px-4" data-testid="trip-details-page">
      <div className="mb-4">
        <Link href="/dashboard">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-1.5"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="max-w-[560px] mx-auto">
        <PlanCard
          trip={planCardTrip}
          score={score}
          index={0}
          conversations={conversations ?? []}
          notifications={notificationsData ?? []}
        />
      </div>
    </div>
  );
}
