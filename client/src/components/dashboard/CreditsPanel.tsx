import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

export function CreditsPanel() {
  const { data: creditsData } = useQuery<{
    balance: number;
    total: number;
  }>({
    queryKey: ["/api/credits/balance"],
    retry: false,
  });

  const balance = creditsData?.balance ?? 150;
  const total = creditsData?.total ?? 250;
  const pct = total > 0 ? Math.round((balance / total) * 100) : 0;

  return (
    <div
      className="bg-card border border-border rounded-xl p-3"
      data-testid="credits-panel"
    >
      <div className="text-[11px] font-medium text-foreground mb-1">
        Credits
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-medium text-foreground">{balance}</span>
        <span className="text-[10px] text-muted-foreground">remaining</span>
      </div>
      <div className="h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "#2E8B8B" }}
        />
      </div>
      <Link href="/credits">
        <button
          className="w-full mt-2.5 py-1.5 rounded-md text-[10px] font-medium text-white transition-colors"
          style={{
            background: "#E85D55",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "#D85A30")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "#E85D55")
          }
          data-testid="button-buy-credits"
        >
          Buy credits
        </button>
      </Link>
    </div>
  );
}
