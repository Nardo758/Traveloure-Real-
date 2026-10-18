import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useLegacyConciergeShown } from "@/hooks/use-legacy-concierge";

/**
 * `/concierge` renders only while the old done-for-you concierge is switched on (ledger
 * `2026-10-18-legacy-concierge-hidden`); otherwise the visit lands on the home page. Nothing renders while the
 * switch is being read.
 */
export function LegacyConciergeRoute({ children }: { children: ReactNode }) {
  const { shown, settled } = useLegacyConciergeShown();
  if (!settled) return null;
  if (!shown) return <Redirect to="/" />;
  return <>{children}</>;
}
