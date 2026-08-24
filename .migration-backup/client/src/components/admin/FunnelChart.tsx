import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface FunnelStage {
  stage: string;
  count: number;
  label: string;
  dropoff: number;
  conversionRate: number;
}

const STAGE_LABELS: Record<string, string> = {
  T1_ACCOUNT_CREATED:      "T1 — Accounts created",
  T2_TRIP_CREATED:         "T2 — Trips created",
  T3_ITINERARY_GENERATED:  "T3 — Itineraries generated",
  T4_CART_POPULATED:       "T4 — Cart populated",
  T5_EXPERT_REQUESTED:     "T5 — Expert requested",
  T6_REVENUE:              "T6 — Revenue",
  T7_VIRAL_SHARE:          "T7 — Viral share"
};

const WINDOW_OPTIONS = [7, 30, 90] as const;
type WindowDays = typeof WINDOW_OPTIONS[number];

export function FunnelChart() {
  const [days, setDays] = useState<WindowDays>(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ["funnel-stats", days],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/funnel-stats?days=${days}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return (
    <div className="p-4 text-sm text-gray-400">Loading funnel data...</div>
  );

  if (error) return (
    <div className="p-4 text-sm text-red-400">Failed to load funnel stats</div>
  );

  const stages = data?.stages || [];
  const topCount = stages[0]?.count || 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          Funnel drop-off — last {days} days
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => setDays(w)}
                className={`px-3 py-1 transition-colors ${
                  days === w
                    ? "bg-gray-900 text-white font-semibold"
                    : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">Auto-refreshes every 60s</span>
        </div>
      </div>

      <div className="space-y-3">
        {stages.map((s: any, i: number) => {
          const pct = Math.round((s.count / topCount) * 100);
          const prev = stages[i - 1]?.count || s.count;
          const dropoff = prev - s.count;
          const convRate = Math.round((s.count / prev) * 100);
          const barColor = pct > 60
            ? "bg-emerald-500"
            : pct > 30
            ? "bg-amber-400"
            : "bg-red-400";

          return (
            <div key={s.stage}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700 w-56">
                  {STAGE_LABELS[s.stage] || s.stage}
                </span>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {i > 0 && (
                    <span className="text-red-400">−{dropoff} dropped</span>
                  )}
                  <span className="font-semibold text-gray-800 w-8 text-right">
                    {s.count}
                  </span>
                  {i > 0 && (
                    <span className="text-gray-400 w-12 text-right">
                      {convRate}% kept
                    </span>
                  )}
                </div>
              </div>
              <div className="h-6 bg-gray-100 rounded-md overflow-hidden">
                <div
                  className={`h-full rounded-md transition-all duration-500 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
          Good (&gt;60%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
          Watch (30-60%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-400 inline-block" />
          Critical (&lt;30%)
        </span>
      </div>
    </div>
  );
}
