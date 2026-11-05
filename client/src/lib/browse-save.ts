/**
 * GATE-1 (ledger `2026-11-03-gate1-partner1`): the ONE hook a public browse card reads for its add action.
 * In waitlist mode a signed-out viewer's add is "Save to plan" and opens no dialog (`browseSavesToPlan`). The mode is
 * the public read (`useSignupMode`, fail-closed); browse pages have no trip, so they do not read the trip capabilities.
 *
 * GATE-1B (ledger `2026-11-04-gate1b-guest-plan`, row G-2): the press WRITES the item to the server-side guest plan
 * (`saveToGuestPlan`), and "Saved to plan" is toasted only after the server confirms it. A refusal toasts the
 * approved failure (or rate-limit) sentence; nothing is said to have been saved.
 *
 * A-12 (ledger `2026-11-05-lane8-cleanup`): the add control is DISABLED while the session read or the mode read is
 * still in flight (`pending`). Before both answer, a signed-in viewer reads as signed out and an open mode reads as
 * waitlist (fail-closed), so a press then went to the guest rail — answered 409 `signed_in` / 404 `not_found`
 * (`server/routes/guest-plans.routes.ts` `guestOnly`). A press is not queued instead: when the session answers, the
 * browse shell swaps its layout (`components/browse-shell.tsx`) and remounts the page, so a held press would be lost
 * with the card that held it. Once both answer, the press takes the path they choose (`browseSavePath`). No string is
 * added; the control keeps its label and is only disabled.
 */
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { browseSavesToPlan, useSignupMode, type SignupMode } from "./signup-mode";
import { cityFromPath, guestItemFromFeedItem, guestSavedMessage, guestSaveErrorMessage, resolveSaveCity, saveToGuestPlan } from "./waitlist-guest-plan";

export type BrowseSavePath = "wait" | "guest_save" | "card_add";

/** A-12, pure: which path a press takes. Either read still in flight ⇒ "wait" (the control is disabled). */
export function browseSavePath(s: { modeLoading: boolean; authLoading: boolean; mode: SignupMode; signedIn: boolean }): BrowseSavePath {
  if (s.modeLoading || s.authLoading) return "wait";
  return browseSavesToPlan(s.mode, s.signedIn) ? "guest_save" : "card_add";
}

export function useBrowseSaveToPlan(): {
  saveToPlan: boolean;
  /** A-12: either read is still in flight — the card draws its add control disabled. */
  pending: boolean;
  /**
   * Wraps a card's `onAdd`: in save-to-plan mode the press saves the item to the guest plan (the card's own `onAdd`
   * is not called, and need not exist) and toasts on the server's answer.
   */
  wrapAdd: <T>(onAdd: ((item: T) => void) | undefined) => ((item: T) => void) | undefined;
} {
  const { mode, isLoading: modeLoading } = useSignupMode();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [pathname] = useLocation();
  // The label reads the same fail-closed answer it always has; only the press waits for both reads.
  const saveToPlan = browseSavesToPlan(mode, !authLoading && !!user);
  const path = browseSavePath({ modeLoading, authLoading, mode, signedIn: !!user });

  const guestSave = (item: unknown) => {
    // A-1: the card names its source row, or nothing is sent (no "Saved" on nothing).
    const body = guestItemFromFeedItem(item as any);
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

  return {
    saveToPlan,
    pending: path === "wait",
    wrapAdd: (onAdd) => {
      if (path === "card_add") return onAdd;
      if (path === "guest_save") return (item) => guestSave(item);
      // "wait": the control is disabled; a press that still arrives decides nothing and sends nothing.
      if (!saveToPlan && !onAdd) return undefined;
      return () => {};
    },
  };
}
