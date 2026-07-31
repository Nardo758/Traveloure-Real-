/**
 * CLAUDE.md §18, item 4 — demote Map preview / Transport / Budget / Change history to
 * collapsed-by-default sections below the day list, plus a new trip-level "Note from your
 * expert" section. Every section renders only when it has real content (§13 — no empty
 * accordions, no fabricated numbers). Reuses existing, working pieces rather than
 * rebuilding them: TransportSection (accept/decline + mode picker, unchanged),
 * ChangeLogPanel (unchanged), the day-map-actions helpers MapControlCenter already uses.
 */
import * as React from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, MessageSquare, Map as MapIcon, Route, Wallet, History, ShoppingBag } from "lucide-react";
import { openDayInMaps, addDayToCalendar } from "./day-map-actions";
import { ChangeLogPanel } from "./ChangeLogPanel";
import { TransportSection } from "./TransportSection";
import type { PlanCardChange, PlanCardDay } from "./plancard-types";
import type { TripPlanBooking } from "@shared/trip-plan";

interface CollapsedSectionsProps {
  tripId: string;
  tripDestination: string;
  day: PlanCardDay | undefined;
  changeLog: PlanCardChange[];
  isViewer: boolean;
  allowTransportActions: boolean;
  totalCostNum?: number | null;
  budgetNum?: number | null;
  perPersonDisplay?: string | null;
  /**
   * W7 — ALL of the trip's days (not just the selected one), used only to work out which of
   * `bookings` below is already rendered inline on an activity row (`activity.booking`) so the
   * Purchases section below surfaces only the ones no plan item points at (RECONCILE_PHASE1_SCOPE
   * §1 W7: "surface them in a small 'Purchases' section").
   */
  days?: PlanCardDay[];
  /** Every real `service_bookings` row on this trip (plancard route's `bookings` key, W4/H2). */
  bookings?: TripPlanBooking[];
}

function SectionShell({
  icon,
  title,
  meta,
  testId,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  testId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border rounded-xl bg-card overflow-hidden" data-testid={testId}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full min-h-11 flex items-center justify-between gap-2 px-4 py-3 text-left"
          data-testid={`${testId}-trigger`}
        >
          <span className="flex items-center gap-2 text-[13px] font-bold text-foreground">
            {icon}
            {title}
            {meta && <span className="text-[11px] font-semibold text-muted-foreground">{meta}</span>}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-0.5 border-t border-border/40">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CollapsedSections({
  tripId,
  tripDestination,
  day,
  changeLog,
  isViewer,
  allowTransportActions,
  totalCostNum,
  budgetNum,
  perPersonDisplay,
  days,
  bookings,
}: CollapsedSectionsProps) {
  const { data: tripNotes } = useQuery<{ expertNotes: string }>({
    queryKey: [`/api/trips/${tripId}/expert-notes`],
    queryFn: () => fetch(`/api/trips/${tripId}/expert-notes`).then((r) => (r.ok ? r.json() : { expertNotes: "" })),
    staleTime: 60_000,
  });

  const activitiesCount = day?.activities?.length ?? 0;
  const transportCount = day?.transports?.length ?? 0;
  const hasBudget = totalCostNum != null && totalCostNum > 0 || (budgetNum != null && budgetNum > 0);
  const budgetPercent =
    budgetNum && budgetNum > 0 && totalCostNum != null ? Math.min(100, Math.round((totalCostNum / budgetNum) * 100)) : null;

  // W7 — bookings no plan item points at (a booking made before migration 159's booking_id key
  // existed, or bought outside the plan). Real bookings ALREADY rendered inline via
  // `activity.booking` are excluded so nothing appears twice (§13: presence is the booked state,
  // read off the same field the badge reads).
  const linkedBookingIds = new Set(
    (days ?? []).flatMap((d) => d.activities.map((a) => a.booking?.id).filter((id): id is string => !!id)),
  );
  const unlinkedBookings = (bookings ?? []).filter((b) => !linkedBookingIds.has(b.id));

  return (
    <div className="flex flex-col gap-2 px-3 sm:px-5 pb-3" data-testid={`collapsed-sections-${tripId}`}>
      {tripNotes?.expertNotes?.trim() && (
        <SectionShell
          icon={<MessageSquare className="w-3.5 h-3.5 text-primary" />}
          title="Note from your expert"
          testId={`collapsed-expert-note-${tripId}`}
        >
          <p className="text-[12.5px] text-foreground/80 whitespace-pre-wrap leading-relaxed pt-2" data-testid={`text-collapsed-expert-note-${tripId}`}>
            {tripNotes.expertNotes}
          </p>
        </SectionShell>
      )}

      {day && activitiesCount > 0 && (
        <SectionShell
          icon={<MapIcon className="w-3.5 h-3.5 text-blue-500" />}
          title="Map preview"
          meta={`${activitiesCount} stop${activitiesCount !== 1 ? "s" : ""} · Day ${day.dayNum}`}
          testId={`collapsed-map-${tripId}`}
        >
          <div className="flex gap-2 flex-wrap pt-2">
            <button
              type="button"
              onClick={() => openDayInMaps(day, tripDestination, "google")}
              className="min-h-11 px-3.5 rounded-lg text-[12px] font-semibold border border-border bg-background hover:bg-muted/50 transition-colors"
              data-testid={`button-collapsed-open-google-maps-${tripId}`}
            >
              Open in Google Maps
            </button>
            <button
              type="button"
              onClick={() => openDayInMaps(day, tripDestination, "apple")}
              className="min-h-11 px-3.5 rounded-lg text-[12px] font-semibold border border-border bg-background hover:bg-muted/50 transition-colors"
              data-testid={`button-collapsed-open-apple-maps-${tripId}`}
            >
              Open in Apple Maps
            </button>
            <button
              type="button"
              onClick={() => addDayToCalendar(day, tripDestination)}
              className="min-h-11 px-3.5 rounded-lg text-[12px] font-semibold border border-border bg-background hover:bg-muted/50 transition-colors"
              data-testid={`button-collapsed-add-calendar-${tripId}`}
            >
              Add to Calendar
            </button>
          </div>
        </SectionShell>
      )}

      {day && transportCount > 0 && (
        <SectionShell
          icon={<Route className="w-3.5 h-3.5 text-green-600" />}
          title="Transport"
          meta={`${transportCount} leg${transportCount !== 1 ? "s" : ""}`}
          testId={`collapsed-transport-${tripId}`}
        >
          <div className="-mx-4">
            <TransportSection tripId={tripId} tripDestination={tripDestination} day={day} allowActions={allowTransportActions} />
          </div>
        </SectionShell>
      )}

      {hasBudget && (
        <SectionShell
          icon={<Wallet className="w-3.5 h-3.5 text-emerald-600" />}
          title="Budget"
          meta={budgetNum ? `$${Math.round(totalCostNum ?? 0).toLocaleString()} of $${Math.round(budgetNum).toLocaleString()}` : undefined}
          testId={`collapsed-budget-${tripId}`}
        >
          <div className="pt-2">
            {budgetPercent != null && (
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2.5" data-testid={`budget-bar-${tripId}`}>
                <div className="h-full bg-primary" style={{ width: `${budgetPercent}%` }} />
              </div>
            )}
            <div className="flex justify-between text-[12.5px] py-1">
              <span className="text-muted-foreground">Spent so far</span>
              <span className="font-bold text-foreground tabular-nums">${Math.round(totalCostNum ?? 0).toLocaleString()}</span>
            </div>
            {perPersonDisplay && (
              <div className="flex justify-between text-[12.5px] py-1">
                <span className="text-muted-foreground">Per person</span>
                <span className="font-bold text-foreground tabular-nums">{perPersonDisplay}</span>
              </div>
            )}
          </div>
        </SectionShell>
      )}

      {unlinkedBookings.length > 0 && (
        <SectionShell
          icon={<ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />}
          title="Purchases"
          meta={`${unlinkedBookings.length} booking${unlinkedBookings.length !== 1 ? "s" : ""}`}
          testId={`collapsed-purchases-${tripId}`}
        >
          <div className="flex flex-col gap-2 pt-2">
            {unlinkedBookings.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 text-[12.5px] py-1"
                data-testid={`purchase-row-${b.id}`}
              >
                <span className="text-foreground font-medium truncate">
                  {b.serviceName ?? "Booking"}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {b.status && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {b.status}
                    </span>
                  )}
                  {b.totalAmount != null && (
                    <span className="font-bold text-foreground tabular-nums">
                      ${Number(b.totalAmount).toLocaleString()}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </SectionShell>
      )}

      {!isViewer && (
        <SectionShell
          icon={<History className="w-3.5 h-3.5 text-amber-500" />}
          title="Change history"
          meta={changeLog.length > 0 ? `${changeLog.length} update${changeLog.length !== 1 ? "s" : ""}` : undefined}
          testId={`collapsed-changes-${tripId}`}
        >
          <div className="pt-1 -mx-4">
            <ChangeLogPanel tripId={tripId} showChanges={true} changeLog={changeLog} />
          </div>
        </SectionShell>
      )}
    </div>
  );
}
