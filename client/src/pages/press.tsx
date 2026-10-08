import { SEOHead } from "@/components/seo-head";
import { CompanyPage, CompanySection, PAGE_LINK } from "@/components/company/company-page";
import {
  COMPANY_CONTACT_EMAIL,
  COMPANY_FOUNDED_YEAR,
  COMPANY_HQ,
  COMPANY_LEGAL_NAME,
  marketCountWord,
  marketsInDisplayOrder,
} from "@/lib/company-facts";

/**
 * /press (Lane B — decision-maker copy, Sep 27, 2026).
 *
 * The stats strip is REMOVED: its "Active Users" counted every account and its figures read "0+"
 * while loading (§13). Coverage: the section is hidden while there is none — `PRESS_COVERAGE` is
 * empty, and an empty list renders nothing rather than "No coverage yet". The product image is
 * NOT shown until the file exists (decision-maker: "after Track A step 1"); only the logo files
 * already in client/public are offered.
 */
const PRESS_COVERAGE: ReadonlyArray<{ outlet: string; title: string; url: string; date: string }> = [];

const LOGO_ASSETS = [
  { label: "Logo (SVG)", href: "/traveloure-logo.svg" },
  { label: "Logo (PNG)", href: "/traveloure-logo.png" },
  { label: "Logo, one color (SVG)", href: "/traveloure-logo-mono.svg" },
];

export default function PressPage() {
  return (
    <>
      <SEOHead
        title="Press"
        description="Traveloure press boilerplate, facts, contact and logo downloads."
        url="/press"
      />
      <CompanyPage title="Press" testId="page-press">
        <CompanySection title="Boilerplate" testId="section-press-boilerplate">
          <p className="text-xs uppercase tracking-wide" style={{ color: "var(--earn-muted)" }}>Approved for quotation</p>
          <p>
            Traveloure is a planning platform where travelers describe an occasion and a place, and get a plan built
            around that place and checked by someone who lives there. It connects travelers with local experts, trip
            planners and service providers in {marketCountWord()} cities across Asia, Europe and Latin America.{" "}
            {COMPANY_LEGAL_NAME} was founded in {COMPANY_FOUNDED_YEAR} and is based in {COMPANY_HQ}.
          </p>
        </CompanySection>

        <CompanySection title="Facts" testId="section-press-facts">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]">
            <dt className="font-semibold">Founded</dt><dd>{COMPANY_FOUNDED_YEAR}</dd>
            <dt className="font-semibold">Headquarters</dt><dd>{COMPANY_HQ}, USA</dd>
            <dt className="font-semibold">Markets (beta)</dt><dd>{marketsInDisplayOrder().map((m) => m.cityName).join(", ")}</dd>
            <dt className="font-semibold">Roles on the platform</dt><dd>travelers, local experts, trip planners, service providers, executive assistants</dd>
            <dt className="font-semibold">Model</dt><dd>pay-per-use planning (a Trip Pass per trip; Plus for occasions; Pro for professionals), plus a service fee on bookings. No memberships, credits or wallets.</dd>
            <dt className="font-semibold">Site</dt><dd>traveloure.com</dd>
          </dl>
        </CompanySection>

        <CompanySection title="Press contact" testId="section-press-contact">
          <p>
            <a href={`mailto:${COMPANY_CONTACT_EMAIL}`} className={PAGE_LINK} data-testid="link-press-email">
              {COMPANY_CONTACT_EMAIL}
            </a>
            . We reply within two business days.
          </p>
        </CompanySection>

        <CompanySection title="Assets" testId="section-press-assets">
          <ul className="space-y-1.5">
            {LOGO_ASSETS.map((a) => (
              <li key={a.href}>
                <a href={a.href} download className={PAGE_LINK}>{a.label}</a>
              </li>
            ))}
          </ul>
        </CompanySection>

        {PRESS_COVERAGE.length > 0 && (
          <CompanySection title="Coverage" testId="section-press-coverage">
            <ul className="space-y-1.5">
              {PRESS_COVERAGE.map((c) => (
                <li key={c.url}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className={PAGE_LINK}>
                    {c.outlet}: {c.title}
                  </a>{" "}
                  <span style={{ color: "var(--earn-muted)" }}>({c.date})</span>
                </li>
              ))}
            </ul>
          </CompanySection>
        )}
      </CompanyPage>
    </>
  );
}
