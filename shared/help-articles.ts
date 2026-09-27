/**
 * The Help center's articles — ONE static, versioned module (Lane B, decision-maker approved
 * Sep 27, 2026). An article lives beside the code it describes, is reviewed in the same PR as a
 * change to that code, and needs no migration; ten articles do not justify a CMS.
 *
 * Routes: `/help` (index + search) and `/help/:slug`. Every in-app link to an article goes through
 * `helpArticlePath(slug)`, whose parameter is the closed `HelpArticleSlug` union — and
 * `client/src/lib/__tests__/help-article-links.test.ts` also refuses any raw `/help/<slug>` literal
 * that names no article.
 *
 * NUMBERS ARE NEVER TYPED HERE (§8 — no fee/price literals outside fee_bands/config):
 *   - Prices and fees are PLACEHOLDERS resolved at render time from the live `GET /api/pricing`
 *     bundle (fee_bands + the plans table). While that read is loading or has failed, a sentence
 *     that needs one is OMITTED and the article says "see Pricing" instead — never a default.
 *   - The cancellation schedule (article 7) is generated from `shared/cancellation-schedule.ts`,
 *     the table the server's refund math reads.
 *   - The checkout-hold windows (article 8) come from `shared/checkout-hold.ts`, the constants the
 *     server's sweeps read.
 * `shared/__tests__/help-articles.test.ts` pins all three.
 *
 * Rulings cited by slug: article 7 — `2026-09-27-cancel-preview-equals-refund` (R166: the preview is
 * the refund; the fee refunds at the tier percent). Article 8 — `2026-09-27-booking-status-vocabulary`
 * (R154), `2026-09-27-platform-payment-failed`, `2026-09-27-failed-is-final`,
 * `2026-09-27-retry-failed-payment`, `2026-09-27-stale-authorized-sweep`. Article 5 — fee_bands
 * `traveler_service_fee` + `concierge:ai_task`, plans `trip_pass` / `plus_annual` / `pro_monthly`,
 * and LD 41 (f) for what a Trip Pass covers.
 */

import { CANCELLATION_POLICY_TYPES, CANCELLATION_SCHEDULE, cancellationTierSchedule } from "./cancellation-schedule";
import { CHECKOUT_CLAIM_TTL_MINUTES, STALE_AUTHORIZED_CLAIM_HOURS } from "./checkout-hold";

import {
  HELP_ARTICLE_SLUGS,
  isHelpArticlePublished,
  type HelpArticleSlug,
} from "./help-article-slugs";
// The occasion count (article 1) is READ from the generated §J spec — itself generated from the
// experience_types seed by docs/planning/tools/trip-slip-spec.mjs — never typed here.
// A stale spec fails CI twice over: guard-batch runs `trip-slip-spec.mjs --check`, and
// shared/__tests__/help-articles.test.ts (H8) parses the seed directly.
import tripSlipSpec from "../docs/planning/tools/trip-slip-spec.json";

export {
  HELP_ARTICLE_SLUGS,
  PUBLISHED_HELP_ARTICLE_SLUGS,
  helpArticlePath,
  isHelpArticleSlug,
  isHelpArticlePublished,
  type HelpArticleSlug,
  type TrackAStep,
} from "./help-article-slugs";

/** The seeded occasions (the §J spec's rows, less its synthetic "(plain plan)" row). */
export const SEEDED_OCCASION_COUNT: number = (tripSlipSpec as { rows: Array<{ slug: string }> }).rows.filter(
  (r) => !r.slug.startsWith("("),
).length;

/** The slice of `GET /api/pricing` the articles read. Field names are that route's own. */
export interface HelpPricing {
  serviceFeePct: number;
  serviceFeeCapCents: number;
  aiTaskCents: number;
  tripPass: { priceCents: number };
  plusAnnual: { priceCents: number };
  proMonthly: { betaFreeUntil: string | null };
  plusSalesEnabled: boolean;
}

/** Shown only while Plus is (not) on sale — the `plusSalesEnabled` gate on `/api/pricing` (LD 26). */
export type HelpCondition = "plusOnSale" | "plusNotOnSale";

export type HelpBlock =
  | { kind: "p"; text: string; lead?: string; when?: HelpCondition }
  | { kind: "list"; items: ReadonlyArray<{ lead?: string; text: string }> }
  | { kind: "link"; text: string; href: string };

export interface HelpArticle {
  slug: HelpArticleSlug;
  title: string;
  summary: string;
  keywords: readonly string[];
  blocks: readonly HelpBlock[];
}

/** Pricing placeholders — each resolves ONLY from a live `/api/pricing` answer. */
export const HELP_PRICING_TOKENS = [
  "tripPassPrice",
  "plusPrice",
  "serviceFeePct",
  "serviceFeeCap",
  "aiTaskFee",
  "proFreeUntil",
] as const;
type PricingToken = (typeof HELP_PRICING_TOKENS)[number];

/** Static placeholders — resolved from the shared constants the server itself reads. */
const STATIC_TOKENS: Readonly<Record<string, string>> = {
  holdMinutes: `${CHECKOUT_CLAIM_TTL_MINUTES} minutes`,
  occasionCount: String(SEEDED_OCCASION_COUNT),
  staleWindow: STALE_AUTHORIZED_CLAIM_HOURS === 24 ? "a day" : `${STALE_AUTHORIZED_CLAIM_HOURS} hours`,
};

function dollars(cents: number): string {
  const d = cents / 100;
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
}

function formatFreeUntil(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = months[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : null;
}

function pricingToken(token: PricingToken, p: HelpPricing): string | null {
  switch (token) {
    case "tripPassPrice": return Number.isFinite(p.tripPass?.priceCents) ? dollars(p.tripPass.priceCents) : null;
    case "plusPrice": return Number.isFinite(p.plusAnnual?.priceCents) ? dollars(p.plusAnnual.priceCents) : null;
    case "serviceFeePct": return Number.isFinite(p.serviceFeePct) ? `${p.serviceFeePct}%` : null;
    case "serviceFeeCap": return Number.isFinite(p.serviceFeeCapCents) ? dollars(p.serviceFeeCapCents) : null;
    case "aiTaskFee": return Number.isFinite(p.aiTaskCents) ? dollars(p.aiTaskCents) : null;
    case "proFreeUntil": return p.proMonthly?.betaFreeUntil ? formatFreeUntil(p.proMonthly.betaFreeUntil) : null;
  }
}

/**
 * Resolves an article sentence's placeholders. Returns NULL when the sentence needs a price that is
 * not known (pricing still loading, failed, or the field absent) — the caller omits the sentence and
 * points at Pricing instead. A sentence is never rendered with a guessed or default number (§13).
 */
export function resolveHelpText(text: string, pricing: HelpPricing | null): string | null {
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (name in STATIC_TOKENS) return STATIC_TOKENS[name];
    if ((HELP_PRICING_TOKENS as readonly string[]).includes(name)) {
      const v = pricing ? pricingToken(name as PricingToken, pricing) : null;
      if (v === null) missing = true;
      return v ?? whole;
    }
    missing = true; // an unknown placeholder is a bug, never printed raw
    return whole;
  });
  return missing ? null : out;
}

/**
 * Cross-references: `[[slug]]` in an article sentence names another article. It renders as that
 * article's title, linked to it (decision-maker, Sep 27, 2026: articles carry no visible number, so
 * "article 5" pointed at nothing). Placeholder resolution leaves these markers in place; the page
 * splits them with `helpTextParts`, and plain text (search, tests) reads the quoted title.
 */
export type HelpTextPart = string | { slug: HelpArticleSlug; title: string };

const ARTICLE_REF = /\[\[([a-z0-9-]+)\]\]/g;

export function helpTextParts(text: string): HelpTextPart[] {
  const parts: HelpTextPart[] = [];
  let last = 0;
  const re = new RegExp(ARTICLE_REF.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ref = m[1];
    const a = HELP_ARTICLES.find((x) => x.slug === ref);
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(a ? { slug: a.slug, title: a.title } : m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** The sentence as plain text: each cross-reference becomes the referenced title in quotes. */
export function helpPlainText(text: string): string {
  return helpTextParts(text).map((p) => (typeof p === "string" ? p : `"${p.title}"`)).join("");
}

/** Every `[[slug]]` an article's sentences name, in order. */
export function helpArticleRefs(a: HelpArticle): string[] {
  const texts = a.blocks.flatMap((b) => (b.kind === "p" ? [b.text] : b.kind === "list" ? b.items.map((i) => i.text) : []));
  const refs: string[] = [];
  for (const t of texts) {
    const re = new RegExp(ARTICLE_REF.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) refs.push(m[1]); // unknown slugs included, so a test can refuse them
  }
  return refs;
}

/** Whether a conditional block shows. With no pricing answer, neither variant shows (§13). */
export function helpConditionHolds(when: HelpCondition | undefined, pricing: HelpPricing | null): boolean {
  if (!when) return true;
  if (!pricing) return false;
  return when === "plusOnSale" ? pricing.plusSalesEnabled === true : pricing.plusSalesEnabled !== true;
}

/** Plain text for search: title, summary, keywords and every block, placeholders dropped. */
export function helpArticleSearchText(a: HelpArticle): string {
  const parts: string[] = [a.title, a.summary, ...a.keywords];
  for (const b of a.blocks) {
    if (b.kind === "p") parts.push(b.lead ?? "", b.text);
    else if (b.kind === "list") for (const i of b.items) parts.push(i.lead ?? "", i.text);
    else parts.push(b.text);
  }
  return helpPlainText(parts.join(" ")).replace(/\{\w+\}/g, " ").toLowerCase();
}

/** Articles whose searchable text contains every word of the query (case-insensitive). */
export function searchHelpArticles(query: string, articles: readonly HelpArticle[] = PUBLISHED_HELP_ARTICLES): HelpArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...articles];
  return articles.filter((a) => {
    const hay = helpArticleSearchText(a);
    return words.every((w) => hay.includes(w));
  });
}

const tierItems = CANCELLATION_POLICY_TYPES.map((p) => ({
  lead: CANCELLATION_SCHEDULE[p].name,
  text: cancellationTierSchedule(p),
}));

export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    slug: "how-planning-works",
    title: "How planning works",
    summary: "Start with an occasion and a place; we build a plan around one anchor.",
    keywords: ["plan", "occasion", "anchor", "draft", "finalize", "start"],
    blocks: [
      { kind: "p", text: "You start with two things: the occasion (a trip, a wedding, an anniversary dinner, one of {occasionCount}) and where in the world you want it. From that we create a plan built around one anchor: your hotel for a trip, the venue for an event, the table for an evening." },
      { kind: "p", text: "The plan is a list of days and items you can add to, move and remove. Our AI drafts the first version for free on an empty plan. A local expert can check it, add to it or take it over. When you're ready, you finalize the plan and book the items you want, either through us or on your own." },
    ],
  },
  {
    slug: "what-a-local-does",
    title: "What a local expert does (and doesn't)",
    summary: "What a local expert can review, suggest and offer — and what stays your choice.",
    keywords: ["local", "expert", "review", "suggest", "verified"],
    blocks: [
      { kind: "p", text: "A local expert lives in the city you're planning for. They can review your plan and tell you what to change, add their own suggestions, recommend one option over another when you're comparing, and offer their own experiences to book." },
      { kind: "p", text: "They can't change what you've purchased, and they don't choose for you: when you're comparing hotels or venues, the choice is yours. Experts are verified before they appear on Traveloure and are paid only for what they offer or deliver." },
    ],
  },
  {
    slug: "comparing-options",
    title: "Comparing hotels, venues and restaurants",
    summary: "Put up to three candidates side by side and see how each fits your plan.",
    keywords: ["compare", "comparison", "hotel", "venue", "restaurant", "candidates"],
    blocks: [
      { kind: "p", text: "Open a comparison on any slot in your plan and add up to three candidates. We show each one's fit to your plan: how far it is from everything else you've planned, by walking or transit, plus price, rating and cancellation terms." },
      { kind: "p", text: "Choose one and it becomes the item; the others are kept as candidates. You can't finalize a plan with an open comparison, and an item you've already booked can't be put into one." },
    ],
  },
  {
    slug: "free-vs-paid",
    title: "What's free and what's paid",
    summary: "Planning, the first AI draft and comparisons are free; optimization and further AI tasks are paid.",
    keywords: ["free", "paid", "cost", "optimization", "ai", "draft"],
    blocks: [
      { kind: "p", lead: "Free:", text: "creating a plan, the first AI draft on an empty plan, comparing options you've picked yourself, suggestions, and everything a local expert offers to review at no charge." },
      { kind: "p", lead: "Paid:", text: "an AI optimization run, which produces three complete versions of your plan (best value, least travel, best fit) that you can adopt in whole or part; a Trip Pass covers this. Additional AI tasks after the first draft are charged per task. Bookings are priced by the person offering them, and carry the service fee described in [[trip-pass-and-fees]]." },
    ],
  },
  {
    slug: "trip-pass-and-fees",
    title: "Trip Pass, Plus, and the service fee",
    summary: "What a Trip Pass covers, Plus and Pro, the booking service fee and its cap, and AI task fees.",
    keywords: ["trip pass", "plus", "pro", "service fee", "fee", "cap", "price", "ai task"],
    blocks: [
      { kind: "p", lead: "Trip Pass", text: "is bought once per trip and covers the AI optimization run, further AI tasks on that plan, and the service fee on bookings from that plan. Price: {tripPassPrice} per trip." },
      { kind: "p", lead: "Plus", text: "is an annual plan for people planning occasions through the year. Price: {plusPrice} per year.", when: "plusOnSale" },
      { kind: "p", lead: "Plus", text: "is an annual plan for people planning occasions through the year. Coming soon.", when: "plusNotOnSale" },
      { kind: "p", lead: "Pro", text: "is for local experts, planners and providers; it's free through {proFreeUntil}." },
      { kind: "p", lead: "Service fee:", text: "when you book through Traveloure, a service fee of {serviceFeePct} is added to the booking, capped at {serviceFeeCap} per booking. You see it on your plan and in the cart before you pay. Trip Pass holders don't pay the service fee on bookings from the plan the pass covers." },
      { kind: "p", lead: "AI task fee:", text: "after the free first draft, each further AI task on a plan is {aiTaskFee}, shown before you confirm." },
    ],
  },
  {
    slug: "booking-through-us",
    title: "Booking through Traveloure vs. on your own",
    summary: "One checkout, our terms and a booking your expert can see — or book elsewhere and keep the item on your plan.",
    keywords: ["book", "booking", "checkout", "elsewhere", "back to plan"],
    blocks: [
      { kind: "p", text: "Every item on your plan can be booked through Traveloure or noted as booked elsewhere. Booking through us means one checkout, the service fee described in [[trip-pass-and-fees]], our cancellation terms in [[cancellations-and-refunds]], and a booking a local expert can see and act on." },
      { kind: "p", text: "Booking on your own means none of that, and the item still sits in your plan so the schedule stays right. Some items can't be booked through us yet (a listing without a published price, or one that needs the provider to accept first); those show \"Back to plan\" instead of a checkout." },
    ],
  },
  {
    slug: "cancellations-and-refunds",
    title: "Cancellations and refunds",
    summary: "How much you get back depends on the service's policy and how long before the start you cancel.",
    keywords: ["cancel", "cancellation", "refund", "flexible", "moderate", "strict", "non-refundable"],
    blocks: [
      { kind: "p", text: "Each service shows its cancellation policy before you book. When you cancel, the refund depends on that policy and how long remains before the scheduled start:" },
      { kind: "list", items: tierItems },
      { kind: "p", text: "The percentage applies to the amount charged, including Traveloure's service fee, refunded at the same rate as the booking. Payment-processing costs are never deducted. Fees your bank charges (foreign transaction, currency conversion) aren't charged by us and aren't refunded by us. If the expert or provider cancels, you're refunded in full." },
      { kind: "p", text: "The cancellation screen shows the exact amount before you confirm, and it is the amount you receive. Refunds go to the original payment method and usually appear within 5–10 business days." },
    ],
  },
  {
    slug: "payment-didnt-go-through",
    title: "Payment didn't go through",
    summary: "What happens when a card is declined or checkout is left unfinished, and how to try again.",
    keywords: ["payment", "declined", "failed", "card", "try again", "hold", "checkout", "apple pay", "google pay", "link", "paypal", "wallet"],
    blocks: [
      { kind: "p", text: "If your card is declined, the booking isn't made and the item shows \"Payment didn't go through.\" Tap Try again to put it back in your cart and check out with a new payment; the declined attempt is cancelled so it can't charge you later." },
      { kind: "p", text: "If you leave checkout without paying, we release the hold after {holdMinutes} and the item goes back to your plan unbooked. If a payment was started but never completed, we check with your bank and clear it within {staleWindow}, and we'll email you if the item was released." },
      { kind: "p", text: "If a declined payment somehow goes through afterwards, we refund it automatically and tell you. Items that can't be booked through checkout show \"Back to plan\" instead." },
      // LD 43(e): the payment-methods answer moved here from the retired /faq page, word for word —
      // wallets are offered "where your device and browser support them", and PayPal is not claimed.
      { kind: "p", lead: "Which payment methods can I use?", text: "We accept card payments (Visa, Mastercard, American Express and other major cards), processed by Stripe. Apple Pay, Google Pay and Link are also offered in the Stripe payment sheet where your device and browser support them. We don't accept PayPal." },
    ],
  },
  {
    slug: "disputes-and-under-review",
    title: "\"Under review\" and disputes",
    summary: "What \"Under review\" means while a bank dispute is open, and why contacting us first is faster.",
    keywords: ["dispute", "under review", "chargeback", "bank", "refunded"],
    blocks: [
      { kind: "p", text: "If you dispute a charge with your bank, the booking shows Under review while the dispute is open. Money is held; the booking still exists until the dispute closes. If the dispute is decided in your favour, the booking shows Dispute closed – refunded to you." },
      { kind: "p", text: "If you have a problem with a booking, contacting us first is faster than a bank dispute, and a booking we've already refunded or cancelled can't be disputed again." },
    ],
  },
  {
    slug: "become-a-local-expert",
    title: "Becoming a local expert",
    summary: "Offer what you know about your city: review plans, suggest changes, sell your own experiences.",
    keywords: ["become", "expert", "local", "earn", "apply", "pro"],
    blocks: [
      { kind: "p", text: "If you live in one of our cities, you can offer what you know: reviewing travelers' plans, suggesting what to change, and selling your own experiences. You set your prices and availability. We verify you before you appear, and you're paid through Stripe when what you offer is delivered." },
      { kind: "p", text: "Pro is free through {proFreeUntil}." },
      { kind: "link", text: "Become a local expert", href: "/earn?role=local_expert" },
    ],
  },
];

export type ResolvedHelpBlock =
  | { kind: "p"; text: string; lead?: string }
  | { kind: "list"; items: ReadonlyArray<{ lead?: string; text: string }> }
  | { kind: "link"; text: string; href: string };

/**
 * The article as it renders for a given pricing answer (null = loading / failed / unknown).
 * `pricingOmitted` is true when at least one sentence was left out for want of a price — the page
 * then says "see Pricing" once, in place of the missing numbers.
 */
export function resolveHelpArticle(
  article: HelpArticle,
  pricing: HelpPricing | null,
): { blocks: ResolvedHelpBlock[]; pricingOmitted: boolean } {
  const blocks: ResolvedHelpBlock[] = [];
  let pricingOmitted = false;
  for (const b of article.blocks) {
    if (b.kind === "p") {
      if (b.when && !pricing) { pricingOmitted = true; continue; }
      if (!helpConditionHolds(b.when, pricing)) continue;
      const text = resolveHelpText(b.text, pricing);
      if (text === null) { pricingOmitted = true; continue; }
      blocks.push({ kind: "p", text, lead: b.lead });
    } else if (b.kind === "list") {
      const items: Array<{ lead?: string; text: string }> = [];
      for (const i of b.items) {
        const text = resolveHelpText(i.text, pricing);
        if (text === null) { pricingOmitted = true; continue; }
        items.push({ lead: i.lead, text });
      }
      if (items.length > 0) blocks.push({ kind: "list", items });
    } else {
      blocks.push(b);
    }
  }
  return { blocks, pricingOmitted };
}

/** Any article, held or not — for tests and tooling. Pages use `getPublishedHelpArticle`. */
export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

/** The articles a visitor can see: listed, searchable, in the sitemap, routable. */
export const PUBLISHED_HELP_ARTICLES: readonly HelpArticle[] = HELP_ARTICLES.filter((a) => isHelpArticlePublished(a.slug));

/** A published article, or undefined for an unknown OR held slug (the page answers "not found"). */
export function getPublishedHelpArticle(slug: string): HelpArticle | undefined {
  return PUBLISHED_HELP_ARTICLES.find((a) => a.slug === slug);
}
