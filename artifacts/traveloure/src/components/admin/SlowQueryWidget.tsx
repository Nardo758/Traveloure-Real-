import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function SlowQueryWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["slow-queries"],
    queryFn: async () => {
      const res = await fetch(
        "/api/admin/slow-queries",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 60_000
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/admin/slow-queries", {
        method: "DELETE",
        credentials: "include"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["slow-queries"]
      });
    }
  });

  const count = data?.count || 0;
  const queries = data?.queries?.slice(0, 5) || [];
  const threshold = data?.threshold || 500;

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">
            Slow queries
          </span>
          {count > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              {count} over {threshold}ms
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
              All clear
            </span>
          )}
        </div>
        <span className="text-gray-400 text-sm">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 p-4">
          {isLoading && (
            <p className="text-xs text-gray-400">
              Loading...
            </p>
          )}

          {!isLoading && count === 0 && (
            <p className="text-xs text-gray-400">
              No slow queries logged since last clear.
            </p>
          )}

          {queries.map((q: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-xs font-medium text-gray-800">{q.label}</p>
                <p className="text-xs text-gray-400">
                  {new Date(q.timestamp).toLocaleTimeString()} · role: {q.userRole}
                </p>
              </div>
              <span className={`text-xs font-semibold ${q.duration > 1000 ? "text-red-500" : "text-amber-500"}`}>
                {q.duration}ms
              </span>
            </div>
          ))}

          {count > 0 && (
            <button
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="mt-3 text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              {clearMutation.isPending ? "Clearing..." : "Clear log"}
            </button>
          )}

          <p className="text-xs text-gray-300 mt-2">
            Auto-refreshes every 60s · Shows last 5 of {count}
          </p>
        </div>
      )}
    </div>
  );
}
