import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { usePlanning } from "@/contexts/PlanningContext";
import { START_PLAN_LABEL } from "@/lib/plan-vocabulary";
import { SEOHead } from "@/components/seo-head";
import { CompanyPage, CompanySection } from "@/components/company/company-page";
import {
  ABOUT_LAST_UPDATED,
  COMPANY_FOUNDED_YEAR,
  COMPANY_CITY,
  COMPANY_LEGAL_NAME,
  marketCountWord,
  marketNameList,
} from "@/lib/company-facts";

/**
 * /about (Lane B — decision-maker copy, Sep 27, 2026).
 *
 * The live platform-stats strip is REMOVED, not restyled: its "Countries" figure
 * counted the last comma-separated segment of every trip destination, and it rendered "0+" while
 * loading — a number that looked like a fact and was not one (§13). The market list and count are
 * rendered from `OPERATING_MARKETS`, never typed (client/src/lib/company-facts.ts).
 */
export default function AboutPage() {
  const cityCount = marketCountWord();
  // The page's one plan entry — the SAME opener as the hero (ruling 2026-08-28-single-planning-entry);
  // planning-entry.spec asserts it opens the modal.
  const { open: openPlanning } = usePlanning();
  return (
    <>
      <SEOHead
        title="About"
        description="Traveloure builds your plan around a place, then hands the parts that matter to someone who lives there."
        url="/about"
      />
      <CompanyPage
        eyebrow="About Traveloure"
        title="Any experience. Anywhere. Planned like a local."
        testId="page-about"
        lead={
          <p>
            Most of what a search engine knows about a city was written by people who visited once. Most of what's
            worth knowing is held by people who live there and were never asked. Traveloure asks them.
          </p>
        }
      >
        <CompanySection title="Why it exists" testId="section-about-why">
          <p>
            You tell us the occasion and where in the world you want it. We build the plan around that place, then hand
            the parts that matter to someone who lives there: the reservation that sells out by noon, the temple before
            the coaches arrive, the vendor who has worked that room before. The plan is yours to edit; the judgment is
            theirs to lend.
          </p>
        </CompanySection>

        <CompanySection title="Who's involved" testId="section-about-roles">
          <ul className="space-y-2.5">
            <li><strong>Travelers</strong> plan a five-day trip or a single evening from one place, with the hotel, the venue or the table as the anchor everything else is measured from.</li>
            <li><strong>Local experts</strong> live where you're going and check the plan against what they know. They set their own offerings and prices.</li>
            <li><strong>Trip planners</strong> take the whole thing off your hands, from first draft to the last booking.</li>
            <li><strong>Service providers</strong> are the drivers, photographers, caterers, guides and venues you book through the plan, with the terms shown before you commit.</li>
            <li><strong>AI</strong> does the legwork: it drafts, compares options by how they fit your plan, and keeps the schedule honest. It never has the last word on what's good; a local does.</li>
          </ul>
        </CompanySection>

        <CompanySection title="Where we are" testId="section-about-markets">
          <p>
            Traveloure is in beta in {cityCount} cities, chosen because they're the places where local knowledge changes
            the trip the most: {marketNameList()}. Kyoto is first. Markets open as local experts join them; we don't show
            a city as live until real people are behind it.
          </p>
        </CompanySection>

        <CompanySection title="Company" testId="section-about-company">
          <p>
            {COMPANY_LEGAL_NAME} is a Florida company, founded in {COMPANY_FOUNDED_YEAR} and based in{" "}
            {COMPANY_CITY}.
          </p>
          <p className="text-sm italic" style={{ color: "var(--earn-muted)" }} data-testid="text-about-updated">
            Last updated: {ABOUT_LAST_UPDATED}. This page changes as markets open.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Button onClick={() => openPlanning()} data-testid="button-start-planning">
              {START_PLAN_LABEL}
            </Button>
            <Link href="/earn" className="text-sm underline underline-offset-2">Work with travelers in your city →</Link>
          </div>
        </CompanySection>
      </CompanyPage>
    </>
  );
}
