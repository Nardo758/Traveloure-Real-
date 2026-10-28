/**
 * Row 257 (Architect, Oct 27, 2026, 8:10, 9:10, 9:40 and 10:10 PM ET): the product does not say "AI"
 * to travelers. Every string this row changes lives here, so wording can be swapped without touching
 * logic. ALL HELD FOR LEON (founder wording review). No React, no DOM.
 */
import { HOMEPAGE_META_DESCRIPTION } from "./g02-g06-copy";

export const PRICING_AND_LEGAL_TITLE_COPY = {
  // K1, K2: Optimize's existing name (OptimizerLead.tsx optimizeCtaLabel); the old eyebrow minus "WITH AI · ".
  pricingOptimizeCard: {
    name: "Optimize",
    eyebrow: "PAY PER USE",
  },
  // K3–K6: each page's own H1 (no "| Traveloure"; SEOHead appends it) and the approved home description.
  termsPage: {
    title: "Terms and Conditions",
    description: HOMEPAGE_META_DESCRIPTION,
  },
  privacyPage: {
    title: "Privacy Policy",
    description: HOMEPAGE_META_DESCRIPTION,
  },
  pricingPage: {
    // K7: the /pricing band lead.
    bandLead: "Yourself, with Optimize, with a local, or done for you. Every run and task is pay-per-use — no membership needed.",
    // K8: the /pricing meta description; runsPhrase is tripPassRunsPhrase(pricing.tripPass.runsPerTrip).
    seoDescription: (runsPhrase: string): string =>
      `Plan it yourself for free, pay per use with Optimize, get a Trip Pass for ${runsPhrase} and unlimited tasks, or hand it to a local expert. Transparent pricing, no membership required.`,
  },
  // K9: the /pricing Trip Pass checklist line is "<Phrase> + <K9>".
  tripPassPricingLineTail: "unlimited tasks on that trip",
  // K10: the Trip Pass offer card line is "· <phrase> + <K10>". Never "unlimited" (slip-conformance.test.ts).
  tripPassCardTail: "tasks · service fee waived",
  // K11: the toast after a Trip Pass purchase is confirmed (TripPassCard.tsx). Never "unlimited".
  tripPassActivatedToast: "Optimizer runs and tasks on this trip are now included.",
  // K12: the active Trip Pass card's line (TripPassCard.tsx). Never "unlimited".
  tripPassActiveLine: "optimizer runs + tasks included · service fee waived on this trip",
} as const;
