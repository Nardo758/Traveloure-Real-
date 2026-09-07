import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

/**
 * L2 home-honesty (CONSOLE_AND_AI_CONCIERGE_BRIEF.md, ledger `2026-09-07-home-honesty`).
 *
 * This panel used to render the traveler's AI CHAT THREADS under the heading "Active experts" —
 * conversation titles repainted as people. It now lists REAL advisors: the session traveler's own
 * `trip_expert_advisors` linkage via GET /api/trips/mine/advisors (server/routes/booking-actions.ts),
 * pending | accepted only, expert name joined server-side. §13: with no advisors it renders NOTHING
 * — an empty panel that says "no experts" is not information the traveler needs on Home.
 */
interface TripAdvisor {
  trip_id: string;
  expert_id: string;
  status: string;
  expert_first_name: string | null;
  expert_last_name: string | null;
  expert_profile_image_url: string | null;
}

interface ActiveExpertsPanelProps {
  /** The dashboard's active plans — used only to label each advisor's row with its plan. */
  trips: Array<{ id: string; destination?: string | null }>;
}

export function ActiveExpertsPanel({ trips }: ActiveExpertsPanelProps) {
  const { data: advisors } = useQuery<TripAdvisor[]>({
    queryKey: ["/api/trips/mine/advisors"],
    staleTime: 60_000,
  });

  const rows = (advisors ?? []).slice(0, 3);
  if (rows.length === 0) return null;

  return (
    <div
      className="bg-card border border-border rounded-xl p-3"
      data-testid="active-experts-panel"
    >
      <div className="text-[11px] font-medium text-foreground mb-2">
        Active experts
      </div>
      {rows.map((advisor, i) => {
        const name =
          `${advisor.expert_first_name ?? ""} ${advisor.expert_last_name ?? ""}`.trim() ||
          "Local expert";
        const initials = name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
        const destination = trips.find((t) => String(t.id) === String(advisor.trip_id))
          ?.destination?.split(",")[0];
        return (
          <div
            key={`${advisor.trip_id}-${advisor.expert_id}`}
            className="py-1.5"
            style={{
              borderTop: i > 0 ? "0.5px solid var(--border)" : "none",
            }}
            data-testid={`active-expert-${advisor.expert_id}`}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full text-[9px] font-semibold flex items-center justify-center flex-shrink-0"
                style={{ background: "#E8B339", color: "#412402" }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium text-foreground truncate">
                  {name}
                </div>
                <div className="text-[9px] text-muted-foreground truncate">
                  {advisor.status === "pending" ? "Requested" : "Advisor"}
                  {destination ? ` · ${destination}` : ""}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <Link href="/experts">
        <button
          className="w-full mt-2 py-1.5 rounded-md text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-view-all-experts"
        >
          Find more experts
        </button>
      </Link>
    </div>
  );
}
