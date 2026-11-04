/**
 * GATE-1 (ledger `2026-11-03-gate1-partner1`): the ONE hook a public browse card reads for its add action.
 * In waitlist mode a signed-out viewer's add is "Save to plan" and opens no dialog (`browseSavesToPlan`). The mode is
 * the public read (`useSignupMode`, fail-closed); browse pages have no trip, so they do not read the trip capabilities.
 *
 * GATE-1B (ledger `2026-11-04-gate1b-guest-plan`, row G-2): the press WRITES the item to the server-side guest plan
 * (`saveToGuestPlan`), and "Saved to plan" is toasted only after the server confirms it. A refusal toasts the
 * approved failure (or rate-limit) sentence; nothing is said to have been saved.
 */
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { browseSavesToPlan, useSignupMode } from "./signup-mode";
import { cityFromPath, guestItemFromFeedItem, guestSavedMessage, guestSaveErrorMessage, resolveSaveCity, saveToGuestPlan } from "./waitlist-guest-plan";

export function useBrowseSaveToPlan(): {
  saveToPlan: boolean;
  /**
   * Wraps a card's `onAdd`: in save-to-plan mode the press saves the item to the guest plan (the card's own `onAdd`
   * is not called, and need not exist) and toasts on the server's answer.
   */
  wrapAdd: <T>(onAdd: ((item: T) => void) | undefined) => ((item: T) => void) | undefined;
} {
  const { mode } = useSignupMode();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [pathname] = useLocation();
  // While the session read is in flight the viewer is not yet known to be signed in; the mode alone decides.
  const saveToPlan = browseSavesToPlan(mode, !isLoading && !!user);
  return {
    saveToPlan,
    wrapAdd: (onAdd) => {
      if (!saveToPlan) return onAdd;
      return (item) => {
        // A-1: the card names its source row, or nothing is sent (no "Saved" on nothing).
        const body = guestItemFromFeedItem(item);
        // A-2: the city a first save starts the plan in — the route's, then the page's (the card's own `city`, which it
        // puts on the payload), then the item's own. None ⇒ nothing is sent.
        const city = resolveSaveCity(cityFromPath(pathname), (item as any)?.city ?? null, (item as any)?.itemCity ?? null);
        if (!body || !city) {
          toast({ variant: "destructive", title: guestSaveErrorMessage(null) });
          return;
        }
        saveToGuestPlan(body, city).then(
          (result) => toast({ title: guestSavedMessage(result) }),
          (err) => toast({ variant: "destructive", title: guestSaveErrorMessage(err) }),
        );
      };
    },
  };
}
