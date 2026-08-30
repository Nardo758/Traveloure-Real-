/**
 * plus-occasions.tsx — "Plus · the city you live in" (landing-build Phase 2.3).
 * Visual of record: docs/design/landing-earn-mock.html "OCCASIONS (Plus)".
 *
 * The Join-Plus CTA gates on the LIVE `plusSalesEnabled` flag from GET /api/pricing
 * (#605's Plus lane exposes it; currently false in prod): while off, the button is a
 * NON-coral coming-soon state with the real price still shown — which is also what
 * holds the ruled coral-button count at 3 (hero, earn, final). The three occasion
 * cards are the mock's ILLUSTRATIVE templates for anonymous visitors — labeled
 * template art, not personal dates and not fabricated bookings.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SectionHeader, OpenSection } from "./section-header";

const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

interface PricingBundle {
  plusAnnual?: { priceCents: number; interval: string };
  plusSalesEnabled?: boolean;
}

const OCCASION_TEMPLATES = [
  { tag: "Birthday", title: "An evening they'll remember", note: "built by a local", bg: "linear-gradient(135deg,#E5C6B6,#B97C7C)" },
  { tag: "Anniversary", title: "A table worth booking", note: "built by a local", bg: "linear-gradient(135deg,#F3E2B8,#D2A24C)" },
  { tag: "Date night", title: "Something new near you", note: "every other Friday", bg: "linear-gradient(135deg,#CFE3D3,#6FA383)" },
];

export function PlusOccasions() {
  const { data: pricing } = useQuery<PricingBundle>({ queryKey: ["/api/pricing"] });
  const priceCents = pricing?.plusAnnual?.priceCents;
  const priceLabel =
    priceCents !== undefined && Number.isFinite(priceCents) ? `$${priceCents / 100} / year` : null;
  const salesEnabled = pricing?.plusSalesEnabled === true;

  return (
    <OpenSection testId="section-plus-occasions">
      <SectionHeader
        eyebrow="Plus · the city you live in"
        title="Her birthday is in 14 days."
        link={{ label: "How Plus works →", href: "/pricing", testId: "link-how-plus-works" }}
      />
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="mb-3.5 max-w-[460px] text-[15px]" style={{ color: "var(--earn-muted)" }}>
            Birthdays, anniversaries, the Friday you keep meaning to do something about. Tell
            Traveloure your city and the dates; a plan built by someone who lives there arrives
            before each one.
          </p>
          <div className="flex items-center gap-2.5">
            {salesEnabled ? (
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-[8px] px-3.5 py-2 text-[13px] font-semibold text-white"
                style={{ background: "var(--earn-coral-ink)" }}
                data-testid="button-join-plus"
              >
                Join Plus{priceLabel ? ` · ${priceLabel}` : ""}
              </Link>
            ) : (
              <span
                className="inline-flex items-center gap-2 rounded-[8px] border px-3.5 py-2 text-[13px] font-semibold"
                style={{ borderColor: "var(--earn-border, #E4E4DE)", color: "var(--earn-muted)", background: "#fff" }}
                data-testid="button-join-plus-coming-soon"
              >
                Plus{priceLabel ? ` · ${priceLabel}` : ""}
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em]"
                  style={{ fontFamily: EARN_MONO, color: "var(--earn-teal-ink)", background: "var(--earn-teal-wash)" }}
                >
                  coming soon
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3" data-testid="plus-occasion-templates">
          {OCCASION_TEMPLATES.map((oc) => (
            <div key={oc.tag}>
              <div className="relative h-24 rounded-[12px]" style={{ background: oc.bg }}>
                <span
                  className="absolute left-2 top-2 rounded-[6px] bg-white px-[7px] py-[3px] text-[9px] font-medium uppercase tracking-[0.08em]"
                  style={{ fontFamily: EARN_MONO }}
                >
                  {oc.tag}
                </span>
              </div>
              <b className="mt-2 block text-[13px]">{oc.title}</b>
              <small className="text-[10.5px]" style={{ fontFamily: EARN_MONO, color: "var(--earn-muted)" }}>
                {oc.note}
              </small>
            </div>
          ))}
        </div>
      </div>
    </OpenSection>
  );
}
