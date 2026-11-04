/**
 * GATE-1 (ledger `2026-11-03-gate1-partner1`): the ONE hook a public browse card reads for its add action.
 * In waitlist mode a signed-out viewer's add is "Save to plan": the press toasts "Saved to plan" and opens no
 * dialog (`browseSavesToPlan`). The mode is the public read (`useSignupMode`, fail-closed); browse pages have no
 * trip, so they do not read the trip capabilities (CAP-1).
 */
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { browseSavesToPlan, useSignupMode } from "./signup-mode";
import { WAITLIST_COPY } from "./waitlist-copy";

export function useBrowseSaveToPlan(): {
  saveToPlan: boolean;
  /** Wraps a card's `onAdd`: in save-to-plan mode the press toasts instead of calling it. */
  wrapAdd: <T>(onAdd: ((item: T) => void) | undefined) => ((item: T) => void) | undefined;
} {
  const { mode } = useSignupMode();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  // While the session read is in flight the viewer is not yet known to be signed in; the mode alone decides.
  const saveToPlan = browseSavesToPlan(mode, !isLoading && !!user);
  return {
    saveToPlan,
    wrapAdd: (onAdd) => {
      if (!saveToPlan) return onAdd;
      return () => toast({ title: WAITLIST_COPY.savedToPlan });
    },
  };
}
