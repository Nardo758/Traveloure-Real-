import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Calendar, CalendarDays, Users, ShoppingCart, Lock, Heart } from "lucide-react";
import { useTripContext } from "@/lib/trip-context";
import { planningRouteForTrip, usePlanning } from "@/contexts/PlanningContext";
import { classify, eventCountLabel, partyCountLabel, partyCountOnly, partyCompositionLabel, START_PLAN_LABEL } from "@/lib/plan-vocabulary";
import {
  GUEST_PLAN_HREF,
  headerDatesLine,
  headerPlanLabel,
  type HeaderDatesTarget,
  type HeaderPlanState,
} from "@/lib/header-plan";
import { HeaderDatesPopover } from "@/components/HeaderDatesPopover";
// Ledger 2026-09-04-which-event-picker: "the events of THIS plan" now has ONE definition, shared
// with the picker that writes the link. The strip filtered inline before that module existed; two
// copies of the same filter is the drift class §18 rule 1 names.
import { eventsForTrip } from "@/lib/which-event";
import { findOccasionByKey } from "@shared/occasions";
import type { ExperienceType, UserExperience } from "@shared/schema";

/**
 * TripStrip — the ratified Option A global trip bar (Trip-Strip program P3), and since the cut-list
 * #1 header fix v2 (decision-maker Leon Dixon, Nov 11, 2026: "if we have the trip Strip, then the
 * Sticky header is redundant") THE ONE PLAN SURFACE in the chrome. Ruling 1 (Nov 10) moved "Start a
 * plan" out of the nav into "a sticky header showing the live plan"; slices A/B read that as the nav
 * itself and put a truncated chip in it. The chip is gone. This strip now:
 *
 * - is STICKY directly under the nav (`top: var(--chrome-nav-h)`, the one variable the nav's height
 *   and this offset both read, so the two cannot drift);
 * - renders for a GUEST with a plan and for a signed-in member, from the ONE plan state the layout
 *   computes once (`headerPlanState` over `useActivePlan`'s rule — `?tripId=`, then the pen, then the
 *   most recently updated un-finalized plan) and passes down. No second fetch: the guest read stays
 *   gated on the presence cookie in the layout;
 * - prints the approved label "Your {city} plan · {n}" / "Your plan · {n}" (`headerPlanLabel`, the one
 *   formatter) as THE link to the plan — `/plans/new` for a guest, the date-derived planning route for
 *   a member — and beside it the dates, or "Add dates", opening the ONE dates panel (slice B's
 *   `HeaderDatesPopover`). A 0-stop plan reads "Start a plan" linking to that plan (reopen, never a
 *   second plan). The label is never truncated: the strip has the row.
 * - keeps: party · events · THE cart chip (the site's single cart display, LD 39) · Edit (the one plan
 *   modal, signed-in and bound only). "Continue planning ›" is retired — the label is the link.
 * - Edit-locked on /checkout, /payment, /booking/confirmation: the lock hides Edit, the label link and
 *   the dates popover alike (the label stays as text).
 * - A pen with no plan state yet (mid-intake, or a list still loading) keeps the pre-v2 lead,
 *   destination and dates chips exactly as before.
 * - Browse never writes: this component only displays; writes happen through the ONE plan modal
 *   (usePlanning().open, ledger `2026-09-04-one-modal-many-doors`), the dates panel's own rails, or
 *   explicit page actions.
 */

// Chrome earn grammar (ruling 2026-08-28-chrome-alignment): mono for eyebrow/counts,
// Inter (the app default) for the trip name and buttons. Shell restyle only — every
// data source, testid and handler below is unchanged.
const STRIP_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const LOCKED_PREFIXES = ["/checkout", "/payment", "/booking/confirmation"];

// Ledger 2026-09-03-plan-vocabulary: `classify` and its keyword lists MOVED to
// client/src/lib/plan-vocabulary.ts verbatim, so the occasion vocabulary is written once
// (§18 rule 1) beside the universal action labels the add surfaces use. This strip is still
// its only consumer; the point is that a second copy can no longer be written by accident.

function formatDate(ymd?: string): string {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const START_STATE: HeaderPlanState = { kind: "start" };

export function TripStrip({
  planState = START_STATE,
  datesTarget = null,
  signedIn = false,
}: {
  /** The ONE plan state the layout computed (`headerPlanState`); absent ⇒ the pre-v2 context-only strip. */
  planState?: HeaderPlanState;
  /** The plan the dates segment re-dates (slice B); null ⇒ the dates line is text. */
  datesTarget?: HeaderDatesTarget | null;
  signedIn?: boolean;
} = {}) {
  const [ctx] = useTripContext();
  const [location] = useLocation();
  // "Edit ›" is a DOOR of the one planning modal, not a dialog this strip mounts. The modal opens
  // at step 1 or step 2 depending on whether the plan already names an occasion, with every
  // visible step reachable from its rail (`resolvePlanSteps`; CLAUDE.md Locked Decision 33).
  const { open: openPlanModal } = usePlanning();

  const { data: cart } = useQuery<{ itemCount: number; total: string; amountDue?: string }>({
    queryKey: ["/api/cart"],
    staleTime: 30_000,
  });

  /**
   * The chosen occasion's ROW (ledger `2026-09-03-switch-readers`) — the same
   * `GET /api/experience-types` query key the edit panel and IntakePanel use, so this costs the
   * cache lookup and not a second fetch, and the three surfaces can never see different rows.
   * Fetched only once an occasion has actually been chosen: a browser with no occasion in context
   * has nothing to look up, and the strip must not add a request to every marketing page.
   */
  const { data: occasions, isLoading: occasionsLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    enabled: !!(ctx.experienceSlug || ctx.experienceType),
  });
  /**
   * QA check 3 — has the occasion lookup SETTLED? A disabled query (no occasion in context) is
   * not loading: there is nothing to wait for, so the strip is resolved on nothing and renders
   * exactly what it always did. A background refetch over cached rows is not loading either.
   * `isLoading` is the only state that means "a request is in flight and the row may still
   * change", and it is the one state in which no noun may be printed (see `partyLabel` below).
   */
  const occasionResolved = !occasionsLoading;

  /**
   * THE PLAN'S EVENTS (migration 277; ledger `2026-09-04-slip-events`, CLAUDE.md entry 29). An
   * event inside a plan is a `user_experiences` row bound by `trip_id` — the same rows the slip's
   * guest-list surface already reads, on the SAME `/api/user-experiences` query key, so this
   * costs a cache lookup rather than a second fetch and the two surfaces can never disagree on
   * how many events a plan has. NO new route and no new DTO field: the strip has no plancard
   * fetch of its own (that DTO is trip-gated and far heavier than a chrome bar should pull), so
   * the user-scoped list it shares with the slip is the reuse, not a parallel rail.
   *
   * Fetched only once the context carries a real `tripId` — a browser mid-intake has no plan to
   * count events on, and the strip must not add a request to every marketing page.
   */
  const { data: planEvents } = useQuery<UserExperience[]>({
    queryKey: ["/api/user-experiences"],
    enabled: !!ctx.tripId,
    staleTime: 30_000,
  });

  // RC-9 (ledger 2026-09-26-rc9-external-cart-lines): partner lines are server cart rows now, so
  // the server's own count and total are the whole answer — there is no sessionStorage side-cart
  // to add in. (A partner line carries no price, so it counts as an item and adds nothing to the
  // total, which is the server's statement and not a $0 claim about the partner's price.)
  const cartCount = cart?.itemCount || 0;
  const cartTotal = parseFloat(cart?.amountDue ?? cart?.total ?? "0");

  const hasContext = Object.keys(ctx).some(
    (k) => ["destination", "startDate", "endDate", "travelers", "experienceType", "tripId"].includes(k) && (ctx as any)[k],
  );
  // Visibility rule: a trip is in progress when any detail is set OR the cart has items — or (v2)
  // when the ONE plan state names a plan, which is how a guest with a saved plan sees the strip.
  const showsPlan = planState.kind !== "start";
  if (!hasContext && cartCount === 0 && !showsPlan) return null;

  const vocab = classify(ctx.experienceType);
  const locked = LOCKED_PREFIXES.some((p) => location.startsWith(p));

  const destination = ctx.destination || ctx.city || "";
  // A3 (docs/briefs/04): invite-aware Event-class variant — a context born from a
  // guest invite (origin === "guest_invite", first-touch A2) with an Event-class
  // vocabulary shows the invite's event framing. Graceful fallback: no event
  // title carried → the generic strip, never a fabricated placeholder (§13).
  const inviteAware = ctx.origin === "guest_invite" && vocab === "event" && !!ctx.title;
  // Ledger 2026-09-03-slip-convergence. At >=sm the coral eyebrow above already reads
  // "Your Trip" (one of the three ratified coral touches, ruling 2026-08-28-chrome-alignment —
  // it stays), and the TRAVEL-class lead is the literal "Your trip", so the strip printed the
  // same two words twice, side by side. Suppress the redundant lead TEXT at exactly the
  // breakpoint where the eyebrow appears (`hidden sm:inline` there => `sm:hidden` here); mobile,
  // where the eyebrow is hidden, still shows the lead, and the pin icon and destination chip are
  // untouched at every width. ONLY the travel class duplicates: the event/couple leads are
  // composed ("Your Kyoto wedding") and the invite-aware lead carries the event's own title, so
  // neither is touched.
  const leadDuplicatesEyebrow = !inviteAware && vocab === "travel";
  const lead = inviteAware
    ? `You're planning for ${ctx.title}`
    : vocab === "travel"
      ? "Your trip"
      : destination
        ? `Your ${destination.split(",")[0]} ${(ctx.experienceType || "").toLowerCase()}`.trim()
        : `Your ${(ctx.experienceType || "trip").toLowerCase()}`;

  // Honest-or-absent (§13): render the party fragment only for a real traveler count the user
  // actually entered — never an invented "2".
  const hasTravelers = typeof ctx.travelers === "number" && ctx.travelers > 0;
  /**
   * THE PARTY NOUN COMES FROM THE OCCASION ROW WHEN THE ROW HAS ONE (migration 276's
   * `vocabulary`; ledger `2026-09-03-switch-readers`). The class-based wording below is a
   * different question — a class answers "how do we headline this occasion", the column answers
   * "what are these people called" — and until this lane the strip only had the class to go on.
   *
   * §13: a row that is absent (a free-text or legacy `experienceType` that matches nothing) or
   * whose `vocabulary` is NULL is NOT SET, so the strip falls back to EXACTLY the class-based
   * label it has always rendered — the plain-plan shape here, not a fabricated "travelers" that
   * would silently demote every couple-class plan from "Party of 2".
   */
  const occasionRow = findOccasionByKey(occasions, ctx.experienceSlug || ctx.experienceType);
  const rowPartyLabel = occasionRow?.vocabulary
    ? partyCountLabel(ctx.travelers, occasionRow.vocabulary, occasionRow.defaultGuests)
    : "";
  /**
   * ── AND THE FALLBACK WAITS FOR THE ROW (QA check 3, post-publish walkthrough) ────────────────
   * Everything above is the settled answer and is unchanged. What was missing is the THIRD state:
   * while `GET /api/experience-types` is still in flight `occasionRow` is undefined for the same
   * reason an unmatched slug is — and this chip could not tell them apart, so it printed the
   * class-based wording as though the row had answered and then swapped words underneath the
   * reader. The count alone is honest in that window (`partyCountOnly`, the SAME helper the slip's
   * meta line uses — one answer to "what do we show while we do not know yet", §18 rule 1); the
   * class fallback is right only once the row's absence is a FINISHED fact.
   */
  // R4-4 (round 4; R3-22 completed): the party as the traveler stated it — "2 adults" / "2 adults, 1 child" — through
  // the ONE helper, ahead of any count wording; the count labels below remain only where the pair was never stated.
  const composition = partyCompositionLabel(ctx.adults, ctx.kids);
  const partyLabel = composition
    ? composition
    : !hasTravelers
    ? ""
    : !occasionResolved
      ? partyCountOnly(ctx.travelers)
      : rowPartyLabel ||
        (vocab === "event"
          ? `${ctx.travelers} guests`
          : vocab === "couple"
            ? `Party of ${ctx.travelers}`
            : `${ctx.travelers} traveler${ctx.travelers === 1 ? "" : "s"}`);

  /**
   * "3 events" — hidden at zero, and hidden while unknown (§13). A plan with no
   * `user_experiences` row has only its ONE implicit unnamed event, which is not a row and is
   * never counted as one, so the chip does not render; and a list that never loaded (an
   * unauthenticated strip, a failed fetch) leaves `planEvents` undefined, which reads as the
   * same absence — the strip says nothing rather than claiming a count it does not have. The
   * noun comes from `eventCountLabel` in plan-vocabulary.ts, the one home of the platform's
   * presentation nouns, never spelled out here.
   */
  const eventCount = eventsForTrip(planEvents, ctx.tripId).length;
  const eventLabel = eventCountLabel(eventCount);

  const singleDay = ctx.startDate && ctx.startDate === ctx.endDate;
  const dateLabel = ctx.startDate
    ? singleDay
      ? formatDate(ctx.startDate)
      : `${formatDate(ctx.startDate)}${ctx.endDate ? ` → ${formatDate(ctx.endDate)}` : ""}`
    : "";

  // ── v2: the plan label is THE link to the plan ─────────────────────────────────────────────────
  // A guest's plan lives at /plans/new (a `ProtectedRoute` would wall them off `/plans/{id}`); a
  // member's follows the date-derived route (ruling 2: a plan whose end has passed lands on /trip/:id).
  const planHref = showsPlan
    ? planState.guest
      ? GUEST_PLAN_HREF
      : planningRouteForTrip(planState.planId, (datesTarget?.endDate ?? (ctx.tripId === planState.planId ? ctx.endDate : undefined)) || undefined)
    : ctx.tripId
      ? planningRouteForTrip(ctx.tripId, ctx.endDate)
      : null;
  const planLabel = planState.kind === "chip" ? headerPlanLabel(planState) : planState.kind === "resume" ? START_PLAN_LABEL : null;
  const datesLine = headerDatesLine(planState);

  const labelClass = "inline-flex items-center gap-1.5 font-semibold shrink-0";
  const linkable = !locked && !!planHref;

  return (
    <div
      className="sticky z-40 w-full border-b"
      style={{ top: "var(--chrome-nav-h)", background: "var(--earn-ground)", borderColor: "var(--earn-border)" }}
      data-testid="trip-strip"
      data-plan-state={planState.kind}
    >
      <div className="container mx-auto min-h-[44px] px-4 py-1.5 flex items-center gap-2 flex-wrap text-sm">
        {showsPlan && planLabel ? (
          <>
            {/* The approved label, never truncated. A link unless the payment lock is on. */}
            {linkable ? (
              <Link href={planHref!} className={`${labelClass} hover:underline underline-offset-2`} style={{ color: "var(--earn-ink)" }} data-testid="trip-strip-plan-link">
                <MapPin className="w-3.5 h-3.5 text-[color:var(--earn-muted)]" />
                <span data-testid="trip-strip-plan-label">{planLabel}</span>
              </Link>
            ) : (
              <span className={labelClass} style={{ color: "var(--earn-ink)" }}>
                <MapPin className="w-3.5 h-3.5 text-[color:var(--earn-muted)]" />
                <span data-testid="trip-strip-plan-label">{planLabel}</span>
              </span>
            )}
            {datesLine && (
              <>
                <span className="shrink-0" aria-hidden="true" style={{ color: "var(--earn-faint)" }}>
                  ·
                </span>
                {datesTarget && !locked ? (
                  <HeaderDatesPopover target={datesTarget} variant="desktop">
                    <button
                      type="button"
                      className="shrink-0 text-xs underline-offset-2 hover:underline"
                      style={{ fontFamily: STRIP_MONO, color: "var(--earn-teal-ink)" }}
                      data-testid="trip-strip-plan-dates"
                    >
                      {datesLine}
                    </button>
                  </HeaderDatesPopover>
                ) : (
                  <span className="shrink-0 text-xs" style={{ fontFamily: STRIP_MONO, color: "var(--earn-muted)" }} data-testid="trip-strip-plan-dates">
                    {datesLine}
                  </span>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* Ruling 2026-08-28-chrome-alignment: the strip's eyebrow is one of the chrome's
                three ratified coral touches (Sign In, BETA pill, this). Pre-v2 branch: a pen with no
                plan state yet. */}
            <span
              className="hidden sm:inline text-[10px] font-medium uppercase tracking-[0.12em] shrink-0"
              style={{ fontFamily: STRIP_MONO, color: "var(--earn-coral-ink)" }}
              aria-hidden="true"
            >
              Your Trip
            </span>
            {(() => {
              const leadBody = (
                <>
                  {inviteAware ? (
                    <Heart className="w-3.5 h-3.5 text-[color:var(--earn-teal-ink)]" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5 text-[color:var(--earn-muted)]" />
                  )}
                  {/* no `capitalize` on the invite lead — the event title keeps its own casing */}
                  <span
                    className={`${inviteAware ? "" : "capitalize"}${leadDuplicatesEyebrow ? " sm:hidden" : ""}`.trim() || undefined}
                    data-testid="trip-strip-lead-text"
                  >
                    {lead}
                  </span>
                </>
              );
              // A bound pen whose plan state has not resolved still links to its plan (the lead is
              // the link, as the label is in the resolved branch).
              return linkable ? (
                <Link
                  href={planHref!}
                  className={`${labelClass} hover:underline underline-offset-2`}
                  style={{ color: "var(--earn-ink)" }}
                  data-testid="trip-strip-plan-link"
                  data-invite-aware={inviteAware ? "true" : undefined}
                >
                  <span className="inline-flex items-center gap-1.5" data-testid="trip-strip-lead">{leadBody}</span>
                </Link>
              ) : (
                <span
                  className={labelClass}
                  style={{ color: "var(--earn-ink)" }}
                  data-testid="trip-strip-lead"
                  data-invite-aware={inviteAware ? "true" : undefined}
                >
                  {leadBody}
                </span>
              );
            })()}

            {destination && vocab === "travel" && (
              <span
                className="inline-flex items-center rounded-full border px-3 py-0.5 text-xs"
                style={{ fontFamily: STRIP_MONO, background: "var(--earn-chip)", borderColor: "var(--earn-border)", color: "var(--earn-ink)" }}
                data-testid="trip-strip-destination"
              >
                {destination}
              </span>
            )}

            {dateLabel && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs"
                style={{ fontFamily: STRIP_MONO, background: "var(--earn-chip)", borderColor: "var(--earn-border)", color: "var(--earn-muted)" }}
                data-testid="trip-strip-dates"
              >
                <Calendar className="w-3 h-3 text-[color:var(--earn-faint)]" />
                {dateLabel}
              </span>
            )}
          </>
        )}

        {hasTravelers && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs"
            style={{ fontFamily: STRIP_MONO, background: "var(--earn-chip)", borderColor: "var(--earn-border)", color: "var(--earn-muted)" }}
            data-testid="trip-strip-party"
          >
            <Users className="w-3 h-3 text-[color:var(--earn-faint)]" />
            {partyLabel}
          </span>
        )}

        {eventLabel && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs"
            style={{ fontFamily: STRIP_MONO, background: "var(--earn-chip)", borderColor: "var(--earn-border)", color: "var(--earn-muted)" }}
            data-testid="trip-strip-events"
          >
            <CalendarDays className="w-3 h-3 text-[color:var(--earn-faint)]" />
            {eventLabel}
          </span>
        )}

        {cartCount > 0 && (
          <Link
            href="/cart"
            className="inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs font-semibold hover:bg-[color:var(--earn-teal-wash)] transition-colors"
            style={{ fontFamily: STRIP_MONO, background: "var(--earn-chip)", borderColor: "var(--earn-teal)" }}
            data-testid="trip-strip-cart"
          >
            <ShoppingCart className="w-3 h-3 text-[color:var(--earn-teal)]" />
            <span style={{ color: "var(--earn-ink)" }}>{cartCount}</span>
            <span aria-hidden="true" style={{ color: "var(--earn-faint)" }}>·</span>
            <span style={{ color: "var(--earn-teal-ink)" }}>
              ${cartTotal.toLocaleString(undefined, {
                minimumFractionDigits: Number.isInteger(cartTotal) ? 0 : 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </Link>
        )}

        <span className="ml-auto shrink-0">
          {locked ? (
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{ fontFamily: STRIP_MONO, color: "var(--earn-muted)" }}
              data-testid="trip-strip-locked"
            >
              <Lock className="w-3 h-3" /> locked during payment
            </span>
          ) : ctx.tripId ? (
            /*
             * EDIT opens the ONE plan modal on the plan already bound, so the five questions
             * (occasion, where, when, who, what's happening) can be CORRECTED without leaving the
             * page — Locked Decision 33's "Trip Strip's Edit" door. Signed-in only: a guest's plan has
             * no modal binding (its edits live on /plans/new). "Continue planning ›" is retired by the
             * header fix v2 — the plan label above is the link to the plan's own surface.
             *
             * The modal needs NO source here: `resolvePlanSteps` reads the held trip context, so a plan
             * that already names its occasion opens at step 2 under the pill and one that does not
             * opens at step 1. That decision stays in the one door table (§18 rule 1).
             */
            signedIn ? (
              <button
                type="button"
                onClick={() => openPlanModal({ door: "trip_strip_edit" })}
                className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-[color:var(--earn-border)] text-[color:var(--earn-navy)] hover:bg-[color:var(--earn-chip)]"
                data-testid="trip-strip-edit-plan"
              >
                Edit
              </button>
            ) : null
          ) : hasContext ? (
            <button
              type="button"
              onClick={() => openPlanModal({ door: "trip_strip_edit" })}
              className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-[color:var(--earn-navy)] text-[color:var(--earn-navy)] hover:bg-[color:var(--earn-navy)] hover:text-white"
              data-testid="trip-strip-edit"
            >
              Edit ›
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
