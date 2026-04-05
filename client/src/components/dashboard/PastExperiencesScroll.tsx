import { useTrips } from "@/hooks/use-trips";
import { Link } from "wouter";

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
    <section className="mb-[22px]" data-testid="past-experiences-section">
      <div className="text-[13px] font-medium mb-2.5 flex items-center justify-between" style={{ color: "#1A1A18" }}>
        <span>Past experiences</span>
        <Link href="/my-trips">
          <span className="text-[11px] cursor-pointer hover:underline" style={{ color: "#2E8B8B" }} data-testid="link-view-all-past">
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
                className="flex-shrink-0 w-[160px] rounded-[10px] px-3 py-3 cursor-pointer transition-colors hover:opacity-80"
                style={{ background: "#F3F3EE", border: "0.5px solid #E8E8E2" }}
                data-testid={`past-card-${trip.id}`}
              >
                <div className="text-[13px] font-medium truncate" style={{ color: "#1A1A18" }}>
                  {trip.title || trip.destination}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "#7A7A72" }}>
                  {formatDate(trip.endDate)} · {days} day{days !== 1 ? "s" : ""}
                </div>
                <div className="text-[11px] mt-1" style={{ color: "#E8B339" }}>★★★★★</div>
              </div>
            </Link>
          );
        })}

        {pastTrips.length >= 8 && (
          <Link href="/my-trips">
            <div
              className="flex-shrink-0 w-[120px] rounded-[10px] px-3 py-3 cursor-pointer flex flex-col justify-center opacity-60 hover:opacity-80 transition-opacity"
              style={{ background: "#F3F3EE" }}
              data-testid="past-card-more"
            >
              <div className="text-[13px] font-medium" style={{ color: "#1A1A18" }}>+ more</div>
              <div className="text-[11px]" style={{ color: "#7A7A72" }}>View all</div>
            </div>
          </Link>
        )}
      </div>
    </section>
  );
}
