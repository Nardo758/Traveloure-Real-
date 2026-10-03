/**
 * THE EXPERT DOOR ON THE SLIP (ledger `2026-09-29-expert-door`; decision-maker dispatch Sep 29, 2026).
 *
 * "Get a local expert" mints the plan like every finish and lands here (`?help=expert`). One card sits
 * above the list — "How much help do you want?" — with three choices (a band each, from the server)
 * and a text link, "I just have a question". Dismissed, it shrinks to a small "Add a local expert"
 * control in the header until an expert is attached. Choosing a level opens the picker: the experts
 * who pass the byline gate in the plan's market and list that level. "Request" is the EXISTING
 * storefront rail with this plan attached — the advisor row comes from its one author (LD 32);
 * nothing here attaches anyone.
 *
 * §13 on this surface: with nobody offering a level the picker says so, naming the city, and offers
 * the free draft — never a padded list and never a "0". Every number is the server's.
 * Owner/delegate only (a render rule; the rails refuse on their own).
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { noExpertLine, type HelpLevel } from "@shared/expert-door";
import {
  ADD_EXPERT_LABEL,
  emptyActionLabel,
  EXPERT_DOOR_QUERY,
  EXPERT_DOOR_VALUE,
  HELP_CARD_TITLE,
  HELP_LEVEL_CHOICES,
  QUESTION_LINK,
  levelBandLine,
  offeringPriceLabel,
  offeringRequestable,
  readDoorCardState,
  writeDoorCardState,
  type DoorCardState,
} from "@/lib/expert-door";
import { runFreeDraft, type FreeDraftTrip } from "@/lib/slip-free-draft";

interface OverviewLevel {
  level: HelpLevel;
  expertCount: number;
  bandLabel: string | null;
}
interface Overview {
  market: { key: string | null; cityName: string | null };
  levels: OverviewLevel[];
}
interface PickerExpert {
  handle: string;
  displayName: string;
  profileImageUrl: string | null;
  neighborhoods: string[];
  replyTime: string | null;
  offerings: Array<{ serviceId: string; title: string; price: string | null; priceType: string | null; showPrice: boolean | null }>;
}

/** One client rail for the door's funnel rows; a failed write never breaks the page. */
function reportDoorEvent(tripId: string, type: "expert_help_level_chosen" | "expert_picker_shown" | "expert_interest", level: HelpLevel) {
  void fetch(`/api/trips/${tripId}/slip-events`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, level }),
  }).catch(() => undefined);
}

/** The card's per-viewer state, opened by the finish's `?help=expert` and remembered per plan. */
export function useExpertDoorState(tripId: string): [DoorCardState | null, (s: DoorCardState) => void] {
  const [state, setState] = useState<DoorCardState | null>(() => readDoorCardState(tripId));
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get(EXPERT_DOOR_QUERY) === EXPERT_DOOR_VALUE) {
        writeDoorCardState(tripId, "open");
        setState("open");
        url.searchParams.delete(EXPERT_DOOR_QUERY);
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    } catch {
      /* no URL, no door */
    }
  }, [tripId]);
  const set = (s: DoorCardState) => {
    writeDoorCardState(tripId, s);
    setState(s);
  };
  return [state, set];
}

/** The header's small control, shown after the card is dismissed and until an expert is attached. */
export function AddLocalExpertButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="min-h-[32px] rounded-full border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
      onClick={onOpen}
      data-testid="slip-add-local-expert"
    >
      {ADD_EXPERT_LABEL}
    </button>
  );
}

function ExpertPicker({
  trip,
  level,
  cityName,
  itemCount,
  onClose,
}: {
  trip: FreeDraftTrip;
  level: HelpLevel;
  cityName: string | null;
  itemCount: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const tripId = trip.id;
  const picker = useQuery<{ market: { cityName: string | null }; experts: PickerExpert[] }>({
    queryKey: [`/api/trips/${tripId}/expert-help/picker?level=${level}`],
  });
  const shown = useRef(false);
  useEffect(() => {
    if (picker.data && !shown.current) {
      shown.current = true;
      reportDoorEvent(tripId, "expert_picker_shown", level);
    }
  }, [picker.data, tripId, level]);
  const request = useMutation({
    mutationFn: async (v: { serviceId: string; handle: string }) =>
      (await apiRequest("POST", "/api/expert-booking-requests", { tripId, serviceId: v.serviceId, notes: "" })).json(),
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/expert-advisor`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      toast({ title: `Request sent to @${v.handle}`, description: "They'll see this plan and reply in your inbox." });
      onClose();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't send the request", description: e?.message }),
  });
  const interest = useMutation({
    mutationFn: async () => {
      reportDoorEvent(tripId, "expert_interest", level);
      if (itemCount === 0) {
        // Smoke 4 item 5: the free draft always drafts; where to stay is recommended after it.
        await runFreeDraft(trip);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onClose();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't draft this plan", description: e?.message }),
  });
  const experts = picker.data?.experts ?? [];
  const city = picker.data?.market.cityName ?? cityName;
  return (
    <div className="space-y-3" data-testid={`expert-picker-${level}`}>
      {picker.isLoading ? <p className="text-sm text-muted-foreground">Finding local experts…</p> : null}
      {picker.data && experts.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-border p-4" data-testid="expert-picker-empty">
          <p className="text-sm font-medium text-foreground">{noExpertLine(city)}</p>
          <Button className="min-h-[44px] w-full whitespace-normal" onClick={() => interest.mutate()} disabled={interest.isPending} data-testid="expert-picker-interest">
            {emptyActionLabel(city)}
          </Button>
        </div>
      ) : null}
      <ul className="space-y-3" data-testid="expert-picker-list">
        {experts.map((x) => (
          <li key={x.handle} className="space-y-2 rounded-lg border border-border p-3" data-testid={`expert-picker-card-${x.handle}`}>
            <div className="flex items-start gap-3">
              {x.profileImageUrl ? (
                <img src={x.profileImageUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold" aria-hidden="true">
                  {x.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-foreground break-words">{x.displayName}</p>
                <a href={`/s/${x.handle}`} className="text-xs text-muted-foreground underline">@{x.handle}</a>
                {x.neighborhoods.length ? <p className="text-xs text-muted-foreground break-words">{x.neighborhoods.join(" · ")}</p> : null}
                {x.replyTime ? <p className="text-xs text-muted-foreground" data-testid={`expert-picker-reply-${x.handle}`}>{x.replyTime}</p> : null}
              </div>
            </div>
            {x.offerings.map((o) => (
              <div key={o.serviceId} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                <div className="min-w-0">
                  <p className="text-sm text-foreground break-words">{o.title}</p>
                  <p className="text-xs text-muted-foreground">{offeringPriceLabel(o.price, o.showPrice)}</p>
                </div>
                {offeringRequestable(o.price, o.showPrice) ? (
                  <Button
                    className="min-h-[44px]"
                    onClick={() => request.mutate({ serviceId: o.serviceId, handle: x.handle })}
                    disabled={request.isPending}
                    data-testid={`expert-picker-request-${o.serviceId}`}
                  >
                    Request
                  </Button>
                ) : (
                  <a href={`/services/${o.serviceId}`} className="text-sm underline" data-testid={`expert-picker-quote-${o.serviceId}`}>
                    See the listing
                  </a>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The card above the list. Renders nothing unless the door is open for this viewer. */
export function ExpertDoorCard({
  trip,
  itemCount,
  onDismiss,
}: {
  trip: FreeDraftTrip;
  itemCount: number;
  onDismiss: () => void;
}) {
  const { toast } = useToast();
  const tripId = trip.id;
  const [level, setLevel] = useState<HelpLevel | null>(null);
  const overview = useQuery<Overview>({ queryKey: [`/api/trips/${tripId}/expert-help`] });
  const choose = useMutation({
    mutationFn: async (l: HelpLevel) => {
      reportDoorEvent(tripId, "expert_help_level_chosen", l);
      // "Check my plan" on an empty plan runs the free draft first, so there is a plan to check.
      if (l === "check" && itemCount === 0) {
        await runFreeDraft(trip);
        void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      }
      return l;
    },
    onSuccess: (l) => setLevel(l),
    onError: (e: any, l) => {
      toast({ variant: "destructive", title: "Couldn't draft this plan first", description: e?.message });
      setLevel(l);
    },
  });
  const levelOf = (l: HelpLevel) => overview.data?.levels.find((x) => x.level === l);
  const cityName = overview.data?.market.cityName ?? null;
  return (
    <section className="relative space-y-3 rounded-xl border border-border bg-card p-4" data-testid="expert-door-card">
      <button
        type="button"
        aria-label="Not now"
        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        data-testid="expert-door-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <h2 className="pr-10 font-serif text-lg font-semibold text-foreground">{HELP_CARD_TITLE}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {HELP_LEVEL_CHOICES.map((c) => {
          const band = levelOf(c.level);
          const bandLine = band ? levelBandLine(band.bandLabel, band.expertCount) : null;
          return (
            <button
              key={c.level}
              type="button"
              className="min-h-[44px] rounded-lg border border-border p-3 text-left hover:border-foreground disabled:opacity-60"
              onClick={() => choose.mutate(c.level)}
              disabled={choose.isPending}
              data-testid={`expert-door-level-${c.level}`}
            >
              <span className="block text-sm font-semibold text-foreground">{c.title}</span>
              <span className="block text-xs text-muted-foreground">{c.line}</span>
              {bandLine ? (
                <span className="mt-1 block text-xs font-medium text-foreground" data-testid={`expert-door-band-${c.level}`}>
                  {bandLine}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="min-h-[44px] text-sm underline text-foreground"
        onClick={() => choose.mutate("question")}
        data-testid="expert-door-level-question"
      >
        {QUESTION_LINK}
      </button>
      <Dialog open={!!level} onOpenChange={(o) => (!o ? setLevel(null) : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{level === "question" ? "Ask a local" : HELP_LEVEL_CHOICES.find((c) => c.level === level)?.title}</DialogTitle>
            <DialogDescription>{cityName ? `Local experts in ${cityName}` : "Local experts for this plan"}</DialogDescription>
          </DialogHeader>
          {level ? <ExpertPicker trip={trip} level={level} cityName={cityName} itemCount={itemCount} onClose={() => setLevel(null)} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
