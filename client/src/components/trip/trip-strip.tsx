import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Calendar, Users, ShoppingCart, Lock } from "lucide-react";
import { useTripContext } from "@/lib/trip-context";
import { EditTripPanel } from "@/components/trip/edit-trip-panel";

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
  const lead =
    vocab === "travel"
      ? "Your trip"
      : destination
        ? `Your ${destination.split(",")[0]} ${(ctx.experienceType || "").toLowerCase()}`.trim()
        : `Your ${(ctx.experienceType || "trip").toLowerCase()}`;

  const partyLabel =
    vocab === "event"
      ? `${ctx.travelers || 2} guests`
      : vocab === "couple"
        ? `Party of ${ctx.travelers || 2}`
        : `${ctx.travelers || 2} traveler${(ctx.travelers || 2) === 1 ? "" : "s"}`;

  const singleDay = ctx.startDate && ctx.startDate === ctx.endDate;
  const dateLabel = ctx.startDate
    ? singleDay
      ? formatDate(ctx.startDate)
      : `${formatDate(ctx.startDate)}${ctx.endDate ? ` → ${formatDate(ctx.endDate)}` : ""}`
    : "";

  return (
    <div
      className="w-full border-b border-primary/15 bg-primary/[0.04]"
      data-testid="trip-strip"
    >
      <div className="container mx-auto px-4 py-1.5 flex items-center gap-2 flex-wrap text-sm">
        <span className="flex items-center gap-1.5 font-semibold shrink-0" data-testid="trip-strip-lead">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <span className="capitalize">{lead}</span>
        </span>

        {destination && vocab === "travel" && (
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-background px-3 py-0.5 text-xs font-medium" data-testid="trip-strip-destination">
            {destination}
          </span>
        )}

        {dateLabel && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-background px-3 py-0.5 text-xs" data-testid="trip-strip-dates">
            <Calendar className="w-3 h-3 text-muted-foreground" />
            {dateLabel}
          </span>
        )}

        {(ctx.travelers || vocab !== "travel") && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-background px-3 py-0.5 text-xs" data-testid="trip-strip-party">
            <Users className="w-3 h-3 text-muted-foreground" />
            {partyLabel}
          </span>
        )}

        {cartCount > 0 && (
          <Link
            href="/cart"
            className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-background px-3 py-0.5 text-xs font-semibold hover:bg-primary/10 transition-colors"
            data-testid="trip-strip-cart"
          >
            <ShoppingCart className="w-3 h-3 text-primary" />
            {cartCount} · ${cartTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Link>
        )}

        <span className="ml-auto shrink-0">
          {locked ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="trip-strip-locked">
              <Lock className="w-3 h-3" /> locked during payment
            </span>
          ) : ctx.tripId ? (
            <Link href={`/trip/${ctx.tripId}`} className="text-xs font-semibold text-primary hover:underline" data-testid="trip-strip-edit">
              {marketing ? "Continue planning ›" : "Edit trip ›"}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="text-xs font-semibold text-primary hover:underline"
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
