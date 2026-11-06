/**
 * The heart on a Discover card (board #330): saves the place to the traveler's Saved places
 * (`/api/saved-items`), or removes it. Before this, the save route had no client caller, so the
 * Saved places shelf could never fill.
 *
 * Saved state is read from the ONE list the shelf reads (`GET /api/saved-items`), matched by
 * `findSavedItem` — never a per-card flag that could disagree with the shelf.
 *
 * PLAN-2 lane 1 (DeepSeek report finding #3 / A-1): a signed-out viewer in waitlist mode used to get
 * a `Saved to plan` toast and NOTHING was written. That claim is gone. A guest's press now writes the
 * item to the server-side guest plan through the ONE CAP-2 rail (`saveToGuestPlan`), and the toast is
 * the server's own answer — success only after the row exists, the refusal sentence otherwise. A heart
 * whose item cannot be named to that rail (no plan item kind, or no city) is not drawn for a guest at
 * all: no control is better than a control that claims a save it cannot make. A signed-in viewer keeps
 * the Saved places shelf exactly as before — the two saves are deliberately different things.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Heart, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { cn } from "@/lib/utils";
import { findSavedItem, type SavedItemRow } from "@/lib/saved-items";
import type { SaveItemBody, SavedContentType } from "@shared/saved-items";
import type { PlanItemKind } from "@shared/plan-item-ref";
import { browseSavesToPlan, useSignupMode } from "@/lib/signup-mode";
import { WAITLIST_COPY } from "@/lib/waitlist-copy";
import { guestSaveErrorMessage, guestSavedMessage, saveToGuestPlan } from "@/lib/waitlist-guest-plan";

/**
 * The plan-item kind a shelf save's content type is named by (`PlanItemRef.kind`). A type with no kind
 * cannot be re-read by the resolver, so it is not saveable to a plan — never coerced to a bare item.
 */
const GUEST_PLAN_KIND: Record<SavedContentType, PlanItemKind | null> = {
  gem: "gem",
  hotel: "hotel",
  activity: "activity",
  // A provider service is a `provider_services` row — the resolver's `listing` kind.
  service: "listing",
};

export function SaveToggle({
  item,
  className,
  testId,
  showLabel = false,
}: {
  item: SaveItemBody;
  className?: string;
  testId?: string;
  /** Icon-only on a card photo; with a "Save"/"Saved" label inside a detail sheet. */
  showLabel?: boolean;
}) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  // GATE-1 (ledger `2026-11-03-gate1-partner1`): in waitlist mode a signed-out viewer is never sent to sign in —
  // the press is a plan save on the guest rail (GATE-1B), never a claim without a write.
  const { mode } = useSignupMode();
  const saveToPlan = browseSavesToPlan(mode, !!user);
  const { toast } = useToast();
  const [guestSaving, setGuestSaving] = useState(false);
  const { data: saved } = useQuery<SavedItemRow[]>({
    queryKey: ["/api/saved-items"],
    enabled: !!user,
  });
  const existing = findSavedItem(saved, item.contentType, item.contentId);

  const toggle = useMutation({
    mutationFn: async () => {
      if (existing) await apiRequest("DELETE", `/api/saved-items/${existing.id}`);
      else await apiRequest("POST", "/api/saved-items", item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-items"] });
      toast({ title: existing ? "Removed from saved places" : "Saved to your places" });
    },
    onError: () => {
      toast({ title: existing ? "Couldn't remove it" : "Couldn't save it", variant: "destructive" });
    },
  });

  // A guest's save is a PLAN save: the item is named to the CAP-2 resolver, and only the server's
  // answer is reported (no optimistic "Saved" claim).
  const guestKind = GUEST_PLAN_KIND[item.contentType] ?? null;
  const guestCity = (item.city ?? "").trim();
  const guestRef =
    !user && saveToPlan && guestKind && item.contentId.trim() && guestCity
      ? { kind: guestKind, source_id: item.contentId.trim(), city: guestCity }
      : null;
  // No plan-item ref ⇒ the item cannot be placed on a plan; drawing the heart would invite a claim the
  // guest rail cannot honour. The signed-in shelf is unaffected (it accepts every SAVED_CONTENT_TYPE).
  if (!user && saveToPlan && !guestRef) return null;

  const saveForGuest = async () => {
    if (guestSaving || !guestRef) return;
    setGuestSaving(true);
    try {
      const result = await saveToGuestPlan(guestRef, guestRef.city);
      toast({ title: guestSavedMessage(result) });
    } catch (err) {
      toast({ variant: "destructive", title: guestSaveErrorMessage(err) });
    } finally {
      setGuestSaving(false);
    }
  };

  const label = existing ? `Remove ${item.contentName} from saved places` : `Save ${item.contentName}`;
  return (
    <button
      type="button"
      className={cn(
        showLabel
          ? "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
          : "rounded-full bg-white/90 p-1.5 shadow-sm transition-colors hover:bg-white disabled:opacity-60",
        className,
      )}
      aria-label={label}
      aria-pressed={!!existing}
      title={label}
      disabled={toggle.isPending || guestSaving}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!user) {
          if (saveToPlan) void saveForGuest();
          else openSignInModal();
          return;
        }
        toggle.mutate();
      }}
      data-testid={testId}
      data-saved={existing ? "true" : "false"}
    >
      {toggle.isPending || guestSaving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
      ) : (
        <Heart className={cn("h-3.5 w-3.5", existing ? "fill-rose-500 text-rose-500" : "text-gray-600")} />
      )}
      {showLabel && <span>{saveToPlan ? WAITLIST_COPY.saveToPlan : existing ? "Saved" : "Save"}</span>}
    </button>
  );
}
