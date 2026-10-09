/**
 * PlanningContext — THE single planning entry (ruling `2026-08-28-single-planning-entry`).
 *
 * `usePlanning().open(source?)` is still the one opener, mounted once above the router and called by
 * every "Start a plan" CTA on the site. What it renders was changed by E2 (ledger
 * `2026-10-09-e2-plan-entry`; decision-maker rulings 1–7, Oct 9, 2026):
 *
 *   • A NEW plan — no plan bound, or a door that starts one (`doorStartsNewPlan`) — opens PlanEntry
 *     (`components/plan/PlanEntry.tsx`): "Plan around…" a place / a date / an event → the occasion →
 *     Start a plan → the plan. No When, no Who, no plan name, no build chooser, no Clear/Save.
 *   • The BOUND plan — the Trip Strip's Edit, the cart header, the slip's Edit stops — opens the
 *     edit-only `PlanModal` (Where · When · Who · What's happening, Save). It never creates a plan.
 *
 * A door that chose a way to build (`source.branch`) mints through PlanEntry and then continues on
 * the plan (ruling 2): `ai` → the map with Draft it with AI started (`?draft=ai`); `local` → the
 * expert the door was (D15), else the slip's expert door; a door's own `onFinish` (the concierge, the
 * "start a new plan, then add this" doors) runs once the plan exists. Plus stays hidden.
 *
 * Auth: PlanEntry is open to guests. A guest's Start a plan writes the v2 sign-in record and lands on
 * the guest map; the record is replayed through the same start after sign-in.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
} from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getTripContext, releasePendingEventsPen, switchTripContext, updateTripContext } from "@/lib/trip-context";
import { mintTripSlip } from "@/lib/trip-slip";
import { finishForBranch, isPlanDoor, type PlanDoor } from "@shared/slip-funnel-events";
import { eventTypeForSlug } from "@shared/occasions";
import { OCCASION_GROUP_DEFAULT_SLUG } from "@shared/experience-group";
// The ONE resolver of an earner's public path (LD 40) — read by D15's return-to below.
import { earnerProfilePath } from "@/lib/earner-address";
import { withPlanTripId } from "@/lib/experts-browse";
import { expertDoorHref } from "@/lib/expert-door";
import { PlanModal, type CommittedPlan } from "@/components/trip/plan-modal";
import { PlanEntry, type PlanEntryStart, type PlanEntryStartOutcome } from "@/components/plan/PlanEntry";
import { addPendingGemToTrip } from "@/lib/billboard-gem-planning";
import { doorStartsNewPlan } from "@/lib/plan-steps";
import { eventsNotYetCreated } from "@/lib/organize-events";
import { normalizePendingPlanItems, type PendingPlanItem } from "@shared/pending-plan-items";
import { DRAFT_AI_QUERY, DRAFT_AI_VALUE, GUEST_MAP_PATH, planLandingPath } from "@/lib/plan-landing";
import {
  attachPendingMapAdd,
  pendingMapAddMessage,
  readPendingMapAddRetry,
  writePendingMapAddRetry,
} from "@/lib/pending-map-add";
import type { DraftAnswers } from "@/lib/plan-resume";
import {
  consumePendingPlanRecord,
  pendingPlanRecordTakenThisLoad,
  takePendingPlanRecord,
  writePendingPlanRecord,
  type PendingMapAdd,
  type PendingPlanRecord,
} from "@/lib/pending-plan-record";

export type PlanningBranch = "myself" | "ai" | "local" | "occasion";
// Which branches need a plan ROW before they run is `BRANCHES_THAT_MINT` in `@/lib/plan-steps` —
// a LEAF module, deliberately, because this file imports `PlanModal` and the modal reads that
// constant at runtime. Stating it here would be a circular value import; a type-only import back
// into the leaf is erased and is not.

export interface PlanningSource {
  /**
   * WHICH DOOR opened the modal (E1, ledger `2026-09-28-a0-slice-spec`;
   * docs/planning/slip-funnel-events.md §3.1). One value from the CLOSED list `PLAN_DOORS`
   * (`@shared/slip-funnel-events`); a surface not on that list passes nothing. It is an ANALYTICS
   * fact only: it rides the mint body as the event-only `entry.door`, grants nothing, changes no
   * step and no pre-fill, and is never stored on the trip (§19).
   */
  door?: PlanDoor;
  /** City/destination context from the opener (ticker city, city page, trip re-plan). */
  city?: string;
  country?: string;
  destination?: string;
  /** Force a fresh plan rather than editing the currently bound plan. */
  newPlan?: boolean;
  /**
   * Step 8b-2 (D3): set ONLY by the provider when it replays a guest's record after sign-in — the
   * modal seeds from these answers and finishes on `autoFinish` once. No door sets either.
   */
  resumeAnswers?: DraftAnswers;
  autoFinish?: "myself" | "ai";
  /** An itinerary item to attach only after this door's new plan has been minted. */
  pendingItem?: PendingPlanItem;
  /**
   * Step 8d: the guest map's ONE pending add, set ONLY by the provider's replay of a guest's v2 sign-in
   * record. Run once after the mint (`attachPendingMapAdd`); no door sets it.
   */
  pendingMapAdd?: PendingMapAdd;
  /** Re-plan context: the trip this entry belongs to. */
  tripId?: string;
  /** Deep-open a branch. Since `2026-09-04-one-modal-many-doors` this narrows the FINISH to that
   *  one CTA; it does NOT skip the modal's steps (the pricing ladder rows use it). */
  branch?: PlanningBranch;
  /** Coarse machine key to prefill the AI chooser (Landing v2.5 Moment CTA). One of the five
   *  EXPERIENCE_TYPES the modal accepts (travel|wedding|corporate|event|retreat) — never grown
   *  (ruling 2026-09-01-moment-key). */
  experienceType?: string;
  /** Fine occasion identity when opened from a landing Moment (proposal|golf|…). Rides ALONGSIDE
   *  experienceType into the AI generation prompt ("Occasion: …") so the brief carries the moment
   *  (ruling 2026-09-01-moment-key). */
  momentKey?: string;
  /** A seeded `experience_types` SLUG the door already answered (ledger
   *  `2026-09-03-occasion-vocabulary`). Seeded into the trip context on open — the same
   *  `updateTripContext({ experienceSlug })` merge experience-template.tsx does — so the plan the
   *  traveler starts carries a real catalog occasion instead of nothing. It is ALSO what makes the
   *  modal open at step 2 with the occasion pill (`resolvePlanSteps`). Optional and additive: a
   *  door with no occasion (or a Moment with no seeded row) passes nothing and NOTHING is
   *  seeded, never a guessed slug (§13). */
  experienceSlug?: string;
  /**
   * THE EVENT A PLAN IS BUILT AROUND (landing reorder, ledger `2026-09-28-city-events`): passed by
   * "Plan around it" on the city-events strip and the /events "Coming up" block. On open, and only
   * when no plan is bound, it seeds the pre-trip context with the event's city, its dates (one
   * night = a single day, two or more = the range — the Moments/Trips split is made per EVENT from
   * its nights), the main moment (its first date and local start time) and the event itself as a
   * pending event, so the plan minted from it carries the event as its anchor and as a real
   * event row. Every value is the event row's own; nothing is invented. It grants nothing.
   */
  anchor?: {
    title: string;
    /** Local calendar dates in the event's city, "YYYY-MM-DD". lastDate = firstDate for one night. */
    firstDate: string;
    lastDate: string;
    /** Local wall-clock start, "HH:MM" — null when the organiser published only the date (migration 337). */
    startTime: string | null;
    venue: string;
  };
  /**
   * AUTHORING MODE — this door is an EXPERT building a plan for a CLIENT (ledger
   * `2026-09-04-step4-variants-fields`). It relabels step 4's actor ("Who is traveling with your
   * client?" / "The client's party") and nothing else: same steps, same columns, same writes, same
   * gates. A label is not a permission.
   *
   * PASSED BY THE DOOR, NEVER INFERRED FROM THE VIEWER'S ROLE. The expert authoring builds are the
   * ones whose trips carry `userId = NULL` and an `authorId` (migration 133), and only the surface
   * that opened the modal knows it is one of those — an expert planning their own holiday is a
   * TRAVELER, and a role check would relabel their own plan as a client's.
   *
   * NO DOOR SETS THIS TODAY, and that is the honest state rather than an oversight: every current
   * opener (`landing`, `/start/events`, the marketplace surfaces, the cart header, the Trip Strip,
   * the experience template, the pricing ladder) is a traveler door. The expert authoring builds
   * are server rails (`ready-made.routes.ts`, `expert-workspace.routes.ts`) with no plan-modal
   * surface yet; when one is built it passes `authoring: true` here and needs nothing else.
   */
  authoring?: boolean;
  /**
   * RETURN-TO CONTEXT (lane L22, ledger `2026-09-07-doors-pass-tripid`; CLAUDE.md Locked
   * Decision 42 **D15**).
   *
   * "A plan started from a listing ends back at that listing." A traveler who starts a plan from
   * an earner's storefront and finishes with "plan with a local" was dropped into a `/experts`
   * BROWSE — sent to look for the person whose page they were already standing on. This is the
   * context the door already holds, so under **D13** it is passed rather than reconstructed.
   *
   * IT IS A RETURN ADDRESS AND GRANTS NOTHING. It authorizes no add, no hire and no read; every
   * downstream gate is unchanged. An expert is addressed the way Locked Decision 40 requires —
   * **by HANDLE**, never by a bare `users.id` — and the path is resolved by `earnerProfilePath`,
   * the ONE module that decides where an earner's public page lives (§18 rule 1).
   *
   * §13 — A DOOR PASSES ONLY WHAT IS TRUE. A page with no claimed handle in hand passes NOTHING
   * and the finish behaves exactly as it does today. The `service` kind is declared here because
   * D15 rules both halves in one sentence and a partial type would invite a second one; **its
   * finish is NOT built in this lane** and the `local` rail below reads only the `expert` kind, so
   * a `service` return address is inert rather than silently mishandled.
   */
  returnTo?: { kind: "expert"; handle: string } | { kind: "service"; id: string };
  /**
   * THE DOOR'S OWN FINISH (ledger `2026-09-07-concierge-door`, CLAUDE.md Locked Decision 45 (2)).
   *
   * Called with the branch the traveler chose and the plan as the modal committed it, BEFORE the
   * default rail below runs. Return **true** to say "this door handled that branch"; the default
   * rail is then skipped and the modal simply closes. Return false/undefined — or omit the hook
   * entirely, which every existing door does — and every branch behaves exactly as it always has.
   *
   * WHY A DOOR MAY OWN A FINISH AT ALL. Locked Decision 42 (D15) already ruled that a door's own
   * context shapes what the finish DOES with the plan (a plan started from a listing "finishes
   * with that listing offered for Add to plan"). The concierge door is the same shape one step
   * further on: its Destination Concierge tier is a ROUTED LEAD — the platform matches the expert
   * after the send — while the generic `local` rail is a BROWSE of `/experts`. Both are "get a
   * local expert"; only the door knows which of the two the traveler asked for, and only the door
   * holds the concierge request the lead belongs to.
   *
   * IT GRANTS NOTHING AND DERIVES NOTHING. It is a hand-back, not a permission: every gate
   * downstream of it — the sign-in gate, `POST /api/trips`' own ownership, `POST
   * /api/expert-requests`' `isAuthenticated` + `verifyTripOwnership` — is the server's and is
   * untouched. It also runs AFTER `commitPlan`, so a door that handles a finish is reading the
   * plan the traveler just described rather than the one they had before.
   *
   * NOT A SECOND BRANCH RUNNER. `runBranch` below stays THE default rail for every branch and
   * every door; this is an override a door opts into for a branch it has its own rail for. A
   * per-door `if` written INSIDE `runBranch` would be the drift class §18 rule 1 names — the
   * shared runner would then have to remember every door's exceptions.
   */
  onFinish?: (branch: PlanningBranch, plan: CommittedPlan) => boolean;
}

interface PlanningApi {
  open: (source?: PlanningSource) => void;
  close: () => void;
  /**
   * START A PLAN from an inline PlanEntry (E3: the /experiences page). The SAME mint the pop-up's
   * Start a plan runs — guest record, mint, occasion, event, landing — never a second create path.
   */
  start: (start: PlanEntryStart, source?: PlanningSource) => Promise<PlanEntryStartOutcome>;
}

interface PendingGemRecovery {
  tripId: string;
  item: PendingPlanItem;
}

type PendingGemRetryOutcome =
  | { ok: true; tripId: string }
  | { ok: false; message: string };

const PENDING_GEM_RECOVERY_KEY = "pendingBillboardGemRecovery";

function readPendingGemRecovery(): PendingGemRecovery | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.sessionStorage.getItem(PENDING_GEM_RECOVERY_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { tripId?: unknown; item?: unknown };
    const tripId = typeof parsed.tripId === "string" ? parsed.tripId.trim() : "";
    const [item] = normalizePendingPlanItems([parsed.item]);
    if (tripId && item) return { tripId, item };
    window.sessionStorage.removeItem(PENDING_GEM_RECOVERY_KEY);
  } catch {
    try {
      window.sessionStorage.removeItem(PENDING_GEM_RECOVERY_KEY);
    } catch {
      // Storage is optional; malformed/unavailable recovery storage cannot block the app.
    }
  }
  return null;
}

function savePendingGemRecovery(recovery: PendingGemRecovery): void {
  try {
    window.sessionStorage.setItem(PENDING_GEM_RECOVERY_KEY, JSON.stringify(recovery));
  } catch {
    // The in-memory recovery UI remains available if browser storage is disabled.
  }
}

function clearPendingGemRecovery(): void {
  try {
    window.sessionStorage.removeItem(PENDING_GEM_RECOVERY_KEY);
  } catch {
    // Clearing the in-memory state still completes recovery for this session.
  }
}

interface PlanningHotData {
  planningContext?: Context<PlanningApi | null>;
}

// Keep the context object itself stable across Vite Fast Refresh updates. If this module is
// replaced while an already-mounted Layout still holds the previous module revision, creating a
// fresh context here leaves its usePlanning() calls disconnected from the refreshed provider even
// though the component tree is correctly nested. Vite's per-module hot data survives replacement,
// so both revisions continue to share one context identity until the next full page load.
const planningHotData = import.meta.hot?.data as PlanningHotData | undefined;
const PlanningContext =
  planningHotData?.planningContext ?? createContext<PlanningApi | null>(null);

if (planningHotData) {
  planningHotData.planningContext = PlanningContext;
}

export function usePlanning(): PlanningApi {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error("usePlanning must be used within PlanningProvider");
  return ctx;
}

/** Ruling 2 (derive-and-retire): trips.status is a DEAD field — trip phase derives
 *  from dates, the same convention my-trips/admin use. A trip whose end date has
 *  passed lands on the summary card; anything else (including no dates yet) lands on
 *  the planning surface. */
export function planningRouteForTrip(tripId: string, endDate?: string): string {
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59`);
    if (!isNaN(end.getTime()) && end.getTime() < Date.now()) return `/trip/${tripId}`;
  }
  return `/plans/${tripId}`;
}

export function PlanningProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  /** The edit-only window over the BOUND plan (E2 ruling 1). */
  const [modalOpen, setModalOpen] = useState(false);
  /** PlanEntry — the one way a NEW plan starts (E2). */
  const [entryOpen, setEntryOpen] = useState(false);
  const [source, setSource] = useState<PlanningSource | null>(null);
  const [pendingGemRecovery, setPendingGemRecovery] = useState<PendingGemRecovery | null>(
    readPendingGemRecovery,
  );

  useEffect(() => {
    if (pendingGemRecovery) setModalOpen(true);
  }, [pendingGemRecovery]);

  /**
   * Where a plan continues once it exists (E2 ruling 2): `ai` → the map with Draft it with AI started
   * (`?draft=ai`, which asks for dates first when they are unconfirmed — E1); `local` → back to the
   * expert the door was (D15), else the slip's expert door; anything else → the landing view.
   */
  const continueOn = (branch: PlanningBranch, plan: CommittedPlan, source: PlanningSource | null, view: "map" | "list") => {
    const tripId = plan.tripId as string;
    if (branch === "ai") {
      setLocation(`/plans/${tripId}?view=map&${DRAFT_AI_QUERY}=${DRAFT_AI_VALUE}`);
      return;
    }
    if (branch === "local") {
      // D15 (lane L22): a plan started FROM an expert ends back at that expert. Addressed by HANDLE
      // (Locked Decision 40) through `earnerProfilePath`, the ONE resolver of an earner's public path.
      if (source?.returnTo?.kind === "expert") {
        const path = earnerProfilePath({ handle: source.returnTo.handle });
        if (path) {
          setLocation(withPlanTripId(path, plan.tripId));
          return;
        }
      }
      setLocation(expertDoorHref(tripId));
      return;
    }
    setLocation(view === "map" ? `/plans/${tripId}?view=map` : `/plans/${tripId}`);
  };

  const open = useCallback((src?: PlanningSource) => {
    if (pendingGemRecovery) {
      // Preserve the unresolved door and its gem; a second opener cannot replace the retry source.
      setModalOpen(true);
      return;
    }
    // B1/B2 (ledger `2026-09-30-b1-new-plan-inherits-nothing`): an ENTRY door opened while a minted
    // plan is bound starts a NEW plan — it never edits, re-labels or inherits from the bound one.
    // The rule is `doorStartsNewPlan` (`@/lib/plan-steps`), never restated here.
    const next = src && !src.newPlan && doorStartsNewPlan(src, getTripContext().tripId)
      ? { ...src, newPlan: true }
      : src ?? null;
    // A door that NAMES an existing plan and a way to build continues ON that plan (E2 ruling 2):
    // there is nothing to create, so nothing opens.
    if (next?.tripId && next.branch && !next.newPlan) {
      continueOn(next.branch, { tripId: next.tripId }, next, "map");
      return;
    }
    setSource(next);
    // The door already named the occasion — record it on the planning context so every
    // downstream surface reads the same slug. Additive merge, never a switch: this does not
    // touch trip identity. NOT onto a pen bound to a plan (ledger `2026-09-26-occasion-read-only`):
    // opening the modal is not choosing — the modal reads `source.experienceSlug` itself, and only
    // its commit may change a plan's occasion.
    if (next?.experienceSlug && !getTripContext().tripId) {
      updateTripContext({ experienceSlug: next.experienceSlug });
    }
    // The event a door is built around seeds the unbound pen with the event's own facts (see
    // `PlanningSource.anchor`). Never onto a pen bound to a plan: that plan's dates are its own.
    // PlanEntry does not read the pen for the event (P-H1): it carries the anchor in its own state
    // straight into the mint, so a traveler with a current plan still gets the event.
    if (next?.anchor && !getTripContext().tripId) {
      const a = next.anchor;
      updateTripContext({
        ...(next.city ? { destination: next.city } : {}),
        startDate: a.firstDate,
        endDate: a.lastDate,
        mainMomentDate: a.firstDate,
        ...(a.startTime ? { mainMomentTime: a.startTime } : {}),
        pendingEvents: [{ title: a.title, eventDate: a.firstDate, ...(a.startTime ? { startTime: a.startTime } : {}), location: a.venue }],
      });
    }
    // E2 ruling 1: PlanEntry only CREATES plans; the edit window only edits the bound one.
    const bound = !!(getTripContext().tripId || next?.tripId);
    if (!bound || next?.newPlan) {
      setEntryOpen(true);
    } else {
      setModalOpen(true);
    }
  }, [pendingGemRecovery, setLocation]);

  const close = useCallback(() => {
    if (pendingGemRecovery) {
      toast({
        variant: "destructive",
        title: "Gem still needs to be added",
        description: "Your plan is already created. Retry adding the gem before closing this planning window.",
      });
      return;
    }
    setModalOpen(false);
    setEntryOpen(false);
  }, [pendingGemRecovery, toast]);

  const retryPendingGem = useCallback(async (): Promise<PendingGemRetryOutcome> => {
    if (!pendingGemRecovery) return { ok: false, message: "There is no pending gem to retry." };
    try {
      await addPendingGemToTrip(pendingGemRecovery.tripId, pendingGemRecovery.item);
      clearPendingGemRecovery();
      setPendingGemRecovery(null);
      setSource((current) =>
        current?.pendingItem?.id === pendingGemRecovery.item.id
          ? { ...current, newPlan: false, pendingItem: undefined }
          : current,
      );
      return { ok: true, tripId: pendingGemRecovery.tripId };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "The gem still could not be added. Please retry again.",
      };
    }
  }, [pendingGemRecovery]);

  const finishPendingGemRecovery = useCallback((tripId: string) => {
    clearPendingGemRecovery();
    setPendingGemRecovery(null);
    setModalOpen(false);
    setLocation(`/plans/${tripId}`);
  }, [setLocation]);

  /**
   * START A PLAN (E2). The ONE mint for a new plan from any door: the answers PlanEntry collected —
   * a city, an occasion, and dates/an event only when the traveler chose them — become a plan, and
   * the traveler lands on it.
   *
   *   1. A guest writes the v2 sign-in record and lands on the GUEST MAP (no dead end); the record is
   *      replayed through this same function after sign-in.
   *   2. The pre-trip pen is RELEASED (awaited) BEFORE the mint, so the server's drain cannot write
   *      a stale pen's events onto the new plan (ledger `2026-09-06-event-mint-dedupe`).
   *   3. `mintTripSlip` — THE traveler-owned client mint door. Real dates (a date or an event pick)
   *      reach the body, which is what stamps `dates_confirmed_at` (E2 ruling 6); none ⇒ the E1
   *      placeholder window, nothing certified.
   *   4. The occasion PATCH, the event row (through the shared idempotency rule), the door's pending
   *      add or gem — then the build-way continuation (E2 ruling 2) or the landing view.
   */
  const startFromEntry = useCallback(
    async (start: PlanEntryStart, from: PlanningSource | null): Promise<PlanEntryStartOutcome> => {
      const branch: PlanningBranch = from?.branch ?? "myself";
      if (!user) {
        writePendingPlanRecord({
          branch: branch === "ai" ? "ai" : "myself",
          door: (from?.door as string | undefined) ?? null,
          answers: entryAnswers(start),
          source: { experienceSlug: start.occasionSlug, city: start.city, country: start.country, destination: start.destination },
          ...(from?.pendingMapAdd ? { pendingAdd: from.pendingMapAdd } : {}),
        });
        setEntryOpen(false);
        setLocation(GUEST_MAP_PATH);
        return { ok: true };
      }
      if (pendingGemRecovery) {
        return { ok: false, message: "Your plan was created, but its gem still needs to be added. Retry it from the plan." };
      }
      await releasePendingEventsPen();
      const door = isPlanDoor(from?.door) ? from!.door : undefined;
      const finish = finishForBranch(branch === "occasion" ? "myself" : branch);
      const outcome = await mintTripSlip(
        {
          destination: start.destination,
          ...(start.startDate && start.endDate ? { startDate: start.startDate, endDate: start.endDate } : {}),
          entry: {
            ...(door ? { door } : {}),
            occasionSource: start.occasionAsked ? "asked" : "door_prefilled",
            ...(finish ? { finish } : {}),
          },
        },
        undefined,
        { datesOptional: true },
      );
      if (!outcome.ok) return { ok: false, message: outcome.message };
      const tripId = outcome.tripId;

      await apiRequest("PATCH", `/api/trips/${tripId}/occasion`, {
        experienceSlug: start.occasionSlug,
        eventType: eventTypeForSlug(start.occasionSlug),
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[plan-entry] occasion not saved on the new plan:", err?.message);
      });

      // The new plan becomes the bound plan, with its occasion, BEFORE the traveler lands on it — the
      // same identity switch the old finish made — so every surface (the edit window included) reads
      // this plan's occasion rather than the previous plan's (B1: a new plan inherits nothing).
      switchTripContext({
        tripId,
        destination: start.destination,
        ...(start.startDate && start.endDate ? { startDate: start.startDate, endDate: start.endDate } : {}),
      });
      updateTripContext({ experienceSlug: start.occasionSlug, eventType: eventTypeForSlug(start.occasionSlug) });

      if (start.event) {
        const existing = await readPlanEventTitles(tripId);
        const draft = { title: start.event.title };
        const rows = existing ? eventsNotYetCreated([draft], existing) : [draft];
        for (const row of rows) {
          await apiRequest("POST", "/api/user-experiences", {
            tripId,
            title: row.title,
            eventDate: start.event.eventDate,
            startTime: start.event.startTime,
            location: start.event.location,
            ...(start.occasionId ? { experienceTypeId: start.occasionId } : {}),
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(`[plan-entry] event "${row.title}" not created:`, err?.message);
          });
        }
      }

      // Step 8d: the guest map's one add, run ONCE onto the plan just created. The retry entry is
      // written FIRST, so a reload or a failure retries the ADD, never the mint.
      if (from?.pendingMapAdd) {
        const add = from.pendingMapAdd;
        writePendingMapAddRetry(outcome.tripId, add);
        const added = await attachPendingMapAdd(outcome.tripId, add);
        const said = pendingMapAddMessage(added);
        toast({ title: said.title, description: said.description, ...(said.destructive ? { variant: "destructive" as const } : {}) });
      }
      if (from?.pendingItem) {
        const pendingItem = from.pendingItem;
        try {
          await addPendingGemToTrip(tripId, pendingItem);
        } catch (error) {
          const recovery = { tripId, item: pendingItem };
          savePendingGemRecovery(recovery);
          setPendingGemRecovery(recovery);
          setEntryOpen(false);
          return { ok: true };
        }
      }

      void queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] });
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      setEntryOpen(false);
      setSource(null);

      const plan: CommittedPlan = {
        tripId,
        destination: start.destination,
        ...(start.startDate ? { startDate: start.startDate } : {}),
        ...(start.endDate ? { endDate: start.endDate } : {}),
        occasionSlug: start.occasionSlug,
      };
      // THE DOOR'S OWN FINISH (see `PlanningSource.onFinish`): the concierge's routed lead and the
      // "start a new plan, then add this" doors run after the plan exists (E2 ruling 2).
      if (from?.onFinish?.(branch, plan) === true) return { ok: true };
      continueOn(branch, plan, from, start.view);
      return { ok: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, pendingGemRecovery, setLocation, toast],
  );


  // ── Step 8b-2 (D3): THE GUEST'S PLAN, CARRIED THROUGH SIGN-IN ───────────────────────────────────
  // After sign-in (a full reload), the record is TAKEN — and so cleared — BEFORE the plan is created,
  // then replayed through the ONE start: the same mint, the same landing.
  const replayEntryRecord = async (record: PendingPlanRecord) => {
    const start = entryStartFromRecord(record);
    if (!start) {
      toast({ variant: "destructive", title: "Your plan was not created", description: "Pick a city to start your plan." });
      return;
    }
    const out = await startFromEntry(start, {
      ...(record.door ? { door: record.door as PlanningSource["door"] } : {}),
      newPlan: true,
      branch: record.branch,
      ...(record.pendingAdd ? { pendingMapAdd: record.pendingAdd } : {}),
    });
    if (!out.ok && out.message) toast({ variant: "destructive", title: "Your plan was not created", description: out.message });
  };
  const replayedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id || replayedForUser.current === user.id) return;
    replayedForUser.current = user.id;
    consumePendingPlanRecord({
      take: () => takePendingPlanRecord(),
      // Every record is a PlanEntry start (E2), the /experiences page's included (E3, ruling 1).
      replay: (record) => void replayEntryRecord(record),
    });
    // Step 8d: a guest-map add whose plan was created but whose add did not land is retried here —
    // the add only, idempotently (the plan is read first). Never on a load that is replaying a record.
    if (!pendingPlanRecordTakenThisLoad()) {
      const retry = readPendingMapAddRetry();
      if (retry) {
        void attachPendingMapAdd(retry.tripId, retry.add).then((added) => {
          const said = pendingMapAddMessage(added);
          toast({ title: said.title, description: said.description, ...(said.destructive ? { variant: "destructive" as const } : {}) });
          if (added.status !== "failed") {
            void queryClient.invalidateQueries({ queryKey: [`/api/trips/${retry.tripId}/plancard`] });
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const start = useCallback(
    (entry: PlanEntryStart, from?: PlanningSource) => startFromEntry(entry, from ?? null),
    [startFromEntry],
  );
  const api = useMemo(() => ({ open, close, start }), [open, close, start]);

  return (
    <PlanningContext.Provider value={api}>
      {children}

      <PlanEntry
        open={entryOpen}
        onOpenChange={(v) => (v ? setEntryOpen(true) : close())}
        source={entryOpen ? source : null}
        onStart={(start) => startFromEntry(start, source)}
      />

      <PlanModal
        open={modalOpen}
        onOpenChange={(v) => (v ? setModalOpen(true) : close())}
        source={source}
        // The door's own answer, forwarded verbatim — never derived from `user.role` here (see the
        // field's note on `PlanningSource`).
        authoring={source?.authoring === true}
        pendingGemRetry={pendingGemRecovery ? { title: pendingGemRecovery.item.title } : null}
        retryPendingGem={retryPendingGem}
        onPendingGemRecovered={finishPendingGemRecovery}
      />
    </PlanningContext.Provider>
  );
}

/** A PlanEntry start as the v2 sign-in record's answers (the guest map reads the same shape). */
function entryAnswers(start: PlanEntryStart): DraftAnswers {
  return {
    title: "",
    stops: [start.destination],
    startDate: start.startDate ?? "",
    endDate: start.endDate ?? "",
    adults: "",
    kids: "",
    budgetApproverName: "",
    budgetApproverEmail: "",
    accessibilityNote: "",
    mainMomentTime: "",
    mainMomentDate: "",
    events: start.event ? [{ title: start.event.title, eventDate: start.event.eventDate, startTime: start.event.startTime, location: start.event.location }] : [],
    occasionSlug: start.occasionSlug,
  };
}

/** The reverse: a record back into a start. A record with no city states no plan (§13). */
function entryStartFromRecord(record: PendingPlanRecord): PlanEntryStart | null {
  const a = record.answers;
  const destination = (a.stops?.[0] ?? record.source.destination ?? "").trim();
  if (!destination) return null;
  const [cityPart, ...rest] = destination.split(",");
  const occasionSlug = (a.occasionSlug || record.source.experienceSlug || OCCASION_GROUP_DEFAULT_SLUG.trips).trim();
  const ev = a.events?.[0];
  // The record carries no catalog row to group by; a replayed start lands where the guest already was — the map.
  const view = "map" as const;
  return {
    destination,
    city: record.source.city ?? cityPart.trim(),
    country: record.source.country ?? rest.join(",").trim(),
    ...(a.startDate && a.endDate ? { startDate: a.startDate, endDate: a.endDate } : {}),
    occasionSlug,
    ...(ev ? { event: { title: ev.title, eventDate: ev.eventDate ?? a.startDate, startTime: ev.startTime ?? null, location: ev.location ?? "" } } : {}),
    view,
    occasionAsked: true,
  };
}

/** The plan's existing event titles, or null when they could not be read (§13: unread ≠ empty). */
async function readPlanEventTitles(tripId: string): Promise<string[] | null> {
  try {
    const res = await apiRequest("GET", "/api/user-experiences");
    const rows: Array<{ tripId?: string | null; title?: string | null }> = await res.json();
    if (!Array.isArray(rows)) return null;
    return rows.filter((r) => r?.tripId === tripId).map((r) => (typeof r?.title === "string" ? r.title : "")).filter((t) => t.length > 0);
  } catch {
    return null;
  }
}
