/**
 * The four "How it works" steps — ONE source for the landing strip (names only) and the
 * /how-it-works page (names, descriptions, details). Landing reorder, ledger
 * `2026-09-28-landing-reorder`: the descriptions left the landing page and live on
 * /how-it-works; a second copy of these names is the drift §18 rule 1 names.
 */
export interface HowItWorksStep {
  n: string;
  title: string;
  body: string;
  details: string[];
}

export const HOW_IT_WORKS_STEPS: readonly HowItWorksStep[] = [
  {
    n: "01",
    title: "Share your vision",
    body: "Destination, dates, budget, and what matters. Build it on the slip.",
    details: [
      "Choose the occasion: a trip, a wedding, a date night",
      "Set where and when",
      "Add who's coming and what matters to you",
    ],
  },
  {
    n: "02",
    title: "Sharpen it with AI",
    body: "Three versions around an anchor; re-time a day, fill a gap.",
    details: [
      "Three versions built around your anchor plans",
      "Re-time a day or fill a gap",
      "Review first: nothing changes until you apply it",
    ],
  },
  {
    n: "03",
    title: "Hand it to a local",
    body: "A named expert reviews, re-routes, and books what needs a human.",
    details: [
      "A named local expert takes your plan",
      "They review, re-route and book what needs a human",
      "Message them from your plan",
    ],
  },
  {
    n: "04",
    title: "Experience it",
    body: "Take the plan with you — or have it run for you, end to end.",
    details: [
      "Your plan and bookings in one place",
      "Take it with you on the day",
      "Or have a local run it for you, end to end",
    ],
  },
];

/**
 * The HOME page's strip says it in three words (H1, ledger `2026-10-08-h1-home-copy`; decision-maker,
 * Oct 8, 2026): "1 Pick → 2 Plan → 3 Hand off or book". It is the short form of the four steps above,
 * which /how-it-works still describes in full; "See how it works →" sits beside it on the strip.
 */
export interface HomeHowItWorksStep {
  n: string;
  title: string;
}
export const HOME_HOW_IT_WORKS_STEPS: readonly HomeHowItWorksStep[] = [
  { n: "1", title: "Pick" },
  { n: "2", title: "Plan" },
  { n: "3", title: "Hand off or book" },
];
