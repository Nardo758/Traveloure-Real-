import { Link } from "wouter";
import { SEOHead } from "@/components/seo-head";
import { CompanyPage, CompanySection, PAGE_LINK } from "@/components/company/company-page";
import { COMPANY_CONTACT_EMAIL, marketCountWord } from "@/lib/company-facts";

/**
 * /careers (Lane B — decision-maker copy, Sep 27, 2026). No open roles and NO form: an application
 * form with no role and no ATS behind it would collect applications nobody can act on (§13). The
 * earlier fabricated postings stay gone (see git history for the §13 removal note).
 */
export default function CareersPage() {
  return (
    <>
      <SEOHead title="Careers" description="Traveloure isn't hiring for salaried roles right now." url="/careers" />
      <CompanyPage title="Careers" testId="page-careers">
        <CompanySection title="Not hiring right now" testId="section-careers-status">
          <p>We're a small team and we're not hiring for salaried roles right now.</p>
          <p>
            When we do, the first roles will be market leads in our {marketCountWord()} launch cities and traveler
            support. If that's you, write to{" "}
            <a href={`mailto:${COMPANY_CONTACT_EMAIL}`} className={PAGE_LINK} data-testid="link-careers-email">
              {COMPANY_CONTACT_EMAIL}
            </a>{" "}
            with the city and one paragraph on why you'd be good at it; we keep every message and answer each one.
          </p>
        </CompanySection>
        <CompanySection title="Work with travelers now" testId="section-careers-earn">
          <p>
            If you live in one of our cities and want to work with travelers now, that's a different door:{" "}
            <Link href="/earn?role=local_expert" className={`${PAGE_LINK} font-semibold`} data-testid="link-careers-earn">
              Become a local expert →
            </Link>
          </p>
        </CompanySection>
      </CompanyPage>
    </>
  );
}
