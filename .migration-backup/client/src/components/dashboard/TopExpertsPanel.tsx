import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface Expert {
  id: string;
  firstName: string;
  lastName: string;
  avgRating: string;
  reviewCount: number;
  profileImageUrl?: string;
  specializations?: string[];
  city?: string;
}

interface TopExpertsPanelProps {
  destinations: string[];
}

export function TopExpertsPanel({ destinations }: TopExpertsPanelProps) {
  const { data: experts } = useQuery<Expert[]>({
    queryKey: ["/api/experts", { destinations }],
  });

  const topExperts = (experts ?? []).slice(0, 4);
  if (topExperts.length === 0) return null;

  return (
    <div
      className="bg-card border border-border rounded-xl p-3"
      data-testid="top-experts-panel"
    >
      <div className="text-[11px] font-medium text-foreground mb-2.5 flex justify-between">
        <span>Top experts</span>
        <Link href="/experts">
          <span className="text-[9px] text-[#2E8B8B] cursor-pointer hover:underline">
            View all
          </span>
        </Link>
      </div>
      {topExperts.map((expert, i) => {
        const initials = `${expert.firstName?.[0] || ""}${expert.lastName?.[0] || ""}`.toUpperCase();
        const rating = parseFloat(expert.avgRating || "0");
        return (
          <Link key={expert.id} href={`/experts/${expert.id}`}>
            <div
              className="flex items-center gap-2 py-[7px] cursor-pointer hover:bg-muted/30 rounded -mx-1 px-1 transition-colors"
              style={{
                borderTop: i > 0 ? "0.5px solid var(--border)" : "none",
              }}
              data-testid={`top-expert-${expert.id}`}
            >
              <div
                className="w-8 h-8 rounded-full text-[10px] font-semibold flex items-center justify-center flex-shrink-0"
                style={{ background: "#E8B339", color: "#412402" }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-foreground">
                  {expert.firstName} {expert.lastName}
                </div>
                <div className="text-[9px] text-muted-foreground truncate">
                  {expert.city ||
                    expert.specializations?.[0] ||
                    "Travel expert"}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] text-[#E8B339]">
                  ★ {rating > 0 ? rating.toFixed(1) : "New"}
                </div>
                {expert.reviewCount > 0 && (
                  <div className="text-[8px] text-muted-foreground">
                    ({expert.reviewCount})
                  </div>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
