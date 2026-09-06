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
 *   - occasion→ /plus/occasions — offered ONLY when PLUS_SALES_ENABLED (public flag on
 *               /api/pricing); hidden, never teased, when off.
 * Returning users with an active trip still get "Continue {trip name}", which goes to the
 * PLANNING surface (/plans/:tripId), never the details card.
 *
 * Auth: unchanged. The modal itself is open to guests; branches prompt at their EXISTING gates.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Context,
} from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { updateTripContext, useTripContext } from "@/lib/trip-context";
import { mintTripSlip } from "@/lib/trip-slip";
import EnhancedPlanningModal from "@/components/EnhancedPlanningModal";
import { PlanModal, type CommittedPlan, type PlanMintOutcome } from "@/components/trip/plan-modal";

export type PlanningBranch = "myself" | "ai" | "local" | "occasion";

export interface PlanningSource {
  /** City/destination context from the opener (ticker city, city page, trip re-plan). */
  city?: string;
  country?: string;
  destination?: string;
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
}

interface PlanningApi {
  open: (source?: PlanningSource) => void;
  close: () => void;
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
  const [tripCtx] = useTripContext();
  const [, setLocation] = useLocation();

  const [modalOpen, setModalOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [source, setSource] = useState<PlanningSource | null>(null);
  /** The plan as the modal committed it — what the AI branch is handed instead of asking again. */
  const [committed, setCommitted] = useState<CommittedPlan | null>(null);

  // PLUS_SALES_ENABLED rides the public pricing bundle (§8 posture — no literals here).
  const { data: pricing } = useQuery<{ plusSalesEnabled?: boolean }>({
    queryKey: ["/api/pricing"],
    staleTime: 5 * 60_000,
  });
  const plusSalesEnabled = pricing?.plusSalesEnabled === true;

  const open = useCallback((src?: PlanningSource) => {
    const next = src ?? null;
    setSource(next);
    setCommitted(null);
    // The door already named the occasion — record it on the planning context so every
    // downstream surface reads the same slug. Additive merge, never a switch: this does not
    // touch trip identity.
    if (next?.experienceSlug) updateTripContext({ experienceSlug: next.experienceSlug });
    setModalOpen(true);
  }, []);

  const close = useCallback(() => {
    setModalOpen(false);
    setAiOpen(false);
  }, []);

  /**
   * THE ONE MINT DOOR, reached from the modal's "Build it myself" finish.
   *
   * The destination/date checks and the mint body both live in `@/lib/trip-slip` — `mintTripSlip`
   * is THE traveler-owned client mint door, shared with the template page's expert-request
   * precondition (Locked Decision 32 lane (a)). Duplicating either here is the derivation-drift
   * class §18 rule 1 names; in particular the §13 "dates are asked for, never invented" rule must
   * have exactly one author. `mintTripSlip` refuses before it calls the server, so a short answer
   * still costs no request.
   *
   * The sign-in gate is checked HERE and before the mint, because it is the slip ROUTE's gate
   * (/plans/:tripId is a ProtectedRoute) and it belongs to this branch, not to the modal. A guest
   * gets the sign-in modal and a refusal carrying NO message — the screen has already changed
   * hands, so the plan modal must not also print an error into a dialog it just closed.
   */
  const mintPlan = useCallback(
    async (basics: {
      destination?: string;
      startDate?: string;
      endDate?: string;
      title?: string;
    }): Promise<PlanMintOutcome> => {
      if (!user) {
        setModalOpen(false);
        openSignInModal();
        return { ok: false };
      }
      const outcome = await mintTripSlip(basics);
      if (!outcome.ok) return { ok: false, message: outcome.message };
      return { ok: true, tripId: outcome.tripId };
    },
    [user, openSignInModal],
  );

  /**
   * Run the chosen branch, AFTER the modal has committed the plan. Each branch's downstream
   * behaviour is exactly what it was when it was a chooser row — only the point it is reached
   * from moved.
   */
  const runBranch = useCallback(
    (branch: PlanningBranch, plan: CommittedPlan) => {
      if (branch === "ai") {
        setCommitted(plan);
        setModalOpen(false);
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
        const dest = plan.destination || sourceDestination(source);
        setLocation(dest ? `/experts?destination=${encodeURIComponent(dest)}` : "/experts");
        return;
      }
      setLocation("/plus/occasions");
    },
    [setLocation, source],
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
