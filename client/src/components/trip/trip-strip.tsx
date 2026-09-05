import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Calendar, CalendarDays, Users, ShoppingCart, Lock, Heart } from "lucide-react";
import { useTripContext } from "@/lib/trip-context";
import { planningRouteForTrip, usePlanning } from "@/contexts/PlanningContext";
import { classify, eventCountLabel, partyCountLabel } from "@/lib/plan-vocabulary";
// Ledger 2026-09-04-which-event-picker: "the events of THIS plan" now has ONE definition, shared
// with the picker that writes the link. The strip filtered inline before that module existed; two
// copies of the same filter is the drift class §18 rule 1 names.
import { eventsForTrip } from "@/lib/which-event";
import { findOccasionByKey } from "@shared/occasions";
import type { ExperienceType, UserExperience } from "@shared/schema";

/**
 * TripStrip — the ratified Option A global trip bar (Trip-Strip program P3).
 * One mount in the traveler Layout; renders only when a trip is in progress
 * (any context field set OR items in cart). Owns ALL trip state display:
 * destination · dates · party · THE cart chip (the site's single cart display).
 *
 * Rules (spec of record = the ratified page-by-page mockup):
 * - Vocabulary classes: Travel / Event / Couple, keyed off experienceType.
 * - Server-truth mode: once tripId exists the strip shows TWO controls — "Edit", which opens
 *   the one plan modal on the bound plan, and "Continue planning ›", which navigates to the
 *   plan's own surface (ledger `2026-09-04-reaudit-fixes`, the re-audit's B2; the `StripLead`
 *   artboard draws both). Before a trip exists there is nothing to continue TO, so the single
 *   control is the modal.
 * - Edit-locked on /checkout, /payment, /booking/confirmation.
 * - "Continue planning ›" label on marketing pages (the trip-less branch; the bound branch says
 *   it unconditionally, because that is what that control does everywhere).
 * - Browse never writes: this component only displays; writes happen through
 *   the ONE plan modal (usePlanning().open, ledger `2026-09-04-one-modal-many-doors`)
 *   or explicit page actions.
 */

// Chrome earn grammar (ruling 2026-08-28-chrome-alignment): mono for eyebrow/counts,
// Inter (the app default) for the trip name and buttons. Shell restyle only — every
// data source, testid and handler below is unchanged.
const STRIP_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const MARKETING_PATHS = new Set([
  "/", "/about", "/pricing", "/faq", "/how-it-works", "/features",
  "/careers", "/press", "/blog", "/help", "/support",
]);

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

export function TripStrip() {
  const [ctx] = useTripContext();
  const [location] = useLocation();
  // "Edit ›" is a DOOR of the one planning modal, not a dialog this strip mounts. The modal opens
  // at step 1 or step 2 depending on whether the plan already names an occasion, with every
  // visible step reachable from its rail (`resolvePlanSteps`; CLAUDE.md Locked Decision 33).
  const { open: openPlanModal } = usePlanning();

  const { data: cart } = useQuery<{ itemCount: number; total: string }>({
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
  const { data: occasions } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    enabled: !!(ctx.experienceSlug || ctx.experienceType),
  });

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

  // External (affiliate) items live only in sessionStorage, keyed by slug.
  const external = useMemo(() => {
    try {
      const slug = ctx.experienceSlug;
      if (!slug) return { count: 0, total: 0 };
      const stored = sessionStorage.getItem(`externalCart_${slug}`);
      const items: Array<{ price?: number; quantity?: number }> = stored ? JSON.parse(stored) : [];
      return {
        count: items.reduce((n, i) => n + (i.quantity || 1), 0),
        total: items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0),
      };
    } catch {
      return { count: 0, total: 0 };
    }
    // Re-derive whenever the context changes (slug switch or any update tick).
  }, [ctx]);

  const cartCount = (cart?.itemCount || 0) + external.count;
  const cartTotal = parseFloat(cart?.total || "0") + external.total;

  const hasContext = Object.keys(ctx).some(
    (k) => ["destination", "startDate", "endDate", "travelers", "experienceType", "tripId"].includes(k) && (ctx as any)[k],
  );
  // Visibility rule: a trip is in progress when any detail is set OR the cart has items.
  if (!hasContext && cartCount === 0) return null;

  const vocab = classify(ctx.experienceType);
  const locked = LOCKED_PREFIXES.some((p) => location.startsWith(p));
  const marketing = MARKETING_PATHS.has(location);

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
  const partyLabel = hasTravelers
    ? rowPartyLabel ||
      (vocab === "event"
        ? `${ctx.travelers} guests`
        : vocab === "couple"
          ? `Party of ${ctx.travelers}`
          : `${ctx.travelers} traveler${ctx.travelers === 1 ? "" : "s"}`)
    : "";

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

  return (
    <div
      className="w-full border-b"
      style={{ background: "var(--earn-ground)", borderColor: "var(--earn-border)" }}
      data-testid="trip-strip"
    >
      <div className="container mx-auto min-h-[44px] px-4 py-1.5 flex items-center gap-2 flex-wrap text-sm">
        {/* Ruling 2026-08-28-chrome-alignment: the strip's eyebrow is one of the chrome's
            three ratified coral touches (Sign In, BETA pill, this). */}
        <span
          className="hidden sm:inline text-[10px] font-medium uppercase tracking-[0.12em] shrink-0"
          style={{ fontFamily: STRIP_MONO, color: "var(--earn-coral-ink)" }}
          aria-hidden="true"
        >
          Your Trip
        </span>
        <span
          className="flex items-center gap-1.5 font-semibold shrink-0"
          style={{ color: "var(--earn-ink)" }}
          data-testid="trip-strip-lead"
          data-invite-aware={inviteAware ? "true" : undefined}
        >
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
        </span>

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
              ${cartTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
             * TWO CONTROLS, AS RATIFIED (ledger `2026-09-04-reaudit-fixes`, the re-audit's B2;
             * the `StripLead` artboard draws both). They answer different questions and neither
             * substitutes for the other:
             *
             *   EDIT            — opens the ONE plan modal on the plan already bound, so the five
             *                     questions (occasion, where, when, who, what's happening) can be
             *                     CORRECTED without leaving the page. Locked Decision 33's door
             *                     table has always promised this door — "the Trip Strip's Edit →
             *                     step 1 or 2 by what the plan already holds, with every visible
             *                     step reachable from the rail" — and until now the code exposed
             *                     it only in the trip-LESS branch, so the moment a plan existed
             *                     the door the ruling names disappeared.
             *   CONTINUE        — the navigation to the plan's own surface, unchanged.
             *
             * The modal needs NO source here: `resolvePlanSteps` reads the held trip context, so
             * a plan that already names its occasion opens at step 2 under the pill and one that
             * does not opens at step 1. That decision stays in the one door table; passing a
             * source from here would be a second copy of it (§18 rule 1).
             *
             * TESTIDS: the LINK keeps `trip-strip-edit` because `planning-entry.spec.ts` asserts
             * its href (the date-derived /plans vs /trip routing, ruling 2); the new button is
             * `trip-strip-edit-plan`. Renaming the link to match its new label would have moved a
             * pinned selector for a cosmetic reason.
             */
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openPlanModal()}
                className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-[color:var(--earn-border)] text-[color:var(--earn-navy)] hover:bg-[color:var(--earn-chip)]"
                data-testid="trip-strip-edit-plan"
              >
                Edit
              </button>
              {/* Ruling 2026-08-28-single-planning-entry: mid-planning continues on the
                  PLANNING surface (/plans/:tripId, the canonical slip), never the details
                  card; only a trip whose end date has passed lands on /trip/:id. Phase
                  derives from dates per ruling 2 (trips.status is dead). */}
              <Link
                href={planningRouteForTrip(ctx.tripId, ctx.endDate)}
                className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-[color:var(--earn-navy)] text-[color:var(--earn-navy)] hover:bg-[color:var(--earn-navy)] hover:text-white"
                data-testid="trip-strip-edit"
              >
                Continue planning ›
              </Link>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => openPlanModal()}
              className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-[color:var(--earn-navy)] text-[color:var(--earn-navy)] hover:bg-[color:var(--earn-navy)] hover:text-white"
              data-testid="trip-strip-edit"
            >
              {marketing ? "Continue planning ›" : "Edit ›"}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
