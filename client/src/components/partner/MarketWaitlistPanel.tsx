/**
 * Signed-in approved experts and providers join or leave a waitlist for each operating market.
 * Leon, Nov 11, 2026. "Join the {city} list" is the existing approved label. "Leave the {city} list."
 * is Wording approved — Leon (Nov 11, 2026, 12:02 PM ET).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { apiRequest, queryClient } from "@/lib/queryClient";

const QUERY_KEY = ["/api/me/waitlist-markets"] as const;

export function MarketWaitlistPanel() {
  const list = useQuery<{ role: "expert" | "provider"; markets: string[] }>({
    queryKey: QUERY_KEY,
    retry: false,
  });
  const joined = new Set(list.data?.markets ?? []);
  const change = useMutation({
    mutationFn: async (input: { market: string; join: boolean }) => {
      if (input.join) {
        await apiRequest("POST", "/api/me/waitlist-markets", { market: input.market });
      } else {
        await apiRequest("DELETE", `/api/me/waitlist-markets/${encodeURIComponent(input.market)}`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
  if (list.isError || list.isLoading || !list.data) return null;
  return (
    <section className="rounded-lg border p-4" data-testid="panel-market-waitlist">
      <ul className="flex flex-wrap gap-2">
        {OPERATING_MARKETS.map((m) => {
          const on = joined.has(m.marketKey);
          const label = on ? `Leave the ${m.cityName} list.` : `Join the ${m.cityName} list`;
          return (
            <li key={m.marketKey}>
              <button
                type="button"
                className="rounded-full border px-3 py-1.5 text-sm"
                disabled={change.isPending}
                data-testid={`button-market-waitlist-${m.marketKey}`}
                aria-pressed={on}
                onClick={() => change.mutate({ market: m.marketKey, join: !on })}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
