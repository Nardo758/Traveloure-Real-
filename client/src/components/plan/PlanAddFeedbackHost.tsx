/**
 * Cut-list #1 slice C — mounted ONCE in App, beside the Toaster. It draws what follows an add:
 *
 *   added            toast "Added to Day {n}." with Undo and Change day
 *   failed           recovery toast (the approved failure sentence) with Retry
 *   change_day       a dialog titled "Change day" listing the plan's days ("Day {n}")
 *   first_add_dates  the ONE dates panel (the slice B range calendar) — the first add on a plan whose dates were never
 *                    chosen, drawn BEFORE the item lands (QA round 3 PR 1, Leon, Nov 11, 2026): a popover anchored to
 *                    the pressed button from `sm` up, a bottom sheet below it or when no button was pressed. Two exits:
 *                    Save and "Skip for now"; Escape or a click outside is Skip. The runner writes on the answer.
 *
 * It also runs a press that waited in the one slot (`plan-add-runner.ts`) once the session and mode reads answer, and
 * gives a press that waited too long the recovery toast instead of committing it late.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { ToastAction, type ToastActionElement } from "@/components/ui/toast";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { InlineDatesPanel } from "@/components/plan/SlipAnchorPanels";
import { PLAN_DATES_CALENDAR_TITLE } from "@/components/plan/PlanDatesCalendar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { browseSavePath } from "@/lib/browse-save";
import { useSignupMode } from "@/lib/signup-mode";
import { PLAN_ADD_TOAST_MS } from "@/config/toast.config";
import { GUEST_PLAN_QUERY_KEY, guestSaveErrorMessage, type GuestPlanView } from "@/lib/waitlist-guest-plan";
import { ADD_COPY, PENDING_ADD_MAX_AGE_MS, addedMessage, changeDayOptions, pendingAddIsStale, planDayCount, planItemPath, type PlanAddRail } from "@/lib/add-to-plan";
import {
  emitPlanAddFeedback,
  hasQueuedPlanAdd,
  movePlanAdd,
  onPlanAddFeedback,
  onQueuedPlanAdd,
  queuePlanAdd,
  runGuestAdd,
  runSignedInRefAdd,
  setAddPending,
  takeQueuedPlanAdd,
  undoPlanAdd,
  type AddedEvent,
  type FirstAddAnswer,
} from "@/lib/plan-add-runner";

/**
 * R4-3: where "View plan" goes. A signed-in add names its trip, whose page is `/plans/:tripId`
 * (App.tsx). A GUEST rail deliberately gets no View plan action: their plan has no page of its own
 * yet, and inventing one would be a dead link — the toast keeps Undo and Change day for them.
 */
function viewPlanHref(rail: PlanAddRail): string | null {
  return rail.kind === "guest" ? null : `/plans/${encodeURIComponent(rail.tripId)}`;
}

function addedActions(e: AddedEvent): ToastActionElement {
  const path = planItemPath(e.rail, e.itemId);
  const planHref = viewPlanHref(e.rail);
  return (
    <span className="flex shrink-0 gap-1.5" data-testid="toast-added-actions">
      <ToastAction
        altText={ADD_COPY.undo}
        data-testid="toast-added-undo"
        onClick={() => {
          undoPlanAdd(e, path).catch((err) =>
            emitPlanAddFeedback({ kind: "failed", message: guestSaveErrorMessage(err), retry: () => void undoPlanAdd(e, path) }),
          );
        }}
      >
        {ADD_COPY.undo}
      </ToastAction>
      <ToastAction altText={ADD_COPY.changeDay} data-testid="toast-added-change-day" onClick={() => emitPlanAddFeedback({ kind: "change_day", event: e })}>
        {ADD_COPY.changeDay}
      </ToastAction>
      {planHref ? (
        // R4-3: "View plan" beside Undo and Change day — the EXISTING approved string (ADD_COPY.viewPlan),
        // and the plan the add just landed on. No new copy.
        <ToastAction altText={ADD_COPY.viewPlan} data-testid="toast-added-view-plan" onClick={() => window.location.assign(planHref)}>
          {ADD_COPY.viewPlan}
        </ToastAction>
      ) : null}
    </span>
  ) as unknown as ToastActionElement;
}

async function planWindow(rail: PlanAddRail): Promise<{ startDate: string | null; endDate: string | null }> {
  if (rail.kind === "guest") {
    const v = queryClient.getQueryData<GuestPlanView | null>(GUEST_PLAN_QUERY_KEY);
    return { startDate: v?.plan?.startDate ?? null, endDate: v?.plan?.endDate ?? null };
  }
  const res = await apiRequest("GET", `/api/trips/${rail.tripId}`);
  const t = (await res.json()) as { startDate?: string | null; endDate?: string | null };
  return { startDate: t.startDate ?? null, endDate: t.endDate ?? null };
}

export function PlanAddFeedbackHost() {
  const { mode, isLoading: modeLoading } = useSignupMode();
  const { user, isLoading: authLoading } = useAuth();
  const [changeDay, setChangeDay] = useState<{ event: AddedEvent; days: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [dates, setDates] = useState<{
    startDate: string | null;
    endDate: string | null;
    anchor: HTMLElement | null;
    answer: (a: FirstAddAnswer) => void;
  } | null>(null);
  // The ONE way the first-add panel closes: the answer goes to the runner (which then writes) and the panel goes.
  const finishDates = (a: FirstAddAnswer) => {
    setDates((d) => {
      d?.answer(a);
      return null;
    });
  };

  useEffect(
    () =>
      onPlanAddFeedback((f) => {
        if (f.kind === "added") {
          toast({ title: addedMessage(f.event), action: addedActions(f.event), duration: PLAN_ADD_TOAST_MS, "data-testid": "toast-added" } as any);
        } else if (f.kind === "failed") {
          toast({
            variant: "destructive",
            title: f.message,
            duration: PLAN_ADD_TOAST_MS,
            "data-testid": "toast-add-failed",
            action: (
              <ToastAction altText={ADD_COPY.retry} data-testid="toast-add-retry" onClick={() => f.retry()}>
                {ADD_COPY.retry}
              </ToastAction>
            ),
          } as any);
        } else if (f.kind === "change_day") {
          planWindow(f.event.rail).then(
            (w) => setChangeDay({ event: f.event, days: planDayCount(w.startDate, w.endDate) }),
            () => setChangeDay({ event: f.event, days: Math.max(1, f.event.dayNumber ?? 1) }),
          );
        } else if (f.kind === "first_add_dates") {
          setDates({ startDate: f.startDate, endDate: f.endDate, anchor: f.anchor, answer: f.answer });
        }
      }),
    [],
  );

  // The one slot: run a waiting press as soon as both reads answer; a press still waiting after the cap gets Retry.
  const loading = modeLoading || authLoading;
  const signedIn = !!user;
  useEffect(() => {
    const flush = () => {
      if (loading || !hasQueuedPlanAdd()) return;
      const job = takeQueuedPlanAdd()!;
      const path = browseSavePath({ modeLoading: false, authLoading: false, mode, signedIn });
      const go = () => (path === "guest_save" ? void runGuestAdd(job) : signedIn ? void runSignedInRefAdd(job) : undefined);
      if (pendingAddIsStale(job.queuedAt, Date.now())) {
        setAddPending(job.key, false);
        emitPlanAddFeedback({ kind: "failed", message: guestSaveErrorMessage(null), retry: go });
        return;
      }
      if (path === "card_add" && !signedIn) {
        // Signed out in open mode: the add is the card's own (it asks for sign-in); nothing runs without the card.
        setAddPending(job.key, false);
        return;
      }
      go();
    };
    flush();
    const off = onQueuedPlanAdd(() => {
      flush();
      if (!loading) return;
      // Still waiting on a read: give up on this press after the cap, with Retry.
      window.setTimeout(() => {
        if (!hasQueuedPlanAdd()) return;
        const job = takeQueuedPlanAdd()!;
        setAddPending(job.key, false);
        emitPlanAddFeedback({ kind: "failed", message: guestSaveErrorMessage(null), retry: () => queuePlanAdd(job) });
      }, PENDING_ADD_MAX_AGE_MS + 50);
    });
    return () => void off();
  }, [loading, mode, signedIn]);

  const current = changeDay?.event.dayNumber ?? null;
  return (
    <>
      <Dialog open={!!changeDay} onOpenChange={(o) => !o && setChangeDay(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm" data-testid="change-day-dialog">
          <DialogHeader>
            <DialogTitle>{ADD_COPY.changeDay}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2" role="list">
            {changeDay
              ? changeDayOptions(changeDay.days, current).map((o) => (
                  <button
                    key={o.day}
                    type="button"
                    role="listitem"
                    disabled={o.current || moving}
                    aria-current={o.current ? "true" : undefined}
                    className="h-10 rounded-md border border-border text-sm font-medium disabled:opacity-50"
                    data-testid={`change-day-option-${o.day}`}
                    onClick={() => {
                      const e = changeDay.event;
                      setMoving(true);
                      movePlanAdd(e, planItemPath(e.rail, e.itemId), o.day).then(
                        () => {
                          setMoving(false);
                          setChangeDay(null);
                          toast({ title: addedMessage({ dayNumber: o.day, located: e.located }), action: addedActions({ ...e, dayNumber: o.day }), duration: PLAN_ADD_TOAST_MS, "data-testid": "toast-added" } as any);
                        },
                        (err) => {
                          setMoving(false);
                          setChangeDay(null);
                          emitPlanAddFeedback({ kind: "failed", message: guestSaveErrorMessage(err), retry: () => emitPlanAddFeedback({ kind: "change_day", event: e }) });
                        },
                      );
                    }}
                  >
                    {moving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden /> : o.label}
                  </button>
                ))
              : null}
          </div>
        </DialogContent>
      </Dialog>
      {dates ? <FirstAddDates dates={dates} onAnswer={finishDates} /> : null}
    </>
  );
}

/** From `sm` (640px) up a popover anchors to the pressed button; below it, or with no pressed button, a bottom sheet. */
function popoverWidth(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;
  } catch {
    return false;
  }
}

function FirstAddDates({
  dates,
  onAnswer,
}: {
  dates: { startDate: string | null; endDate: string | null; anchor: HTMLElement | null };
  onAnswer: (a: FirstAddAnswer) => void;
}) {
  // The panel only CAPTURES the range here: nothing is written until the runner has the answer (the plan may not exist
  // yet). No `onCancel` ⇒ no "Not now"; Save and "Skip for now" are the two exits.
  const panel = (
    <InlineDatesPanel
      tripId=""
      startDate={dates.startDate}
      endDate={dates.endDate}
      datesConfirmed={false}
      testId="first-add-dates-panel"
      submit={async (d) => onAnswer({ kind: "save", startDate: d.startDate, endDate: d.endDate })}
      onSkip={() => onAnswer({ kind: "skip" })}
    />
  );
  const skip = (open: boolean) => {
    if (!open) onAnswer({ kind: "skip" });
  };
  if (dates.anchor && popoverWidth()) {
    const anchor = { current: dates.anchor };
    return (
      <PopoverPrimitive.Root open onOpenChange={skip}>
        <PopoverPrimitive.Anchor virtualRef={anchor} />
        <PopoverContent align="start" className="w-auto p-0" data-testid="first-add-dates-popover">
          {panel}
        </PopoverContent>
      </PopoverPrimitive.Root>
    );
  }
  return (
    <Sheet open onOpenChange={skip}>
      {/* The sheet's own close button is hidden: Escape and a click outside are Skip, never a third exit. */}
      <SheetContent side="bottom" className="p-3 pt-4 [&>button]:hidden" aria-describedby={undefined} data-testid="first-add-dates-sheet">
        <SheetTitle className="sr-only">{PLAN_DATES_CALENDAR_TITLE}</SheetTitle>
        {panel}
      </SheetContent>
    </Sheet>
  );
}
