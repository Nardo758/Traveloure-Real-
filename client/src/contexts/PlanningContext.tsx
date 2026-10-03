/**
 * PlanningContext — THE single planning entry (ruling `2026-08-28-single-planning-entry`), now
 * rendering THE single planning MODAL (ledger `2026-09-04-one-modal-many-doors`, CLAUDE.md
 * Locked Decision 33).
 *
 * WHAT IS UNCHANGED. `usePlanning().open(source?)` is still the one opener, mounted once above the
 * router, called by every "Plan my trip" / "Start planning" CTA on the site. Every existing caller
 * keeps working with the `PlanningSource` it already passes; nothing about the contract narrowed.
 *
 * WHAT CHANGED. What the opener RENDERS. It used to render a CHOOSER whose first screen asked
 * "how do you want to plan?" and whose branches then asked for a destination and dates a second
 * time — while the questions a plan actually needs (occasion, where, when, who, what's happening)
 * lived in a different, unreachable dialog. It now renders `PlanModal`: the five ratified steps,
 * with the three ways to build as the FINISH of the last visible step. You say what you are
 * planning before you say who should build it.
 *
 * DOORS DIFFER IN TWO THINGS ONLY — what arrives pre-filled, and which step opens first — and
 * that decision is `resolvePlanSteps` (client/src/lib/plan-steps.ts), never restated here:
 *
 *   hero / about / features / how-it-works / marketplace / `/start/events`  → step 1 (Occasion)
 *   a Moment, the nav Wedding row, an experience CTA (carries an occasion) → step 2 (Where)
 *   a ticker or city page (carries a city)                                 → step 1, Where pre-filled
 *   the Trip Strip's Edit button / cart header / experience-template       → step 1 or 2, by what
 *                                                                            the plan already holds
 *
 * `source.branch` still deep-opens, but it now means the "how" is already decided rather than
 * "skip the questions": the modal runs its steps and the finish shows only that one CTA (the
 * pricing ladder rows and the Moments CTA use this).
 *
 * THE BRANCHES ARE THE SAME BRANCHES, with the same downstream behaviour:
 *   - myself  → mints the draft trip through `mintTripSlip` (THE one traveler-owned client mint
 *               door) and lands on the slip (/plans/:tripId). Sign-in IS the existing gate — the
 *               slip route is a ProtectedRoute — and it is checked BEFORE anything is minted.
 *   - ai      → the EXISTING EnhancedPlanningModal, handed the destination, dates, occasion and
 *               party the traveler just gave. Since ledger
 *               `2026-09-04-golf-occasion-and-housekeeping` it no longer carries fields for them
 *               at all: it shows them read-only, and its "change" affordance comes back here
 *               through `open(source)` — the one opener — rather than editing a second copy.
 *   - local   → /experts (?destination= prefilled when known).
 *   - occasion→ the shared Plus membership checkout client rail — offered ONLY when
 *               PLUS_SALES_ENABLED (public flag on /api/pricing); hidden, never teased, when off.
 * Returning users with an active trip still get "Continue {trip name}", which goes to the
 * PLANNING surface (/plans/:tripId), never the details card.
 *
 * Auth: unchanged. The modal itself is open to guests; branches prompt at their EXISTING gates.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
} from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { getTripContext, updateTripContext, useTripContext } from "@/lib/trip-context";
import { mintTripSlip } from "@/lib/trip-slip";
import type { PlanDoor, TripMintEntry } from "@shared/slip-funnel-events";
// The ONE resolver of an earner's public path (LD 40) — read by D15's return-to below.
import { earnerProfilePath } from "@/lib/earner-address";
import { startMembershipCheckout } from "@/lib/membership-checkout";
import { buildExpertsBrowseHref, withPlanTripId } from "@/lib/experts-browse";
import { expertDoorHref } from "@/lib/expert-door";
import EnhancedPlanningModal from "@/components/EnhancedPlanningModal";
import { PlanModal, type CommittedPlan, type PlanMintOutcome } from "@/components/trip/plan-modal";
import { addPendingGemToTrip } from "@/lib/billboard-gem-planning";
import { doorStartsNewPlan } from "@/lib/plan-steps";
import { normalizePendingPlanItems, type PendingPlanItem } from "@shared/pending-plan-items";

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
  /** An itinerary item to attach only after this door's new plan has been minted. */
  pendingItem?: PendingPlanItem;
  /** Re-plan context: the trip this entry belongs to. */
  tripId?: string;
  /** RC-12: open on step 4 (Who) — honoured only with `tripId`; see `resolvePlanSteps`. */
  focusStep?: "who";
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

function sourceDestination(source: PlanningSource | null): string {
  if (!source) return "";
  if (source.destination) return source.destination;
  if (source.city) return source.country ? `${source.city}, ${source.country}` : source.city;
  return "";
}

/** The finish's CTA order when the door decided nothing. */
const DEFAULT_BRANCHES: PlanningBranch[] = ["myself", "ai", "local"];

export function PlanningProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { openSignInModal } = useSignInModal();
  const { toast } = useToast();
  const [tripCtx] = useTripContext();
  const [, setLocation] = useLocation();

  const [modalOpen, setModalOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [source, setSource] = useState<PlanningSource | null>(null);
  const [pendingGemRecovery, setPendingGemRecovery] = useState<PendingGemRecovery | null>(
    readPendingGemRecovery,
  );
  /** The plan as the modal committed it — what the AI branch is handed instead of asking again. */
  const [committed, setCommitted] = useState<CommittedPlan | null>(null);

  useEffect(() => {
    if (pendingGemRecovery) setModalOpen(true);
  }, [pendingGemRecovery]);

  // PLUS_SALES_ENABLED rides the public pricing bundle (§8 posture — no literals here).
  const { data: pricing } = useQuery<{ plusSalesEnabled?: boolean }>({
    queryKey: ["/api/pricing"],
    staleTime: 5 * 60_000,
  });
  const plusSalesEnabled = pricing?.plusSalesEnabled === true;

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
    setSource(next);
    setCommitted(null);
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
    setModalOpen(true);
  }, [pendingGemRecovery]);

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
    setAiOpen(false);
  }, [pendingGemRecovery, toast]);

  /**
   * THE ONE MINT DOOR, reached from the modal's finish for every branch in `BRANCHES_THAT_MINT`
   * — "Build it myself" and, since Locked Decision 42 D5, "Get a local expert".
   *
   * The destination/date checks and the mint body both live in `@/lib/trip-slip` — `mintTripSlip`
   * is THE traveler-owned client mint door, shared with the template page's expert-request
   * precondition (Locked Decision 32 lane (a)). Duplicating either here is the derivation-drift
   * class §18 rule 1 names; in particular the §13 "dates are asked for, never invented" rule must
   * have exactly one author. `mintTripSlip` refuses before it calls the server, so a short answer
   * still costs no request.
   *
   * The sign-in gate is checked HERE and before the mint. For `myself` it is the slip ROUTE's gate
   * (/plans/:tripId is a ProtectedRoute); for `local` the destination page is PUBLIC, but the gate
   * still belongs here and D5 says so — the trip a request carries must be owned by the session
   * user (Locked Decision 32 (b) verifies exactly that server-side), and a guest owns nothing. A
   * guest gets the sign-in modal and a refusal carrying NO message — the screen has already
   * changed hands, so the plan modal must not also print an error into a dialog it just closed.
   */
  const mintPlan = useCallback(
    async (basics: {
      destination?: string;
      startDate?: string;
      endDate?: string;
      title?: string;
      entry?: TripMintEntry;
    }): Promise<PlanMintOutcome> => {
      if (!user) {
        setModalOpen(false);
        openSignInModal();
        return { ok: false };
      }
      // The plan row already exists. Never mint another one while its gem is awaiting attachment.
      if (pendingGemRecovery) {
        return {
          ok: false,
          message: "Your plan was created, but its gem still needs to be added. Use the retry button below.",
        };
      }
      const outcome = await mintTripSlip(basics);
      if (!outcome.ok) return { ok: false, message: outcome.message };
      if (source?.newPlan && source.pendingItem) {
        const pendingItem = source.pendingItem;
        try {
          await addPendingGemToTrip(outcome.tripId, pendingItem);
        } catch (error) {
          const recovery = { tripId: outcome.tripId, item: pendingItem };
          savePendingGemRecovery(recovery);
          setPendingGemRecovery(recovery);
          return {
            ok: false,
            message:
              error instanceof Error
                ? `Your plan was created, but the gem was not added: ${error.message}`
                : "Your plan was created, but the gem was not added. Retry below; the plan will not be created again.",
          };
        }
        // Only consume the source after the item is confirmed on the newly minted plan.
        setSource((current) =>
          current?.pendingItem?.id === pendingItem.id
            ? { ...current, newPlan: false, pendingItem: undefined }
            : current,
        );
      }
      return { ok: true, tripId: outcome.tripId };
    },
    [user, openSignInModal, source, pendingGemRecovery],
  );

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
   * Run the chosen branch, AFTER the modal has committed the plan. Each branch's downstream
   * behaviour is exactly what it was when it was a chooser row — only the point it is reached
   * from moved.
   */
  const runBranch = useCallback(
    (branch: PlanningBranch, plan: CommittedPlan) => {
      // THE DOOR'S OWN FINISH first (see `PlanningSource.onFinish`). A door that handles the
      // branch takes the screen from here; the modal closes and the default rail below is not
      // run. Everything else — including every door that sets no hook — falls straight through,
      // so the four branches keep the downstream behaviour Locked Decision 33 gave them.
      if (source?.onFinish?.(branch, plan) === true) {
        setModalOpen(false);
        return;
      }
      if (branch === "ai") {
        setCommitted(plan);
        setModalOpen(false);
        // Smoke 5 item 4 (ledger `2026-10-03-smoke5-fixes`): the finish has MINTED the plan (RC-1),
        // so the traveler is on its slip from this moment — the AI form opens OVER the slip, not
        // over the page the wizard was opened from. Three smokes ended on /destinations: the form
        // only navigated after a successful draft, so closing it, or a draft that did not finish,
        // left the traveler on the door's page with a plan they could not see. No plan (a guest, a
        // refused mint) ⇒ nothing to land on, and the form opens where it always did.
        if (plan.tripId) setLocation(`/plans/${plan.tripId}`);
        setAiOpen(true);
        return;
      }
      setModalOpen(false);
      if (branch === "myself") {
        // `mintPlan` already refused (and said so in the modal) if no slip could exist, so a
        // finish that reaches here without an id has nothing to navigate to.
        if (plan.tripId) setLocation(`/plans/${plan.tripId}`);
        return;
      }
      if (branch === "local") {
        // D15 (lane L22): a plan started FROM an expert ends back at that expert, rather than in
        // a browse for the person whose page the traveler was already on. Addressed by HANDLE
        // (Locked Decision 40) through `earnerProfilePath`, the ONE resolver of an earner's
        // public path — a second `/s/${handle}` written here is the drift class §18 rule 1 names.
        // §13: only the `expert` kind is read; a door that named nothing, or named a `service`
        // (whose finish D15 rules but this lane does not build), falls through to exactly the
        // browse this branch has always shown.
        // The minted plan rides back with it (`withPlanTripId`): the storefront's booking panel
        // reads `?tripId=` to offer "Share my plan", so arriving without it would hand the
        // traveler "Start a plan" for the plan they just made.
        if (source?.returnTo?.kind === "expert") {
          const path = earnerProfilePath({ handle: source.returnTo.handle });
          if (path) {
            setLocation(withPlanTripId(path, plan.tripId));
            return;
          }
        }
        /**
         * D5: FORWARD THE TRIP. The finish has just minted one (`BRANCHES_THAT_MINT`), and
         * `/experts` already reads `?tripId=` and carries it into each expert's detail page, where
         * `POST /api/expert-booking-requests` REQUIRES it. Without it that CTA re-opens this modal
         * — the traveler is returned to the step they just finished, which is the loop D5 exists to
         * close (`docs/briefs/EXPERT_HANDOFF_IS_A_LOOP.md`).
         *
         * §13: the id is appended only when there IS one. A mint the traveler refused at the
         * sign-in gate, or one that failed, leaves `plan.tripId` empty and this falls back to
         * exactly the browse this branch has always shown rather than sending `tripId=undefined`.
         */
        // THE EXPERT DOOR (ledger `2026-09-29-expert-door`; decision-maker dispatch Sep 29, 2026):
        // with a plan minted, the finish lands on the SLIP, which opens with "How much help do you
        // want?" and a picker of the experts who offer that level in the plan's market — the
        // request then rides the storefront rail with this plan attached (LD 32). The browse below
        // stays only for a finish that minted nothing (§13 — no plan, nothing to land on).
        if (plan.tripId) {
          setLocation(expertDoorHref(plan.tripId));
          return;
        }
        const dest = plan.destination || sourceDestination(source);
        setLocation(buildExpertsBrowseHref({ destination: dest, tripId: plan.tripId }));
        return;
      }
      void startMembershipCheckout({
        planKey: "plus_annual",
        onSignInRequired: () =>
          openSignInModal({
            title: "Sign in to join Plus",
            description: "Sign in to continue to secure checkout.",
            returnTo: "/pricing",
          }),
        onNotice: (notice) => toast(notice),
      });
    },
    [setLocation, source, openSignInModal, toast],
  );

  const continueHref = tripCtx.tripId
    ? planningRouteForTrip(tripCtx.tripId, tripCtx.endDate)
    : null;
  const continueLabel = tripCtx.tripId
    ? `Continue ${tripCtx.title || (tripCtx.destination ? `your ${tripCtx.destination.split(",")[0]} trip` : "your trip")}`
    : null;

  const api = useMemo(() => ({ open, close }), [open, close]);

  /**
   * The finish's CTAs. A `source.branch` deep-open narrows it to the one the door already chose;
   * otherwise the three ways to build, plus the Plus occasion row when — and only when — sales are
   * on. Hidden, never teased.
   */
  const branches = useMemo<PlanningBranch[]>(() => {
    if (source?.branch) return [source.branch];
    return plusSalesEnabled ? [...DEFAULT_BRANCHES, "occasion"] : DEFAULT_BRANCHES;
  }, [source, plusSalesEnabled]);

  const initialDestination = useMemo(() => {
    const dest = committed?.destination || sourceDestination(source);
    if (!dest) return null;
    const [city, ...rest] = dest.split(",");
    return { city: city.trim(), country: rest.join(",").trim(), cityId: null };
  }, [source, committed]);

  return (
    <PlanningContext.Provider value={api}>
      {children}

      <PlanModal
        open={modalOpen}
        onOpenChange={(v) => (v ? setModalOpen(true) : close())}
        source={source}
        branches={branches}
        // The door's own answer, forwarded verbatim — never derived from `user.role` here (see the
        // field's note on `PlanningSource`).
        authoring={source?.authoring === true}
        continueHref={continueHref}
        continueLabel={continueLabel}
        onContinue={(href) => setLocation(href)}
        mintPlan={mintPlan}
        pendingGemRetry={pendingGemRecovery ? { title: pendingGemRecovery.item.title } : null}
        retryPendingGem={retryPendingGem}
        onPendingGemRecovered={finishPendingGemRecovery}
        onFinish={runBranch}
      />

      {aiOpen && (
        <EnhancedPlanningModal
          isOpen={aiOpen}
          onClose={() => setAiOpen(false)}
          initialDestination={initialDestination}
          initialExperienceType={source?.experienceType}
          // What the traveler just told the plan modal (ledger `2026-09-04-one-modal-many-doors`).
          // Since ledger `2026-09-04-golf-occasion-and-housekeeping` these are the AI form's ONLY
          // source for the four basics — its duplicate destination/date/occasion/party fields are
          // gone, and it shows a read-only summary of exactly what is passed here.
          initialStartDate={committed?.startDate}
          initialEndDate={committed?.endDate}
          initialTravelers={committed?.travelers}
          // RC-1 (ledger `2026-09-24-rc1-finish-mints`): the finish MINTED this plan before it
          // opened the AI form (`ai` is in `BRANCHES_THAT_MINT`), so the free draft is written INTO
          // it — onto an empty slip, which is the only place LD 41 (b) lets the free draft run.
          // Absent (a guest, or a mint that was refused) ⇒ the form keeps its old behaviour and
          // the server mints on a successful generation, exactly as before.
          tripId={committed?.tripId}
          momentKey={source?.momentKey}
          userId={user?.id || ""}
          // "change" on that summary. THE OPENER IS THE OPENER: this closes the AI form and calls
          // the same `open(source)` every door on the site calls, so the traveler lands back in
          // THE plan modal — not a second one — with the SAME door context it was opened with.
          // Which step it opens on is `resolvePlanSteps`' answer and is not restated here: by this
          // point the plan holds an occasion, so it re-opens at step 2 (Where), the first basic.
          onChangeBasics={() => {
            setAiOpen(false);
            open(source ?? undefined);
          }}
        />
      )}
    </PlanningContext.Provider>
  );
}
