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
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
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
  takePendingPlanRecord,
  type PendingPlanRecord,
} from "@/lib/pending-plan-record";
import { useSignupMode } from "@/lib/signup-mode";
import { planTitle } from "@/lib/trip-slip";
import { PlansNewStart } from "@/components/plan/PlansNewStart";
import { startForCity } from "@/lib/plans-new-start";
import { planEntryDestination } from "@/lib/plan-entry";
import { usePlanning } from "@/contexts/PlanningContext";
import { useDocumentTitle } from "@/lib/use-document-title";
import { WAITLIST_COPY } from "@/lib/waitlist-copy";
import {
  claimGuestPlans,
  createGuestPlan,
  guestSaveErrorMessage,
  saveToGuestPlan,
  guestBodyForPlace,
  guestBodyForPendingAdd,
  guestSavedMessage,
  guestPlanDays,
  takeClaimedGuestPlanId,
  updateGuestPlan,
  useGuestPlan,
} from "@/lib/waitlist-guest-plan";
import { GUEST_PLAN_COPY, guestPlanKeptLine } from "@shared/guest-plan-copy";
import { InlineDatesPanel, InlineWhoPanel } from "@/components/plan/SlipAnchorPanels";
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
  guestPlanBanner,
  type GuestGateKind,
} from "@/lib/guest-map";
import type { BrowsePlace } from "@/lib/map-scene";

const GUEST_DAYS = mapDayChips([], null);

export default function GuestPlanMapPage() {
  const { user, isLoading } = useAuth();
  const { mode } = useSignupMode();
  // N-5 (round 2): the tab names the guest's plan once it is read; "Traveloure" until then — never the last page's title.
  const guestPlanForTitle = useGuestPlan(!isLoading && !user && mode === "waitlist");
  useDocumentTitle(guestPlanForTitle.data?.plan.title ?? null);
  // GATE-1B (ledger `2026-11-04-gate1b-guest-plan`): in waitlist mode a signed-out visitor gets a server-side plan
  // here — no sign-in wall. Open mode keeps the sign-in path below, unchanged.
  if (!isLoading && !user && mode === "waitlist") return <WaitlistGuestPlan />;
  return <GuestPlanMapSignIn />;
}

function GuestPlanMapSignIn() {
  const { user, isLoading } = useAuth();
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
    return <SignedInLanding />;
  }

  return <GuestPlanMapRecord record={record} />;
}

/**
 * Signed in on /plans/new. GATE-1B: a guest plan this sign-in claimed opens on its own map (ruling 5); otherwise the
 * planning provider is replaying the sign-in record, or there is nothing here (§13), exactly as before.
 */
function SignedInLanding() {
  const planning = usePlanning();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const userId = (user as any)?.id ?? null;
  useEffect(() => {
    let live = true;
    const open = (id: string | null | undefined) => {
      if (live && id) setLocation(`/plans/${encodeURIComponent(id)}?view=map`);
    };
    const stored = takeClaimedGuestPlanId();
    if (stored) open(stored);
    // A-37: the sign-in's one claim (the app watcher's), never a second request.
    else void claimGuestPlans(userId).then((ids) => open(ids[0] ?? takeClaimedGuestPlanId()));
    return () => {
      live = false;
    };
  }, [setLocation, userId]);
  const creating = pendingPlanRecordTakenThisLoad() || hasPendingPlanRecord();
  return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center" data-testid={creating ? "guest-map-creating" : "guest-map-no-record"}>
        {creating ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Creating your plan…
          </p>
        ) : (
          // A-23: a real empty state — the city pick runs the planning provider's ONE start (the member's mint).
          <PlansNewStart onPick={(m) => planning.start(startForCity(m))} />
        )}
      </div>
  );
}

function GuestPlanMapRecord({ record: initialRecord }: { record: PendingPlanRecord | null }) {
  const { toast } = useToast();
  const { openSignInModal } = useSignInModal();
  const planning = usePlanning();
  const [selectedDay, setSelectedDay] = useState(0);
  const [record, setRecord] = useState(initialRecord);
  // Signed out with no record: no answers to show, and none are invented. A-23: the city pick writes the sign-in record
  // through the ONE start, and this page then shows it.
  if (!record) {
    return (
      <div data-testid="guest-map-no-record">
        <PlansNewStart
          onPick={async (m) => {
            const out = await planning.start(startForCity(m));
            setRecord(peekPendingPlanRecord());
            return out;
          }}
        />
      </div>
    );
  }

  const destination = guestDestination(record.answers, record.source);
  // E-1/E-5/E-8: the lead is what the traveler chose (the record's choice label) — never the group's default occasion.
  const answersLine = guestAnswersLine(record.answers, destination, record.source.choiceLabel ?? null);
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
        <div className="rounded-lg border border-border bg-card" data-testid="guest-map-canvas">
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

// ── GATE-1B: the waitlist guest's server-side plan ───────────────────────────────────────────────────────────────

function WaitlistGuestPlan() {
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState(0);
  // A fresh PlanEntry finish leaves its answers in the sign-in record: they become a NEW guest plan, once, and the
  // record is then consumed (so a later sign-in claims this plan instead of minting a second one).
  const recordRef = useRef<PendingPlanRecord | null>(peekPendingPlanRecord());
  const startedRef = useRef(false);
  const [creating, setCreating] = useState(() => !!recordRef.current);
  const [createFailed, setCreateFailed] = useState(false);
  const planQ = useGuestPlan(!creating);

  useEffect(() => {
    const record = recordRef.current;
    if (!record || startedRef.current) return;
    startedRef.current = true;
    const a = record.answers;
    const destination = guestDestination(a, record.source);
    if (!destination) {
      setCreating(false);
      return;
    }
    const int = (v: string | undefined) => (/^\d+$/.test((v ?? "").trim()) ? Number(v) : undefined);
    const dated = /^\d{4}-\d{2}-\d{2}$/.test(a?.startDate ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(a?.endDate ?? "");
    const adults = int(a?.adults);
    const kids = int(a?.kids);
    createGuestPlan({
      destination,
      // E-1: the plan's title is composed from the traveler's choice and the city (`planTitle`).
      // A-34: no occasion ⇒ the neutral "{City}, {date range}" (the city alone when no dates were chosen).
      title: planTitle({
        city: destination.split(",")[0].trim(),
        occasionName: a?.occasionSlug || record.source.experienceSlug ? record.source.choiceLabel ?? null : null,
        ...(dated ? { startDate: a.startDate, endDate: a.endDate } : {}),
      }),
      ...(dated ? { startDate: a.startDate, endDate: a.endDate } : {}),
      ...(adults !== undefined && adults > 0 ? { adults } : {}),
      ...(kids !== undefined ? { kids } : {}),
      ...(a?.occasionSlug ? { occasionSlug: a.occasionSlug } : {}),
    })
      .then(async () => {
        takePendingPlanRecord();
        // A door's one pending add (a listing or partner place) is saved onto the new plan.
        // A-19: the pending add is replayed whole — its kind and source id — so it saves with its own point.
        const pending = guestBodyForPendingAdd(record.pendingAdd);
        if (pending) {
          await saveToGuestPlan(pending, destination).catch(() => undefined);
        }
      })
      .catch(() => setCreateFailed(true))
      .finally(() => setCreating(false));
  }, []);

  if (creating || planQ.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" data-testid="guest-plan-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  const view = planQ.data ?? null;
  if (!view) {
    return (
      <div data-testid="guest-map-no-record">
        {/* A-23: the city pick makes the guest's server-side plan (city only); the plan then asks dates and party. */}
        <PlansNewStart
          onPick={async (m) => {
            setCreateFailed(false);
            try {
              const destination = planEntryDestination(m);
              await createGuestPlan({ destination, title: planTitle({ city: m.cityName }) });
              return { ok: true };
            } catch {
              setCreateFailed(true);
              return { ok: false };
            }
          }}
        >
          {createFailed ? (
            <p className="text-sm text-destructive" role="alert" data-testid="guest-plan-create-failed">
              {GUEST_PLAN_COPY.saveFailed}
            </p>
          ) : null}
        </PlansNewStart>
      </div>
    );
  }

  const { plan } = view;
  const days = guestPlanDays(view);
  // E-1: the banner composes from the title (the traveler's choice + city), the dates with their year, the party.
  const answersLine = guestPlanBanner({
    title: plan.title,
    startDate: plan.startDate,
    endDate: plan.endDate,
    datesConfirmed: plan.datesConfirmed,
    adults: plan.adults,
    kids: plan.kids,
  });
  const dayNumber = days[selectedDay]?.dayNum ?? 1;

  const onSave = (place: BrowsePlace) => {
    const body = guestBodyForPlace(place, dayNumber);
    if (!body) return;
    saveToGuestPlan(body, plan.destination).then(
      (result) => toast({ title: guestSavedMessage(result) }),
      (err) => toast({ variant: "destructive", title: guestSaveErrorMessage(err) }),
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-4" data-testid="guest-plan">
      <div className="rounded-lg border border-border bg-card p-4 space-y-2" data-testid="guest-plan-banner">
        {answersLine ? (
          <h1 className="text-lg font-semibold" data-testid="guest-map-answers">
            {answersLine}
          </h1>
        ) : null}
        <p className="text-xs text-muted-foreground" data-testid="guest-plan-kept">
          {guestPlanKeptLine(view.retentionDays)}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InlineDatesPanel
          key={`${plan.startDate}:${plan.endDate}`}
          tripId={plan.id}
          startDate={plan.startDate}
          endDate={plan.endDate}
          testId="guest-plan-dates"
          submit={async (d) => {
            await updateGuestPlan({ startDate: d.startDate, endDate: d.endDate });
          }}
        />
        <InlineWhoPanel
          tripId={plan.id}
          current={{ adults: plan.adults, kids: plan.kids } as any}
          submit={async (party) => {
            await updateGuestPlan(party);
          }}
        />
      </div>

      {view.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4" data-testid="guest-plan-empty">
          <p className="text-sm font-semibold">{GUEST_PLAN_COPY.emptyTitle}</p>
          <p className="text-sm text-muted-foreground">{GUEST_PLAN_COPY.emptyBody}</p>
        </div>
      ) : (
        <ol className="rounded-lg border border-border bg-card p-4 space-y-1" data-testid="guest-plan-items">
          {view.items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-sm" data-testid={`guest-plan-item-${it.id}`}>
              <span className="text-xs text-muted-foreground tabular-nums">{`Day ${it.dayNumber}`}</span>
              <span className="truncate">{it.title}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="rounded-lg border border-border bg-card" data-testid="guest-map-canvas">
        <MapControlCenter
          tripId={plan.id}
          tripDestination={plan.destination}
          days={days}
          selectedDay={Math.min(selectedDay, Math.max(0, days.length - 1))}
          onSelectDay={setSelectedDay}
          layout="split"
          guest={{ center: guestMapCenter(plan.destination), onAdd: onSave, withPlan: true }}
        />
      </div>
    </div>
  );
}
