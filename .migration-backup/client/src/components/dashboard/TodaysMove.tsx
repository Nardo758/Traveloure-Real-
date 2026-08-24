import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, ShoppingCart, Users2, CalendarPlus } from "lucide-react";
import { addDays, startOfDay } from "date-fns";
import type { SlipData } from "@/components/plancard/SlipView";

/**
 * TodaysMove — R-H "Today's move": the SINGLE highest-urgency REAL item on the traveler's active
 * trip, priority order (a) staged-awaiting-checkout > (b) expert-reply-waiting > (c) undecided
 * days. Reads the SAME `/api/trips/:tripId/plancard` query key PlanSlipStrip/PlanCard use, so
 * React Query dedups — no extra network round trip on a dashboard load that already renders the
 * selected trip's PlanCard.
 *
 * §13 honest-or-absent: every count below is derived from real `routingStatus`/day data on the
 * plancard DTO. No real item in any of the three sub-cases → renders nothing.
 */
interface TodaysMoveProps {
  tripId: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

interface MoveCard {
  key: "checkout" | "with_expert" | "undecided_days";
  icon: typeof ShoppingCart;
  text: string;
  href: string;
  cta: string;
}

/**
 * Ground truth (server/services/trip-plan.service.ts `dayNumbers`): the plancard's `days` array
 * only contains day numbers that already have ≥1 itinerary item — a day with zero items is
 * ABSENT from the array, not present with an empty `activities` list. So "undecided days" is
 * derived by diffing the trip's real date-range day numbers against the day numbers that DO
 * appear in the payload, restricted to today-or-later (a past empty day isn't something to act
 * on today).
 */
function computeUndecidedDayCount(
  data: SlipData,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number {
  if (!startDate || !endDate) return 0;
  const start = startOfDay(new Date(startDate));
  const end = startOfDay(new Date(endDate));
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
  const today = startOfDay(new Date());
  const presentDayNums = new Set((data.days ?? []).map((d) => d.dayNum));
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  let undecided = 0;
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dayDate = addDays(start, dayNum - 1);
    if (dayDate < today) continue; // a past unfilled day isn't today's move
    if (!presentDayNums.has(dayNum)) undecided++;
  }
  return undecided;
}

export function TodaysMove({ tripId, destination, startDate, endDate }: TodaysMoveProps) {
  const { data } = useQuery<SlipData>({
    // Same key PlanCard/SlipView/PlanSlipStrip use — shared cache, not a duplicate fetch.
    queryKey: [`/api/trips/${tripId}/plancard`],
    enabled: !!tripId,
    staleTime: 30000,
  });

  if (!tripId || !data) return null;

  const activities = (data.days ?? []).flatMap((d) => d.activities ?? []);
  const readyForCheckout = activities.filter((a) => a.routingStatus === "ready_for_checkout").length;
  const withExpert = activities.filter((a) => a.routingStatus === "with_expert").length;
  const undecidedDays = computeUndecidedDayCount(data, startDate, endDate);
  const dest = destination?.split(",")[0] || "your trip";

  let card: MoveCard | null = null;
  if (readyForCheckout > 0) {
    card = {
      key: "checkout",
      icon: ShoppingCart,
      text: `${readyForCheckout} item${readyForCheckout !== 1 ? "s" : ""} on ${dest} ${readyForCheckout !== 1 ? "are" : "is"} staged and ready for checkout`,
      href: "/cart",
      cta: "Go to cart",
    };
  } else if (withExpert > 0) {
    card = {
      key: "with_expert",
      icon: Users2,
      text: `${withExpert} item${withExpert !== 1 ? "s" : ""} on ${dest} ${withExpert !== 1 ? "are" : "is"} with your expert, awaiting their update`,
      href: `/plans/${tripId}`,
      cta: "Open slip",
    };
  } else if (undecidedDays > 0) {
    card = {
      key: "undecided_days",
      icon: CalendarPlus,
      text: `${undecidedDays} day${undecidedDays !== 1 ? "s" : ""} on ${dest} still ${undecidedDays !== 1 ? "have" : "has"} no plan`,
      href: `/plans/${tripId}`,
      cta: "Plan it",
    };
  }

  if (!card) return null;
  const Icon = card.icon;

  return (
    <section className="mb-[22px]" data-testid="todays-move-section">
      <div
        className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
        style={{ background: "#FFF4EE", border: "0.5px solid #F0D9C8" }}
        data-testid={`todays-move-card-${card.key}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "#FFE3D3" }}
          >
            <Icon className="w-4 h-4" style={{ color: "#E85D55" }} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "#E85D55" }}>
              Today's move
            </div>
            <div className="text-[13px] leading-snug" style={{ color: "#1A1A18" }}>
              {card.text}
            </div>
          </div>
        </div>
        <Link
          href={card.href}
          className="shrink-0 flex items-center gap-1 text-[12px] font-medium hover:underline"
          style={{ color: "#E85D55" }}
          data-testid="todays-move-cta"
        >
          {card.cta}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </section>
  );
}
