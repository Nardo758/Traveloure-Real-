/**
 * The heart on a Discover card (board #330): saves the place to the traveler's Saved places
 * (`/api/saved-items`), or removes it. Before this, the save route had no client caller, so the
 * Saved places shelf could never fill.
 *
 * Saved state is read from the ONE list the shelf reads (`GET /api/saved-items`), matched by
 * `findSavedItem` — never a per-card flag that could disagree with the shelf. A signed-out viewer
 * is offered sign-in; nothing is saved on their behalf.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { Heart, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { cn } from "@/lib/utils";
import { findSavedItem, type SavedItemRow } from "@/lib/saved-items";
import type { SaveItemBody } from "@shared/saved-items";

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
  const { toast } = useToast();
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
      disabled={toggle.isPending}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!user) {
          openSignInModal();
          return;
        }
        toggle.mutate();
      }}
      data-testid={testId}
      data-saved={existing ? "true" : "false"}
    >
      {toggle.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
      ) : (
        <Heart className={cn("h-3.5 w-3.5", existing ? "fill-rose-500 text-rose-500" : "text-gray-600")} />
      )}
      {showLabel && <span>{existing ? "Saved" : "Save"}</span>}
    </button>
  );
}
