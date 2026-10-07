/**
 * THE GUEST MAP — `/plans/new?view=map` (step 8d, brief items 24–26; ledger
 * `2026-10-07-step8d-guest-map`; boards `docs/design/experiences-map-planner/ExperienceMap*.dc.html`,
 * the guest states).
 *
 * A signed-out visitor who finishes the planning modal on "Build it myself" from the Experiences start
 * page lands here — with no plan. The sign-in record (`pending-plan-record.ts`) already holds their
 * answers; this page READS it (never consumes it) and shows the city's Browse layer on the ONE map
 * (`MapControlCenter`, guest mode). "Add to plan" puts that ONE place on the record and opens the
 * existing sign-in modal with the board's copy; after sign-in the planning provider takes the record,
 * creates the plan through the ONE mint and runs the add once (`pending-map-add.ts`).
 *
 * Unprotected by design; `/plans/:tripId` stays protected. Nothing is stored for a guest on the server
 * (G2), and nothing here writes the cart.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { MapControlCenter } from "@/components/plancard/MapControlCenter";
import { mapDayChips } from "@/lib/map-days";
import { GUEST_MAP_PATH } from "@/lib/plan-landing";
import {
  hasPendingPlanRecord,
  peekPendingPlanRecord,
  pendingPlanRecordTakenThisLoad,
  setPendingMapAdd,
} from "@/lib/pending-plan-record";
import {
  GUEST_GATE_DISMISS,
  GUEST_GATE_TITLE,
  GUEST_MAP_BANNER,
  GUEST_MAP_EYEBROW,
  GUEST_MAP_START_LABEL,
  GUEST_MAP_TRAY,
  guestAnswersLine,
  guestDestination,
  guestGateDescription,
  guestMapCenter,
  type GuestGateKind,
} from "@/lib/guest-map";
import type { BrowsePlace } from "@/lib/map-scene";

const GUEST_DAYS = mapDayChips([], null);

export default function GuestPlanMapPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const { openSignInModal } = useSignInModal();
  const [selectedDay, setSelectedDay] = useState(0);
  // Read once per mount; the add rewrites the record, and the page re-reads it when it needs to.
  const record = useMemo(() => (user ? null : peekPendingPlanRecord()), [user]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" data-testid="guest-map-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  // Signed in: the planning provider is replaying the record — the plan is being created and the
  // finish will land on its map. With no record at all there is nothing to create (§13).
  if (user) {
    const creating = pendingPlanRecordTakenThisLoad() || hasPendingPlanRecord();
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center" data-testid={creating ? "guest-map-creating" : "guest-map-no-record"}>
        {creating ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Creating your plan…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            There is no plan waiting here.{" "}
            <Link href="/experiences" className="underline" data-testid="link-guest-map-start">
              Start a plan
            </Link>
          </p>
        )}
      </div>
    );
  }

  // Signed out with no record: no answers to show, and none are invented.
  if (!record) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center" data-testid="guest-map-no-record">
        <p className="text-sm text-muted-foreground">
          Your answers are not here any more.{" "}
          <Link href="/experiences" className="underline" data-testid="link-guest-map-start">
            Start a plan
          </Link>
        </p>
      </div>
    );
  }

  const destination = guestDestination(record.answers, record.source);
  const answersLine = guestAnswersLine(record.answers, destination);
  const center = guestMapCenter(destination);

  const openGate = (gate: GuestGateKind) =>
    openSignInModal({
      title: GUEST_GATE_TITLE,
      description: guestGateDescription(answersLine, gate),
      returnTo: GUEST_MAP_PATH,
      dismissLabel: GUEST_GATE_DISMISS,
    });

  const onAdd = (place: BrowsePlace) => {
    if (place.kind !== "listing" && place.kind !== "partner") return;
    const kept = setPendingMapAdd({ kind: place.kind, id: place.id, title: place.name, dayNumber: 1 });
    if (!kept) {
      // The record expired while browsing: say so rather than pretend the add was kept.
      toast({ variant: "destructive", title: "Your answers have expired", description: "Start your plan again to add this." });
      return;
    }
    openGate({ kind: "add", name: place.name });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-4" data-testid="guest-map">
      <div className="rounded-lg border border-border bg-card p-4 space-y-2" data-testid="guest-map-banner">
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground" data-testid="guest-map-eyebrow">
          {GUEST_MAP_EYEBROW}
        </p>
        <p className="text-sm">{GUEST_MAP_BANNER}</p>
        {answersLine ? (
          <p className="text-sm text-muted-foreground" data-testid="guest-map-answers">
            {answersLine}
          </p>
        ) : null}
      </div>

      {destination ? (
        // `isolate`: Leaflet's panes carry z-indexes in the hundreds; a stacking context keeps them
        // under the sign-in dialog this page opens over the map.
        <div className="isolate rounded-lg border border-border bg-card" data-testid="guest-map-canvas">
          <MapControlCenter
            tripId="guest"
            tripDestination={destination}
            days={GUEST_DAYS}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            layout="split"
            guest={{ center, onAdd }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4" data-testid="guest-map-tray">
        <div>
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground">{GUEST_MAP_EYEBROW}</p>
          <p className="text-sm">{GUEST_MAP_TRAY}</p>
        </div>
        <Button onClick={() => openGate({ kind: "start" })} data-testid="button-guest-map-start">
          {GUEST_MAP_START_LABEL}
        </Button>
      </div>
    </div>
  );
}
