import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTrips } from "@/hooks/use-trips";

export function PastExperiencesScroll() {
  const { data: trips } = useTrips();
  const now = new Date();

  const pastTrips = (trips ?? [])
    .filter(t => new Date(t.endDate) < now)
    .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
    .slice(0, 8);

  if (pastTrips.length === 0) return null;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  const getDays = (start: string, end: string) =>
    Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));

  return (
    <section className="mb-6" data-testid="past-experiences-section">
      <div className="text-sm font-medium text-foreground mb-3 flex items-center justify-between">
        <span>Past experiences</span>
        <Link href="/my-trips">
          <span className="text-[12px] text-[#2E8B8B] cursor-pointer hover:underline" data-testid="link-view-all-past">
            View all
          </span>
        </Link>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide" data-testid="past-experiences-scroll">
        {pastTrips.map((trip) => {
          const days = getDays(trip.startDate, trip.endDate);

          return (
            <Link key={trip.id} href={`/itinerary/${trip.id}`}>
              <div
                className="flex-shrink-0 w-[160px] bg-muted/50 rounded-lg px-3 py-3 cursor-pointer hover:bg-muted/80 transition-colors"
                data-testid={`past-card-${trip.id}`}
              >
                <div className="text-[13px] font-medium text-foreground truncate">
                  {trip.title || trip.destination}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {formatDate(trip.endDate)} · {days} day{days !== 1 ? "s" : ""}
                </div>
                <div className="text-[11px] text-[#E8B339] mt-1">★★★★★</div>
              </div>
            </Link>
          );
        })}

        {pastTrips.length >= 8 && (
          <Link href="/my-trips">
            <div
              className="flex-shrink-0 w-[120px] bg-muted/30 rounded-lg px-3 py-3 cursor-pointer flex flex-col justify-center opacity-60 hover:opacity-80 transition-opacity"
              data-testid="past-card-more"
            >
              <div className="text-[13px] font-medium text-foreground">+ more</div>
              <div className="text-[11px] text-muted-foreground">View all</div>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
