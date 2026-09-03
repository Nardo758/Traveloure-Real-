import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Calendar, Users, ShoppingCart, Lock, Heart } from "lucide-react";
import { useTripContext } from "@/lib/trip-context";
import { EditTripPanel } from "@/components/trip/edit-trip-panel";
import { planningRouteForTrip } from "@/contexts/PlanningContext";

/**
 * TripStrip — the ratified Option A global trip bar (Trip-Strip program P3).
 * One mount in the traveler Layout; renders only when a trip is in progress
 * (any context field set OR items in cart). Owns ALL trip state display:
 * destination · dates · party · THE cart chip (the site's single cart display).
 *
 * Rules (spec of record = the ratified page-by-page mockup):
 * - Vocabulary classes: Travel / Event / Couple, keyed off experienceType.
 * - Server-truth mode: once tripId exists, Edit links to the trip page.
 * - Edit-locked on /checkout, /payment, /booking/confirmation.
 * - "Continue planning ›" label on marketing pages.
 * - Browse never writes: this component only displays; writes happen through
 *   the EditTripPanel or explicit page actions.
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

type VocabClass = "travel" | "event" | "couple";

const EVENT_KEYWORDS = ["wedding", "birthday", "corporate", "party", "reunion", "shower", "graduation", "retirement", "farewell", "housewarming", "achievement", "holiday", "bachelor", "engagement", "retreat"];
const COUPLE_KEYWORDS = ["proposal", "date night", "date-night", "anniversar", "honeymoon"];

function classify(experienceType?: string): VocabClass {
  const t = (experienceType || "").toLowerCase();
  if (COUPLE_KEYWORDS.some((k) => t.includes(k))) return "couple";
  if (EVENT_KEYWORDS.some((k) => t.includes(k))) return "event";
  return "travel";
}

function formatDate(ymd?: string): string {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TripStrip() {
  const [ctx] = useTripContext();
  const [location] = useLocation();
  const [editOpen, setEditOpen] = useState(false);

  const { data: cart } = useQuery<{ itemCount: number; total: string }>({
    queryKey: ["/api/cart"],
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
  const partyLabel = hasTravelers
    ? vocab === "event"
      ? `${ctx.travelers} guests`
      : vocab === "couple"
        ? `Party of ${ctx.travelers}`
        : `${ctx.travelers} traveler${ctx.travelers === 1 ? "" : "s"}`
    : "";

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
            /* Ruling 2026-08-28-single-planning-entry: mid-planning continues on the
               PLANNING surface (/plans/:tripId, the canonical slip), never the details
               card; only a trip whose end date has passed lands on /trip/:id. Phase
               derives from dates per ruling 2 (trips.status is dead). */
            <Link
              href={planningRouteForTrip(ctx.tripId, ctx.endDate)}
              className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-[color:var(--earn-navy)] text-[color:var(--earn-navy)] hover:bg-[color:var(--earn-navy)] hover:text-white"
              data-testid="trip-strip-edit"
            >
              {marketing ? "Continue planning ›" : "Edit trip ›"}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors border-[color:var(--earn-navy)] text-[color:var(--earn-navy)] hover:bg-[color:var(--earn-navy)] hover:text-white"
              data-testid="trip-strip-edit"
            >
              {marketing ? "Continue planning ›" : "Edit ›"}
            </button>
          )}
        </span>
      </div>
      <EditTripPanel open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
