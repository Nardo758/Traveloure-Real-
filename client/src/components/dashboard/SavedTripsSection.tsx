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
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
      style={{
        background: urgent ? "rgba(226,75,74,0.1)" : "rgba(239,159,39,0.1)",
        color: urgent ? "#E24B4A" : "#EF9F27",
      }}
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
    mutationFn: async (savedTripId: string): Promise<ConvertResponse> => {
      const res = await apiRequest("POST", `/api/saved-trips/${savedTripId}/convert`);
      return res.json() as Promise<ConvertResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Trip created!", description: "Your plan is ready — let's build it out." });
      navigate(`/trip/${data.tripId}`);
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Could not create the trip. Please try again.", variant: "destructive" });
    },
  });

  if (isLoading || !savedTrips || savedTrips.length === 0) return null;

  return (
    <section data-testid="saved-trips-section">
      <div className="text-[13px] font-medium mb-2.5 flex items-center gap-1.5" style={{ color: "#1A1A18" }}>
        <Bookmark className="w-4 h-4" style={{ color: "#E85D55" }} />
        <span>Saved for later</span>
        <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F3F3EE", color: "#7A7A72" }}>
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
              className="flex items-center justify-between rounded-xl px-4 py-3 gap-3"
              style={{ background: "#FFFFFF", border: "0.5px solid #E8E8E2" }}
              data-testid={`saved-trip-card-${st.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[14px] font-medium truncate" style={{ color: "#1A1A18" }}>
                    {destination}
                  </span>
                  <ExpiryBadge expiresAt={st.expires_at} />
                </div>
                <div className="text-[12px] flex flex-wrap gap-2" style={{ color: "#7A7A72" }}>
                  {dateRange && <span>{dateRange}</span>}
                  {travelers && <span>· {travelers}</span>}
                  {price && <span>· est. {price}</span>}
                </div>
                {st.notes && (
                  <div className="text-[11px] mt-1 italic truncate" style={{ color: "#7A7A72" }}>
                    {st.notes}
                  </div>
                )}
              </div>

              <Button
                size="sm"
                className="shrink-0 text-white text-[12px] h-8 px-3 gap-1"
                style={{ background: "#E85D55", border: "none" }}
                onClick={() => convertMutation.mutate(st.id)}
                disabled={isConverting || convertMutation.isPending}
                data-testid={`button-start-planning-${st.id}`}
              >
                {isConverting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    Start planning this
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
