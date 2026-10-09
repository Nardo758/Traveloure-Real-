/**
 * /pricing — "Plan it your way" ladder (lane/pricing-page, Phase 2).
 *
 * Every number on this page is a live-row read via GET /api/pricing (see
 * server/routes/pricing.routes.ts) — no price literal lives in this file.
 * Visual grammar matches the Ways-to-Earn system: --earn-* tokens from
 * client/src/index.css, Fraunces headings, Geist Mono numbers/labels/
 * eyebrows, Inter body, one coral CTA per band.
 *
 * Structure (per docs/design/PRICING_PAGE_SPEC.md):
 *   band header -> four-column ladder (Yourself / AI / Trip Pass / Local)
 *   -> Plus band -> Pro band.
 * Plus uses the shared membership-checkout client rail when sales are enabled. Other CTAs route
 * to their relevant surface (planner, /experts) or retain their not-yet-buildable stub.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tripPassPricingLine, tripPassRunsPhrase } from "@/lib/trip-pass-runs-copy";
import { Link, useLocation } from "wouter";
import {
  Palmtree,
  Sparkles,
  MapPinned,
  UserRound,
  Check,
  Cake,
  HeartHandshake,
  Moon,
  AlertTriangle,
} from "lucide-react";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { usePlanning } from "@/contexts/PlanningContext";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/seo-head";
import { Skeleton } from "@/components/ui/skeleton";
import {
  pageContainerClass,
  PageTitle,
  SectionTitle,
  HEADING_STYLE,
  EYEBROW_CLASS,
  EYEBROW_STYLE,
  PAGE_ACTION,
  PAGE_LINK,
} from "@/components/company/company-page";
import {
  startMembershipCheckout,
  type MembershipCheckoutNotice,
} from "@/lib/membership-checkout";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface PricingPlanRow {
  key: string;
  name: string;
  priceCents: number;
  interval: string;
  betaFreeUntil?: string | null;
  /** Trip Pass only: the optimizer runs one pass covers (R-ac), from `TRIP_PASS_RUNS_PER_TRIP`. */
  runsPerTrip?: number | null;
}

interface PricingBundle {
  serviceFeePct: number;
  serviceFeeCapCents: number;
  optimizerRunDisplay: { priceCents: number; currency: string; complexityTier: string };
  aiTaskCents: number;
  tripPass: PricingPlanRow;
  plusAnnual: PricingPlanRow;
  proMonthly: PricingPlanRow;
  proRateStandard: number;
  proRateStepped: number;
  railsRate: number;
  proBandStep: number;
  conciergeBooking: { percent: number; capDollars: number; expertSharePercent: number };
  plusSalesEnabled: boolean;
}

function dollars(cents: number): string {
  const v = cents / 100;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

function pct(n: number): string {
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}

/**
 * The page header, rendered in the loading state too, so the page never opens blank
 * (footer-pages ruling: a skeleton at final height, no blank-then-jump). Shared title scale
 * (PageTitle, Fraunces 42) and the shared content width.
 */
function PricingBand() {
  return (
    <section className="bg-[var(--earn-card)] border-b border-[color:var(--earn-border)] py-8">
      <div className={pageContainerClass("content")}>
        <div className={EYEBROW_CLASS} style={EYEBROW_STYLE} data-testid="text-pricing-eyebrow">
          PLAN IT YOUR WAY
        </div>
        <div className="mt-2">
          <PageTitle testId="text-pricing-title">Plan it your way</PageTitle>
        </div>
        <p className="text-[15px] text-[color:var(--earn-muted)] mt-3 max-w-[62ch]">
          Yourself, with AI, with a local, or done for you. Every AI action is pay-per-use —
          no membership needed.
        </p>
      </div>
    </section>
  );
}

/**
 * The loading state: the same bands and grid as the loaded page, with each block held at the
 * height it renders at (measured per breakpoint on the loaded page, Sep 28, 2026), so nothing
 * moves when `/api/pricing` answers — a copy edit that changes a block's height changes these
 * numbers too. No number is shown — a
 * price is never drawn before the bundle that owns it has arrived (§13).
 */
function PricingSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--earn-ground)] [--pricing-grid-h:1286px] [--pricing-disclosure-h:49px] [--pricing-plus-h:1170px] [--pricing-pro-h:683px] sm:[--pricing-grid-h:1247px] sm:[--pricing-disclosure-h:33px] sm:[--pricing-plus-h:742px] sm:[--pricing-pro-h:605px] md:[--pricing-grid-h:654px] lg:[--pricing-grid-h:397px] lg:[--pricing-plus-h:565px] lg:[--pricing-pro-h:385px] xl:[--pricing-grid-h:358px] xl:[--pricing-plus-h:529px] xl:[--pricing-pro-h:368px]" data-testid="loader-pricing" aria-busy="true">
      <PricingBand />
      <section className={`${pageContainerClass("content")} py-10`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-4 h-[var(--pricing-grid-h)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[color:var(--earn-border)] bg-[var(--earn-card)] p-5 flex flex-col gap-3 overflow-hidden">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-24" />
              <div className="flex-1 space-y-2 pt-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
              <Skeleton className="h-11 w-full rounded-[10px]" />
            </div>
          ))}
        </div>
        <div className="h-[var(--pricing-disclosure-h)]" />
      </section>
      <section className="bg-[var(--earn-ground)] border-y border-[color:var(--earn-border)]">
        <div className={`${pageContainerClass("content")} py-12 h-[var(--pricing-plus-h)]`}>
          <Skeleton className="h-3 w-48" />
          <Skeleton className="mt-3 h-7 w-3/4 max-w-md" />
          <Skeleton className="mt-4 h-4 w-2/3 max-w-sm" />
        </div>
      </section>
      <section className={`${pageContainerClass("content")} py-12 h-[var(--pricing-pro-h)]`}>
        <Skeleton className="h-3 w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-5">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </section>
    </div>
  );
}

export default function PricingPage() {
  const { openSignInModal } = useSignInModal();
  const { open: openPlanning } = usePlanning();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const membershipReturn = new URLSearchParams(window.location.search).get("membership");
  const [membershipConfirmation, setMembershipConfirmation] = useState<
    "idle" | "checking" | "confirmed" | "pending"
  >(membershipReturn === "success" ? "checking" : "idle");
  const [plusCheckoutPending, setPlusCheckoutPending] = useState(false);

  const { data: pricing, isLoading, isError } = useQuery<PricingBundle>({
    queryKey: ["/api/pricing"],
  });

  const stub = (label: string) =>
    toast({ title: `${label} — coming soon`, description: "This purchase flow isn't live yet." });

  const beginPlusCheckout = async () => {
    setPlusCheckoutPending(true);
    await startMembershipCheckout({
      planKey: "plus_annual",
      onSignInRequired: () =>
        openSignInModal({
          title: "Sign in to join Plus",
          description: "Sign in to continue to secure checkout.",
          returnTo: "/pricing",
        }),
      onNotice: (notice: MembershipCheckoutNotice) => toast(notice),
    });
    setPlusCheckoutPending(false);
  };

  useEffect(() => {
    if (membershipReturn !== "success" || authLoading) return;
    if (!user) {
      openSignInModal({
        title: "Sign in to confirm Plus",
        description: "Sign in so we can confirm your membership.",
        returnTo: "/pricing?membership=success",
      });
      return;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    setMembershipConfirmation("checking");

    const checkMembership = async () => {
      attempts += 1;
      try {
        const response = await fetch("/api/plus/config", { credentials: "include" });
        if (response.status === 401) {
          openSignInModal({
            title: "Sign in to confirm Plus",
            description: "Sign in so we can confirm your membership.",
            returnTo: "/pricing?membership=success",
          });
          return;
        }
        if (response.ok) {
          const config = await response.json() as { isPlus?: boolean };
          if (config.isPlus === true) {
            if (!stopped) setMembershipConfirmation("confirmed");
            return;
          }
        }
      } catch (error) {
        console.error("[membership-checkout] Membership confirmation check failed", error);
      }

      if (attempts >= 8) {
        if (!stopped) setMembershipConfirmation("pending");
        return;
      }
      timer = setTimeout(checkMembership, 1_500);
    };

    void checkMembership();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [membershipReturn, authLoading, user, openSignInModal]);

  if (isLoading) {
    return <PricingSkeleton />;
  }

  if (isError || !pricing) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--earn-ground)] px-4">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm" data-testid="text-pricing-error">
          <AlertTriangle className="w-6 h-6 text-[color:var(--earn-coral-ink)]" />
          <p className="text-sm text-[color:var(--earn-muted)]">
            We couldn't load current pricing. Please refresh the page.
          </p>
        </div>
      </div>
    );
  }

  const ladder = [
    {
      key: "yourself",
      eyebrow: "YOURSELF",
      name: "Plan it yourself",
      price: "Free",
      icon: MapPinned,
      checklist: [
        "Slip up, browse, book — you're in control",
        `${pct(pricing.serviceFeePct)} service fee, capped at ${dollars(pricing.serviceFeeCapCents)}`,
        "Waived on bookings you make through a provider's link",
      ],
      cta: "Start planning",
      variant: "outline" as const,
      onClick: () => openPlanning({ door: "pricing_ladder", branch: "myself" }),
      testid: "yourself",
    },
    {
      key: "ai",
      eyebrow: "WITH AI · PAY PER USE",
      name: "Plan with AI",
      price: dollars(pricing.optimizerRunDisplay.priceCents),
      priceSuffix: "/ run",
      priceSub: `${dollars(pricing.aiTaskCents)} / task`,
      icon: Sparkles,
      checklist: [
        "3 versions built around your anchor plans",
        "Re-time, fill gaps, or stitch it together",
        // D-21 (ledger `2026-09-15-d20-d21-proposal-charge`): the AI task is charged once per
        // proposal you APPLY — asking is free however many times, and reading or discarding a
        // proposal costs nothing. Never "per question": that would describe a charge nothing takes
        // and would make the review-first shape (LD 42 D18 — there is no undo) dishonest.
        "A run is charged when you confirm; a task only when you apply a proposal",
      ],
      cta: "Optimize a plan",
      variant: "outline" as const,
      onClick: () => openPlanning({ door: "pricing_ladder", branch: "ai" }),
      testid: "ai",
    },
    {
      key: "trip-pass",
      eyebrow: "BEST FOR ONE TRIP",
      name: "Trip Pass",
      price: dollars(pricing.tripPass.priceCents),
      priceSuffix: "/ trip",
      icon: Palmtree,
      highlighted: true,
      checklist: [
        tripPassPricingLine(pricing.tripPass.runsPerTrip),
        // "One revision from a local expert" WAS HERE AND IS DELIBERATELY GONE (ledger
        // `2026-09-21-trip-pass-revision-claim`). Locked Decision 41 (f) records `expert_revision`
        // as an entitlement with NO consumption or charge site, and instructs: "until that lane
        // lands, do not describe those two as enforced benefits." It was being described here, on
        // the sales page of a product that charges TODAY — Trip Pass is not gated by
        // PLUS_SALES_ENABLED the way Plus is. UPDATE (ledger `2026-09-21-expert-revision-retired`):
        // the entitlement is now RETIRED outright — `consumeRevision` is deleted and
        // `expert_revision` is no longer a TripPassAction — because the revision PRODUCT already
        // exists without it (Ruling 11 grants a `plan_work` buyer's expert WRITE access at
        // checkout, at the EXPERT'S own price), and Trip Pass could only "include" that by paying
        // an earner at a platform-set rate, which nobody ratified. The two
        // revision rails that DO exist are other products (LD 46 artifact revisions on a service
        // booking; the ready-made purchase's own INCLUDED revision, already inside that listing's
        // price — crediting it here would bill the same revision twice).
        // THE ALLOWANCE IS STILL RECORDED, only no longer advertised: trip-pass.routes.ts keeps
        // writing allowances_snapshot.revisionsRemaining, so a pass sold today is honoured if the
        // lane lands. Do not re-add this line before it does — trip-pass-copy.test.ts fails if you do.
        "No service fee on that trip's bookings",
        "Usually pays for itself in one booking",
      ],
      cta: "Get a Trip Pass",
      variant: "coral" as const,
      onClick: () => {
        // Ruling 2026-08-29-trip-pass: a pass attaches to ONE trip, so the CTA routes to
        // My Plans (pick a trip -> its slip carries the purchase) instead of a stub.
        toast({ title: "Trip Pass", description: "Pick a trip — the pass attaches to one trip from its plan page." });
        user ? setLocation("/dashboard") : openSignInModal();
      },
      testid: "trip-pass",
    },
    {
      key: "local",
      eyebrow: "WITH A LOCAL",
      name: "Plan with a local",
      price: "Set by each expert",
      noPriceNumber: true,
      icon: UserRound,
      checklist: [
        "A named expert takes your trip end to end",
        "They review, re-route, and book for you",
        // D-5 (ledger `2026-09-15-d5-no-milestone-billing`): there is NO deposit-then-balance,
        // milestone or instalment billing for expert planning work. A done-for-you event is a
        // coordination engagement whose fee is quoted server-side and captured ONCE
        // (`coordination_states.fee_payment_status` unpaid|pending|paid, one PaymentIntent), so
        // the old `N% deposit` line promised a split no rail performs (§13).
        "Events: custom quote · one coordination fee",
      ],
      cta: "Find a local expert",
      variant: "outline" as const,
      onClick: () => setLocation("/experts"),
      testid: "local",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--earn-ground)] text-[color:var(--earn-ink)]">
      <SEOHead
        title="Pricing | Traveloure"
        description={`Plan it yourself for free, pay per use with AI, get a Trip Pass for ${tripPassRunsPhrase(pricing.tripPass.runsPerTrip)} and unlimited AI tasks, or hand it to a local expert. Transparent pricing, no membership required.`}
      />

      {membershipReturn === "cancelled" && (
        <div
          className="border-b border-[color:var(--earn-gold)] bg-[var(--earn-gold-wash)] px-6 py-3 text-center text-sm text-[color:var(--earn-gold-ink)]"
          data-testid="banner-membership-cancelled"
        >
          Plus checkout was canceled. No membership change was made.
        </div>
      )}
      {membershipReturn === "success" && (
        <div
          className="border-b border-[color:var(--earn-teal)] bg-[var(--earn-teal-wash)] px-6 py-3 text-center text-sm text-[color:var(--earn-teal-ink)]"
          data-testid="banner-membership-confirmation"
        >
          {membershipConfirmation === "confirmed"
            ? "Your Plus membership is confirmed. You can now set up your occasions."
            : membershipConfirmation === "pending"
              ? "Your payment went through. Your Plus membership is still being confirmed; we'll email you when it is ready."
              : "Your payment went through. We’re confirming your Plus membership now…"}
        </div>
      )}

      <PricingBand />

      {/* Four-column ladder */}
      <section className={`${pageContainerClass("content")} py-10`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          {ladder.map((col) => (
            <div
              key={col.key}
              data-testid={`card-plan-${col.testid}`}
              className={
                "rounded-2xl border bg-[var(--earn-card)] p-5 flex flex-col " +
                (col.highlighted
                  ? "border-[color:var(--earn-teal)] shadow-[0_0_0_3px_var(--earn-teal-wash)]"
                  : "border-[color:var(--earn-border)]")
              }
            >
              <div
                className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[color:var(--earn-muted)]"
                style={{ fontFamily: EARN_MONO }}
              >
                {col.eyebrow}
              </div>
              <h2
                className="text-[19px] font-semibold mt-1.5"
                style={HEADING_STYLE}
              >
                {col.name}
              </h2>
              <div className="mt-2.5">
                <span
                  className={
                    "font-semibold " + (col.noPriceNumber ? "text-[17px]" : "text-[28px]")
                  }
                  style={{ fontFamily: EARN_MONO, letterSpacing: "-0.02em" }}
                  data-testid={`text-price-${col.testid}`}
                >
                  {col.price}
                </span>
                {col.priceSuffix && (
                  <span className="text-sm text-[color:var(--earn-muted)] ml-1">
                    {col.priceSuffix}
                  </span>
                )}
                {col.priceSub && (
                  <div
                    className="text-[11px] text-[color:var(--earn-muted)] mt-1"
                    style={{ fontFamily: EARN_MONO }}
                  >
                    {col.priceSub}
                  </div>
                )}
              </div>
              <ul className="mt-4 space-y-2 flex-1">
                {col.checklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[color:var(--earn-muted)]">
                    <Check className="w-3.5 h-3.5 mt-[3px] text-[color:var(--earn-teal-ink)] shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={col.onClick}
                data-testid={`button-plan-${col.testid}`}
                className={`mt-5 w-full ${col.variant === "coral" ? PAGE_ACTION.primary : PAGE_ACTION.secondary}`}
              >
                {col.cta}
              </button>
            </div>
          ))}
        </div>
        {/* Locked Decision 51 (ledger `2026-09-18-concierge-fee-cap-split`): the Booking Concierge
            fee, disclosed with the SAME live percent/cap the resolver applies — closes
            REVENUE_MODEL F1's undisclosed-fee follow-up for this line. Ledger `2026-08-22-concierge-naming`
            string. */}
        <p
          className="text-[11px] text-[color:var(--earn-faint)] text-center mt-4"
          style={{ fontFamily: EARN_MONO }}
          data-testid="text-concierge-fee-disclosure"
        >
          Destination Concierge booking fee — powered by local experts:{" "}
          {pct(pricing.conciergeBooking.percent)}, capped at{" "}
          {dollars(Math.round(pricing.conciergeBooking.capDollars * 100))}.
        </p>
      </section>

      {/* Plus band */}
      <section id="plus" className="bg-[var(--earn-ground)] border-y border-[color:var(--earn-border)]">
        <div className={`${pageContainerClass("content")} py-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start`}>
          <div>
            <div
              className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--earn-coral-ink)]"
              style={{ fontFamily: EARN_MONO }}
            >
              PLUS · FOR THE CITY YOU LIVE IN
            </div>
            <SectionTitle className="mt-2">A plan arrives before every date that matters.</SectionTitle>
            <p className="text-sm text-[color:var(--earn-muted)] mt-3 max-w-[52ch]">
              Birthdays, anniversaries, date nights — the ones you always mean to plan ahead
              for and never do. Plus keeps a draft ready before you need it.
            </p>
            <div className="mt-5">
              <span
                className="text-[28px] font-semibold"
                style={{ fontFamily: EARN_MONO, letterSpacing: "-0.02em" }}
                data-testid="text-price-plus"
              >
                {dollars(pricing.plusAnnual.priceCents)}
              </span>
              <span className="text-sm text-[color:var(--earn-muted)] ml-1">/ year</span>
            </div>
            <ul className="mt-4 space-y-2">
              {[
                "A draft plan 14 days before every occasion you tell us about",
                "Priority response from local experts, on their time and their price",
                "48-hour early access to new listings",
                "4 concierge tasks a month",
              ].map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-[color:var(--earn-muted)]">
                  <Check className="w-3.5 h-3.5 mt-[3px] text-[color:var(--earn-teal-ink)] shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {pricing.plusSalesEnabled ? (
              <button
                onClick={() => void beginPlusCheckout()}
                disabled={plusCheckoutPending}
                data-testid="button-join-plus"
                className={`mt-5 ${PAGE_ACTION.primary} disabled:opacity-60`}
              >
                {plusCheckoutPending
                  ? "Opening checkout…"
                  : `Join Plus · ${dollars(pricing.plusAnnual.priceCents)}/year`}
              </button>
            ) : (
              <button
                onClick={() =>
                  toast({
                    title: "Plus is coming soon",
                    description: "We're finishing Plus for your city. Check back shortly.",
                  })
                }
                data-testid="button-join-plus-waitlist"
                className={`mt-5 ${PAGE_ACTION.secondary}`}
              >
                Join Plus · Coming soon
              </button>
            )}
            <p className="text-[11px] text-[color:var(--earn-faint)] mt-3" style={{ fontFamily: EARN_MONO }}>
              Not a discount club — Plus is about timing, not member pricing.
            </p>
            <button
              onClick={() => setLocation("/plus/occasions")}
              data-testid="link-setup-occasions"
              className={`mt-2 text-[12px] ${PAGE_LINK}`}
            >
              Set up your occasions →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                icon: Cake,
                tag: "BIRTHDAY",
                copy: "A draft plan lands two weeks before, ready to tweak.",
                image: "/images/plus/birthday.jpg",
                alt: "Friends celebrating a birthday with a cake",
                position: "center 44%",
              },
              {
                icon: HeartHandshake,
                tag: "ANNIVERSARY",
                copy: "The place you loved, or somewhere just as good.",
                image: "/images/plus/anniversary.jpg",
                alt: "A couple sharing an anniversary dinner",
                position: "center 42%",
              },
              {
                icon: Moon,
                tag: "DATE NIGHT",
                copy: "Something for tonight, picked before you had to ask.",
                image: "/images/plus/date-night.jpg",
                alt: "A couple walking together through the city at night",
                position: "center 48%",
              },
            ].map((card, i) => (
              <div key={i} className="rounded-2xl border border-[color:var(--earn-border)] bg-[var(--earn-card)] overflow-hidden">
                <div className="relative h-[104px] overflow-hidden">
                  <img
                    src={card.image}
                    alt={card.alt}
                    className="h-full w-full object-cover"
                    style={{ objectPosition: card.position }}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" aria-hidden="true" />
                  <div className="absolute bottom-2.5 left-2.5 grid h-8 w-8 place-items-center rounded-full border border-white/40 bg-black/25 text-white backdrop-blur-sm">
                    <card.icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="p-3">
                  <div
                    className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-[color:var(--earn-muted)]"
                    style={{ fontFamily: EARN_MONO }}
                  >
                    {card.tag}
                  </div>
                  <p className="text-[12px] text-[color:var(--earn-muted)] mt-1 leading-snug">{card.copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pro band */}
      <section className={`${pageContainerClass("content")} py-12`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div
            className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--earn-muted)]"
            style={{ fontFamily: EARN_MONO }}
          >
            FOR EXPERTS & PROVIDERS
          </div>
          {pricing.proMonthly.betaFreeUntil && (
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--earn-gold-ink)] bg-[var(--earn-gold-wash)] border border-[color:var(--earn-gold)] rounded-full px-2.5 py-1"
              style={{ fontFamily: EARN_MONO }}
              data-testid="text-pro-beta-pill"
            >
              FREE DURING BETA · UNTIL {pricing.proMonthly.betaFreeUntil}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-5">
          <div className="rounded-2xl border border-[color:var(--earn-border)] bg-[var(--earn-card)] p-6 flex flex-col justify-between">
            <div>
              <h3
                className="text-[22px] font-semibold"
                style={HEADING_STYLE}
              >
                Turn on Pro
              </h3>
              <div className="mt-3 flex items-baseline gap-2">
                <span
                  className="text-[17px] line-through text-[color:var(--earn-faint)]"
                  style={{ fontFamily: EARN_MONO }}
                >
                  {dollars(pricing.proMonthly.priceCents)}
                </span>
                <span
                  className="text-[28px] font-semibold"
                  style={{ fontFamily: EARN_MONO, letterSpacing: "-0.02em" }}
                  data-testid="text-price-pro"
                >
                  $0
                </span>
                <span className="text-sm text-[color:var(--earn-muted)]" style={{ fontFamily: EARN_MONO }}>
                  / month during beta
                </span>
              </div>
            </div>
            <button
              onClick={() => stub("Pro")}
              data-testid="button-turn-on-pro"
              className={`mt-6 w-full ${PAGE_ACTION.primary}`}
            >
              Turn on Pro · free
            </button>
          </div>

          <div className="rounded-2xl border border-[color:var(--earn-border)] bg-[var(--earn-card)] p-6">
            <div className="divide-y divide-[color:var(--earn-border)]">
              <div className="flex items-center justify-between py-3" style={{ fontFamily: EARN_MONO }}>
                <span className="text-[12px] text-[color:var(--earn-muted)]">
                  Your commission on platform-sourced bookings
                </span>
                <span className="text-[13px] flex items-center gap-2">
                  <span className="line-through text-[color:var(--earn-faint)]">{pct(pricing.proRateStandard)}</span>
                  <span className="font-semibold text-[color:var(--earn-green-ink)]" data-testid="text-pro-rate-stepped">
                    {pct(pricing.proRateStepped)}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between py-3" style={{ fontFamily: EARN_MONO }}>
                <span className="text-[12px] text-[color:var(--earn-muted)]">
                  Own-sourced bookings via your short link
                </span>
                <span className="text-[13px] font-semibold" data-testid="text-pro-rate-rails">
                  {pct(pricing.railsRate)}
                </span>
              </div>
              <div className="flex items-center justify-between py-3" style={{ fontFamily: EARN_MONO }}>
                <span className="text-[12px] text-[color:var(--earn-muted)]">
                  Demand view · wanted slots, trend, lead-time
                </span>
                <span className="text-[13px] font-semibold text-[color:var(--earn-teal-ink)]">included</span>
              </div>
              <div className="flex items-center justify-between py-3" style={{ fontFamily: EARN_MONO }}>
                <span className="text-[12px] text-[color:var(--earn-muted)]">
                  Priority feed placement · early occasion listings
                </span>
                <span className="text-[13px] font-semibold text-[color:var(--earn-teal-ink)]">included</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
