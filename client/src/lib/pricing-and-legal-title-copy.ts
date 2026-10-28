/**
 * Row 257 (Architect, Oct 27, 2026): the product does not say "AI" to travelers. Every string this
 * row changes on /pricing, /terms and /privacy lives here, so wording can be swapped without touching
 * logic. ALL HELD FOR LEON (founder wording review); Marketing may replace any of them on the PR.
 */
import { HOMEPAGE_META_DESCRIPTION } from "./g02-g06-copy";

export const PRICING_AND_LEGAL_TITLE_COPY = {
  // K1/K2: the card takes Optimize's existing name (OptimizerLead.tsx optimizeCtaLabel).
  pricingOptimizeCard: {
    eyebrow: "PAY PER USE",
    name: "Optimize",
  },
  pricingPage: {
    // SEOHead appends " | Traveloure"; the title never carries it.
    title: "Pricing",
    bandLead: "Yourself, with Optimize, with a local, or done for you. Every Optimize run and task is pay-per-use —",
    bandLeadTail: "no membership needed.",
    descriptionBeforeRuns: "Plan it yourself for free, pay per use to optimize, get a Trip Pass for ",
    descriptionAfterRuns: " and unlimited tasks, or hand it to a local expert. Transparent pricing, no membership required.",
  },
  tripPass: {
    // Follows the "5 optimizer runs" phrase on the /pricing Trip Pass checklist line.
    pricingLineTail: " + unlimited tasks on that trip",
  },
  // K3–K6: the page's own H1 and the approved homepage sentence (Architect, Oct 27, 21:10 ET).
  termsPage: {
    title: "Terms and Conditions",
    description: HOMEPAGE_META_DESCRIPTION,
  },
  privacyPage: {
    title: "Privacy Policy",
    description: HOMEPAGE_META_DESCRIPTION,
  },
} as const;
