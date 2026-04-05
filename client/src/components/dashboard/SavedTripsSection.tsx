import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bookmark, ArrowRight, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";

interface SavedTrip {
  id: string;
  variant_id: string | null;
  comparison_id: string | null;
  notes: string | null;
  saved_at: string;
  expires_at: string | null;
  price_snapshot: string | null;
  status: string;
  variant_name: string | null;
  variant_cost: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  travelers: number | null;
  trip_id: string | null;
}

interface ConvertResponse {
  success: boolean;
  tripId: string;
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const daysLeft = differenceInDays(new Date(expiresAt), new Date());
  if (daysLeft < 0) return null;
  const urgent = daysLeft <= 7;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
        urgent
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      }`}
      data-testid="saved-trip-expiry"
    >
      <Clock className="w-3 h-3" />
      {daysLeft === 0 ? "Expires today" : `${daysLeft}d left`}
    </span>
  );
}

export function SavedTripsSection() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: savedTrips, isLoading } = useQuery<SavedTrip[]>({
    queryKey: ["/api/saved-trips"],
  });

  const convertMutation = useMutation({
    mutationFn: async (savedTripId: string): Promise<ConvertResponse> =>
      apiRequest("POST", `/api/saved-trips/${savedTripId}/convert`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Trip created!", description: "Your plan is ready — let's build it out." });
      navigate(`/my-trips`);
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Could not create the trip. Please try again.", variant: "destructive" });
    },
  });

  if (isLoading || !savedTrips || savedTrips.length === 0) return null;

  return (
    <section className="mb-6" data-testid="saved-trips-section">
      <div className="text-sm font-medium text-foreground mb-3 flex items-center gap-1.5">
        <Bookmark className="w-4 h-4 text-[#E85D55]" />
        <span>Saved for later</span>
        <span className="ml-1 text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {savedTrips.length}
        </span>
      </div>

      <div className="space-y-3">
        {savedTrips.map((st) => {
          const destination = st.destination ?? "Unknown destination";
          const startDate = st.start_date ? format(new Date(st.start_date), "d MMM") : null;
          const endDate = st.end_date ? format(new Date(st.end_date), "d MMM yyyy") : null;
          const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : null;
          const price = st.price_snapshot ? `$${Number(st.price_snapshot).toLocaleString()}` : null;
          const travelers = st.travelers ? `${st.travelers} traveler${st.travelers !== 1 ? "s" : ""}` : null;
          const isConverting = convertMutation.isPending && convertMutation.variables === st.id;

          return (
            <div
              key={st.id}
              className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 gap-3"
              data-testid={`saved-trip-card-${st.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[14px] font-medium text-foreground truncate">
                    {destination}
                  </span>
                  <ExpiryBadge expiresAt={st.expires_at} />
                </div>
                <div className="text-[12px] text-muted-foreground flex flex-wrap gap-2">
                  {dateRange && <span>{dateRange}</span>}
                  {travelers && <span>· {travelers}</span>}
                  {price && <span>· est. {price}</span>}
                </div>
                {st.notes && (
                  <div className="text-[11px] text-muted-foreground mt-1 italic truncate">
                    {st.notes}
                  </div>
                )}
              </div>

              <Button
                size="sm"
                className="shrink-0 bg-[#FF385C] hover:bg-[#E23350] text-white text-[12px] h-8 px-3 gap-1"
                onClick={() => convertMutation.mutate(st.id)}
                disabled={isConverting || convertMutation.isPending}
                data-testid={`button-start-planning-${st.id}`}
              >
                {isConverting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    Start planning
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
