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
 * No purchase flow ships in this lane — CTAs route to the relevant surface
 * (planner, /experts) or a stub toast for the not-yet-buildable ones.
 */
import { useQuery } from "@tanstack/react-query";
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
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/seo-head";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface PricingPlanRow {
  key: string;
  name: string;
  priceCents: number;
  interval: string;
  betaFreeUntil?: string | null;
}

interface PricingBundle {
  serviceFeePct: number;
  serviceFeeCapCents: number;
  optimizerRunDisplay: { priceCents: number; currency: string; complexityTier: string };
  aiTaskCents: number;
  tripPass: PricingPlanRow;
  plusAnnual: PricingPlanRow;
  proMonthly: PricingPlanRow;
  doneForYouDepositPct: number;
  proRateStandard: number;
  proRateStepped: number;
  railsRate: number;
  proBandStep: number;
}

function dollars(cents: number): string {
  const v = cents / 100;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

function pct(n: number): string {
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}

export default function PricingPage() {
  const { openSignInModal } = useSignInModal();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: pricing, isLoading, isError } = useQuery<PricingBundle>({
    queryKey: ["/api/pricing"],
  });

  const stub = (label: string) =>
    toast({ title: `${label} — coming soon`, description: "This purchase flow isn't live yet." });

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--earn-ground)]">
        <Loader2 className="w-6 h-6 animate-spin text-[color:var(--earn-teal-ink)]" data-testid="loader-pricing" />
      </div>
    );
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
      onClick: () => (user ? setLocation("/dashboard") : openSignInModal()),
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
        "Charged only when you confirm",
      ],
      cta: "Optimize a plan",
      variant: "outline" as const,
      onClick: () => (user ? setLocation("/dashboard") : openSignInModal()),
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
        "Unlimited AI runs & tasks on that trip",
        "One revision from a local expert",
        "No service fee on that trip's bookings",
        "Usually pays for itself in one booking",
      ],
      cta: "Get a Trip Pass",
      variant: "coral" as const,
      onClick: () => stub("Trip Pass"),
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
        `Events: custom quote · ${pct(pricing.doneForYouDepositPct)} deposit`,
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
        description="Plan it yourself for free, pay per use with AI, get a Trip Pass for unlimited runs, or hand it to a local expert. Transparent pricing, no membership required."
      />

      {/* Band header */}
      <section className="bg-[var(--earn-card)] border-b border-[color:var(--earn-border)] py-[26px]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-[14px]">
            <span className="w-[42px] h-[42px] rounded-xl bg-[var(--earn-teal-wash)] text-[color:var(--earn-teal-ink)] grid place-items-center shrink-0">
              <Palmtree className="w-[22px] h-[22px]" />
            </span>
            <div>
              <div
                className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--earn-coral-ink)]"
                style={{ fontFamily: EARN_MONO }}
                data-testid="text-pricing-eyebrow"
              >
                PLAN IT YOUR WAY
              </div>
              <h1
                className="text-[28px] md:text-[30px] font-semibold text-[color:var(--earn-navy)] leading-tight"
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                data-testid="text-pricing-title"
              >
                Plan it your way
              </h1>
            </div>
          </div>
          <p className="text-sm text-[color:var(--earn-muted)] mt-[6px] ml-[56px] max-w-[62ch]">
            Yourself, with AI, with a local, or done for you. Every AI action is pay-per-use —
            no membership needed.
          </p>
        </div>
      </section>

      {/* Four-column ladder */}
      <section className="max-w-6xl mx-auto px-6 py-10">
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
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
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
                className={
                  "mt-5 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors " +
                  (col.variant === "coral"
                    ? "bg-[var(--earn-coral-ink)] text-white hover:opacity-90"
                    : "border border-[color:var(--earn-border)] text-[color:var(--earn-ink)] hover:bg-[var(--earn-chip)]")
                }
              >
                {col.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Plus band */}
      <section className="bg-[var(--earn-ground)] border-y border-[color:var(--earn-border)]">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div>
            <div
              className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--earn-coral-ink)]"
              style={{ fontFamily: EARN_MONO }}
            >
              PLUS · FOR THE CITY YOU LIVE IN
            </div>
            <h3
              className="text-[26px] font-semibold text-[color:var(--earn-navy)] mt-2 leading-tight"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              A plan arrives before every date that matters.
            </h3>
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
            <button
              onClick={() => stub("Plus")}
              data-testid="button-join-plus"
              className="mt-5 rounded-lg py-2.5 px-5 text-sm font-semibold bg-[var(--earn-coral-ink)] text-white hover:opacity-90 transition-colors"
            >
              Join Plus · {dollars(pricing.plusAnnual.priceCents)}/year
            </button>
            <p className="text-[11px] text-[color:var(--earn-faint)] mt-3" style={{ fontFamily: EARN_MONO }}>
              Not a discount club — Plus is about timing, not member pricing.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Cake, tag: "BIRTHDAY", copy: "A draft plan lands two weeks before, ready to tweak.", grad: "from-[#F3E2B8] to-[#D2A24C]" },
              { icon: HeartHandshake, tag: "ANNIVERSARY", copy: "The place you loved, or somewhere just as good.", grad: "from-[#E5C6B6] to-[#B97C7C]" },
              { icon: Moon, tag: "DATE NIGHT", copy: "Something for tonight, picked before you had to ask.", grad: "from-[#CFE3D3] to-[#6FA383]" },
            ].map((card, i) => (
              <div key={i} className="rounded-2xl border border-[color:var(--earn-border)] bg-[var(--earn-card)] overflow-hidden">
                <div className={`h-[84px] bg-gradient-to-br ${card.grad} flex items-center justify-center text-white/90`}>
                  <card.icon className="w-6 h-6" />
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
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div
            className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--earn-muted)]"
            style={{ fontFamily: EARN_MONO }}
          >
            FOR EXPERTS & PROVIDERS
          </div>
          {pricing.proMonthly.betaFreeUntil && (
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--earn-gold-ink)] bg-[var(--earn-gold-wash)] border border-[#F0DCA6] rounded-full px-2.5 py-1"
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
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
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
              className="mt-6 w-full rounded-lg py-2.5 text-sm font-semibold bg-[var(--earn-teal)] text-white hover:opacity-90 transition-colors"
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
