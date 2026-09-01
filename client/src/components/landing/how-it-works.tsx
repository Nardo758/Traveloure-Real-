/**
 * how-it-works.tsx — "How it works + price ladder", merged (landing-build Phase 2.2;
 * v2.5 folds the Plus band in — ruling 2026-09-01-plus-in-pricing).
 * Visual of record: docs/design/landing-earn-mock-v2.5.html "HOW IT WORKS + PRICE LADDER".
 *
 * Every price renders from the LIVE bundle (GET /api/pricing — public; §8: no fee
 * literals here, the numbers are rows). A missing bundle field renders "—", never a
 * remembered number. Step 3 is deliberately number-free ("expert-priced") — expert rates
 * are per-offering and no floor is fabricated (§13). No coral button in this section —
 * "See full pricing →" is the action (the mock's ruling that keeps coral to 4).
 *
 * PLUS BAND (v2.5): Plus is no longer its own section — it renders as a slim band beneath
 * the four travel steps, the home-city product visibly distinct from the travel ladder.
 * It carries the live plusAnnual price and renders "coming soon" while plusSalesEnabled is
 * false. It has NO coral CTA (the former Plus Join button and its coral leave the page —
 * "See full pricing →" stays the only action), so the coral count holds at 4 across the
 * PLUS_SALES_ENABLED flip.
 */
import { useQuery } from "@tanstack/react-query";
import { SectionHeader, OpenSection } from "./section-header";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface PricingBundle {
  serviceFeePct?: number;
  serviceFeeCapCents?: number;
  optimizerRunDisplay?: { priceCents: number };
  aiTaskCents?: number;
  tripPass?: { priceCents: number };
  doneForYouDepositPct?: number;
  plusAnnual?: { priceCents: number; interval: string };
  plusSalesEnabled?: boolean;
}

function cents(c: number | undefined): string {
  if (c === undefined || !Number.isFinite(c)) return "—";
  const d = c / 100;
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
}

function Price({ eyebrow, main, mainNote, second, secondNote }: {
  eyebrow: string;
  main: string;
  mainNote?: string;
  second?: string;
  secondNote?: string;
}) {
  return (
    <div className="mt-3 border-t pt-2.5" style={{ borderColor: "var(--earn-border, #E4E4DE)" }}>
      <span
        className="text-[9.5px] font-medium uppercase tracking-[0.1em]"
        style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}
      >
        {eyebrow}
      </span>
      <span className="mt-[3px] block text-[15px] font-semibold tracking-[-0.01em]" style={{ fontFamily: EARN_MONO }}>
        {main}
        {mainNote && (
          <small className="text-[10px] font-normal" style={{ color: "var(--earn-muted)" }}>
            {" "}· {mainNote}
          </small>
        )}
      </span>
      {second && (
        <span className="mt-1.5 block text-[13px] font-semibold" style={{ fontFamily: EARN_MONO, color: "var(--earn-ink)" }}>
          {second}
          {secondNote && (
            <small className="text-[10px] font-normal" style={{ color: "var(--earn-muted)" }}>
              {" "}· {secondNote}
            </small>
          )}
        </span>
      )}
    </div>
  );
}

const STEPS: Array<{ n: string; title: string; body: string }> = [
  { n: "01", title: "Share your vision", body: "Destination, dates, budget, and what matters. Build it on the slip." },
  { n: "02", title: "Sharpen it with AI", body: "Three versions around an anchor; re-time a day, fill a gap." },
  { n: "03", title: "Hand it to a local", body: "A named expert reviews, re-routes, and books what needs a human." },
  { n: "04", title: "Experience it", body: "Take the plan with you — or have it run for you, end to end." },
];

export function HowItWorks() {
  const { data: pricing } = useQuery<PricingBundle>({ queryKey: ["/api/pricing"] });

  const feeNote =
    pricing?.serviceFeePct !== undefined && pricing?.serviceFeeCapCents !== undefined
      ? `${pricing.serviceFeePct}% fee on bookings, cap ${cents(pricing.serviceFeeCapCents)}`
      : undefined;

  return (
    <OpenSection first testId="section-how-it-works">
      <SectionHeader
        eyebrow="How it works · and what each step costs"
        title="From an idea to a plan you can use."
        link={{ label: "See full pricing →", href: "/pricing", testId: "link-see-full-pricing" }}
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
        {STEPS.map((step, i) => (
          <div
            key={step.n}
            className="flex flex-col lg:border-r lg:pr-[22px] lg:[&+&]:pl-[22px]"
            style={{ borderColor: "var(--earn-border, #E4E4DE)", ...(i === 3 ? { borderRight: 0 } : {}) }}
          >
            <span
              className="self-start rounded-full px-2 py-[3px] text-[10px] font-medium"
              style={{ fontFamily: EARN_MONO, color: "var(--earn-teal-ink)", background: "var(--earn-teal-wash)" }}
            >
              {step.n}
            </span>
            <h4 className="mb-1 mt-2.5 text-[18px] font-semibold" style={{ fontFamily: FRAUNCES }}>
              {step.title}
            </h4>
            <p className="mb-3 text-[13px]" style={{ color: "var(--earn-muted)" }}>
              {step.body}
            </p>
            {i === 0 && <Price eyebrow="Plan it yourself" main="Free" mainNote={feeNote} />}
            {i === 1 && (
              <Price
                eyebrow="Pay per use"
                main={cents(pricing?.optimizerRunDisplay?.priceCents)}
                mainNote={`/ run · ${cents(pricing?.aiTaskCents)} / task`}
                second={pricing?.tripPass ? `Trip Pass ${cents(pricing.tripPass.priceCents)}` : undefined}
                secondNote={pricing?.tripPass ? "/ trip · unlimited" : undefined}
              />
            )}
            {i === 2 && <Price eyebrow="With a local" main="expert-priced" mainNote="per offering" />}
            {i === 3 && (
              <Price
                eyebrow="Done for you"
                main="quote"
                mainNote={
                  pricing?.doneForYouDepositPct !== undefined
                    ? `${pricing.doneForYouDepositPct}% deposit`
                    : undefined
                }
              />
            )}
          </div>
        ))}
      </div>

      {/* Plus band (v2.5; ruling 2026-09-01-plus-in-pricing): the home-city product as a slim
          band beneath the ladder — gold-ink eyebrow, live plusAnnual price, "coming soon" while
          plusSalesEnabled is false. No coral CTA (See full pricing → in the header is the action). */}
      <div
        className="mt-3.5 flex flex-wrap items-center gap-[18px] rounded-[12px] border border-dashed px-4 py-3"
        style={{ borderColor: "var(--earn-border-dash, #D5D0C8)" }}
        data-testid="plus-band"
      >
        <span
          className="text-[10px] font-medium uppercase tracking-[0.14em]"
          style={{ fontFamily: EARN_MONO, color: "var(--earn-gold-ink)" }}
        >
          Plus · your own city
        </span>
        <span className="text-[14px]" style={{ color: "var(--earn-ink)" }}>
          Birthdays, anniversaries, the Friday you keep meaning to plan — a local's plan arrives
          before each date.
        </span>
        <span
          className="ml-auto text-[13px] font-semibold"
          style={{ fontFamily: EARN_MONO, color: "var(--earn-ink)" }}
          data-testid="plus-band-price"
        >
          {cents(pricing?.plusAnnual?.priceCents)}
          <small className="font-normal" style={{ color: "var(--earn-muted)" }}>
            {" "}/ year{pricing?.plusSalesEnabled === true ? "" : " · coming soon"}
          </small>
        </span>
      </div>
    </OpenSection>
  );
}
