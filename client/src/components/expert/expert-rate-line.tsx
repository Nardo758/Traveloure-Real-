/**
 * FE-2 (ledger `2026-10-16-fe2-beta-cohort`): "Your rate: 15%, beta cohort, locked Oct 16, 2026".
 *
 * Reads the session expert's own rate from `GET /api/expert/rate`, which answers through the
 * commission resolver; the words come from the ONE formatter in `@shared/expert-rate-cohort`.
 * Renders nothing while loading, on an error, or when the server has no usable rate (§13).
 */
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { expertRateLine, type ExpertRateView } from "@shared/expert-rate-cohort";

export const EXPERT_RATE_ENDPOINT = "/api/expert/rate";

export function ExpertRateLine({ style }: { style?: CSSProperties }) {
  const { data } = useQuery<ExpertRateView>({ queryKey: [EXPERT_RATE_ENDPOINT], staleTime: 60_000 });
  const line = expertRateLine(data);
  if (!line) return null;
  return (
    <div data-testid="text-expert-rate" style={{ fontSize: 13, color: "#57534E", ...style }}>
      {line}
    </div>
  );
}
