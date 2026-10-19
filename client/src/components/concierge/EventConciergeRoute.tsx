import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useTravelerDoors } from "@/hooks/use-traveler-doors";

/**
 * `/concierge` (every `?tier=` variant) and the `/optimize` redirect into it render only while `event_concierge` is
 * on (ledger `2026-10-18-traveler-doors-hidden`); otherwise the visit lands on the home page. Nothing renders while
 * the switch is being read.
 */
export function EventConciergeRoute({ children }: { children: ReactNode }) {
  const { eventConcierge, settled } = useTravelerDoors();
  if (!settled) return null;
  if (!eventConcierge) return <Redirect to="/" />;
  return <>{children}</>;
}
