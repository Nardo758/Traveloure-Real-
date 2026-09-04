/**
 * HIRE AN EXPERT FROM AN EVENT — the slip's CHOOSE rail.
 * Ledger `2026-09-04-hire-from-slip`; clause (c) of `2026-09-04-slip-precondition`; CLAUDE.md
 * Locked Decisions 29 (an event IS a `user_experiences` row), 31 (`roles_needed`) and 12
 * (a PENDING advisor may not write).
 *
 * WHAT WAS MISSING. The slip could hire only by AUTO-ROUTE (`EscalationCTA` ->
 * `POST /api/expert-requests` -> `lead-routing.service.ts`): the traveler could ask for AN expert
 * and never for THIS one. This is the choosing step, and it hangs off the EVENT header because
 * that is where the traveler is standing when they decide they need a florist.
 *
 * WHAT IT MAY SAY (§13), which is most of the work here:
 *   · the roles come from the event's occasion (`experience_types.roles_needed`) and nowhere
 *     else. Every way that can be absent has its own sentence — see `@/lib/hire-from-slip`, which
 *     owns that derivation so this file cannot grow a second copy of it (§18 rule 1).
 *   · the roles are CHIPS, not a filter. `GET /api/experts` — the existing expert read this
 *     reuses rather than replaces — accepts `location`, `role`, `neighbourhood` and
 *     `experienceType`, and has NO `service_categories.category_key` filter. So the dialog says
 *     out loud that the list is not narrowed by the roles above rather than quietly shrinking it
 *     client-side, which would be a filter claim the server never made.
 *   · the outcome is an INVITATION. The row is born `pending` and the expert must accept before
 *     they can touch the plan, so the confirmation says "request sent — awaiting <name>" and
 *     never promises a reply time we do not have.
 *   · an expert is hired for the PLAN. `trip_expert_advisors` is keyed (trip, expert) and carries
 *     no event column — this lane deliberately did not add one — so the dialog says the expert
 *     joins the whole plan and the event is only named in the note they receive. Nothing on any
 *     surface claims an expert is assigned to an event.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildExpertPickerFilter,
  roleLabel,
  type HireOccasion,
  type HireRoleCategory,
} from "@/lib/hire-from-slip";
import type { PlanEvent } from "@/lib/slip-events";

/** The subset of `GET /api/experts` this picker reads. Every other key is ignored. */
interface DirectoryExpert {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  headline?: string | null;
  city?: string | null;
  country?: string | null;
  profileImageUrl?: string | null;
  /** Real aggregate or null — null renders "New", never a fabricated score. */
  averageRating?: number | null;
  reviewCount?: number | null;
}

function expertName(e: DirectoryExpert): string {
  const full = [e.firstName, e.lastName].filter(Boolean).join(" ").trim();
  return e.displayName?.trim() || full || "This expert";
}

function initials(e: DirectoryExpert): string {
  const name = expertName(e);
  return name.slice(0, 2).toUpperCase();
}

export function HireExpertDialog({
  tripId,
  destination,
  event,
  open,
  onOpenChange,
}: {
  tripId: string;
  destination: string | null | undefined;
  /** The event the traveler pressed on. `null` = the plan's implicit unnamed event. */
  event: PlanEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);

  // The occasion catalog and the category names. Both are ordinary public reads that already
  // exist; neither is fetched until the dialog is actually opened.
  const { data: occasions, isLoading: occasionsLoading } = useQuery<HireOccasion[]>({
    queryKey: ["/api/experience-types"],
    enabled: open,
    staleTime: 10 * 60_000,
  });
  const { data: categories } = useQuery<HireRoleCategory[]>({
    queryKey: ["/api/service-categories"],
    enabled: open,
    staleTime: 10 * 60_000,
  });

  // THE one derivation — what to ask the server for, and what may be said about the roles.
  // While the occasion catalog is still loading we pass `undefined` rather than `[]`, because an
  // empty list and a list that has not arrived are different facts and the module answers them
  // with different sentences.
  const filter = buildExpertPickerFilter(destination, event, occasionsLoading ? undefined : occasions);

  const { data: experts, isLoading: expertsLoading } = useQuery<DirectoryExpert[]>({
    // The EXISTING public expert read, with the one filter it actually supports.
    queryKey: ["/api/experts", filter.params],
    enabled: open,
  });

  const hire = useMutation({
    mutationFn: async (localExpertId: string) => {
      const res = await apiRequest("POST", `/api/trips/${tripId}/advisors`, {
        localExpertId,
        message: note.trim() || null,
        // Named so the expert's note can say which event prompted this. The server verifies it
        // belongs to this plan and refuses otherwise; it is not stored as a link.
        userExperienceId: event?.id ?? null,
      });
      return (await res.json()) as { expertUserId: string; eventTitle: string | null };
    },
    onSuccess: (_data, localExpertId) => {
      const name = expertName(
        (experts ?? []).find((e) => e.id === localExpertId) ?? { id: localExpertId },
      );
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/expert-advisor`] });
      toast({
        title: "Request sent",
        // No ETA: nothing on the platform knows when this expert will answer (§13).
        description: `${name} has been asked to join this plan. They'll need to accept before they can add anything.`,
      });
      onOpenChange(false);
      setNote("");
      setChosen(null);
    },
    onError: (err: any) => {
      toast({
        title: "Could not send the request",
        description: String(err?.message || "Please try again."),
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-hire-expert">
        <DialogHeader>
          <DialogTitle>
            {event?.title ? `Hire an expert for "${event.title}"` : "Hire an expert"}
          </DialogTitle>
          <DialogDescription>
            {/* The honest scope of what pressing this does: an expert joins the PLAN. */}
            An expert you choose joins this whole plan — there's no per-event assignment. The event
            you picked is named in the note they receive.
          </DialogDescription>
        </DialogHeader>

        {/* ── The occasion's roles: chips, with the reason when there are none ───────────── */}
        <div className="space-y-1.5" data-testid="hire-expert-roles">
          {filter.roles ? (
            <>
              <p className="text-xs text-muted-foreground">{filter.rolesNote}</p>
              <div className="flex flex-wrap gap-1.5">
                {filter.roles.map((key) => (
                  <Badge key={key} variant="secondary" data-testid={`hire-expert-role-${key}`}>
                    {roleLabel(key, categories)}
                  </Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{filter.roleFilterNote}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="hire-expert-no-roles">
              {filter.rolesNote}
            </p>
          )}
          {filter.destinationNote && (
            <p className="text-[11px] text-muted-foreground" data-testid="hire-expert-no-destination">
              {filter.destinationNote}
            </p>
          )}
        </div>

        {/* ── The directory ─────────────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          {expertsLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : (experts ?? []).length === 0 ? (
            // An empty directory is stated as what it is — no supply here yet — never dressed up.
            <p className="text-sm text-muted-foreground" data-testid="hire-expert-empty">
              No experts are listed{destination ? ` for ${destination}` : ""} yet.
            </p>
          ) : (
            (experts ?? []).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setChosen(e.id)}
                className={`w-full text-left flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                  chosen === e.id ? "border-primary bg-muted/40" : "border-border hover:bg-muted/20"
                }`}
                data-testid={`hire-expert-option-${e.id}`}
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={e.profileImageUrl || undefined} alt="" />
                  <AvatarFallback>{initials(e)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{expertName(e)}</span>
                  {e.headline && (
                    <span className="block text-xs text-muted-foreground truncate">{e.headline}</span>
                  )}
                </span>
                {/* A real aggregate or the word New — never a fabricated score. */}
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {e.averageRating != null ? `${e.averageRating} ★` : "New"}
                </span>
              </button>
            ))
          )}
        </div>

        <Textarea
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          placeholder="Anything they should know? (optional)"
          rows={3}
          data-testid="input-hire-expert-note"
        />

        <Button
          type="button"
          disabled={!chosen || hire.isPending}
          onClick={() => chosen && hire.mutate(chosen)}
          data-testid="button-hire-expert-submit"
        >
          {hire.isPending ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4 mr-1.5" />
          )}
          Send request
        </Button>
      </DialogContent>
    </Dialog>
  );
}
