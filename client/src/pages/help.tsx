import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SEOHead } from "@/components/seo-head";
import { CompanyPage, CompanySection, FRAUNCES } from "@/components/company/company-page";
import { COMPANY_CONTACT_EMAIL } from "@/lib/company-facts";
import {
  PUBLISHED_HELP_ARTICLES,
  getPublishedHelpArticle,
  helpArticlePath,
  resolveHelpArticle,
  searchHelpArticles,
  type HelpPricing,
} from "@shared/help-articles";

/**
 * /help and /help/:slug — the Help center (Lane B, decision-maker approved Sep 27, 2026).
 *
 * Articles are the static module `shared/help-articles.ts`; this page only renders them. Prices come
 * from the live `GET /api/pricing` read the Pricing page uses: while it is loading or has failed, a
 * sentence that needs a price is omitted and the article points at Pricing instead — it never prints
 * a default number (§13, §8).
 *
 * The earlier inline FAQ accordion is gone: it claimed card-only payments (wallets are live, LD 43),
 * said there was "no single platform-wide window" for cancellations (there are four platform tiers),
 * and sent people to a "Become an Expert" page that does not exist. `/faq` now redirects here.
 */

function usePricing(): HelpPricing | null {
  const { data } = useQuery<HelpPricing>({ queryKey: ["/api/pricing"], staleTime: 5 * 60_000 });
  return data ?? null;
}

function ContactCard() {
  return (
    <CompanySection title="Still stuck?" testId="section-help-contact">
      <p>
        Write to{" "}
        <a href={`mailto:${COMPANY_CONTACT_EMAIL}`} className="underline underline-offset-2" data-testid="link-help-email">
          {COMPANY_CONTACT_EMAIL}
        </a>{" "}
        or use the{" "}
        <Link href="/contact" className="underline underline-offset-2" data-testid="link-help-contact">
          contact form
        </Link>
        .
      </p>
    </CompanySection>
  );
}

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHelpArticles(query), [query]);

  return (
    <>
      <SEOHead
        title="Help center"
        description="How planning works, fees and Trip Pass, cancellations and refunds, payments, disputes, and becoming a local expert."
        url="/help"
        noindex={query.trim().length > 0}
      />
      <CompanyPage eyebrow="Help center" title="How can we help?" testId="page-help">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--earn-muted)" }} aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help articles"
            aria-label="Search help articles"
            className="h-11 bg-white pl-9"
            data-testid="input-help-search"
          />
        </div>

        <section aria-label="Help articles">
          {results.length === 0 ? (
            <p style={{ color: "var(--earn-muted)" }} data-testid="text-help-no-results">
              No article matches "{query.trim()}". Try another word, or contact us below.
            </p>
          ) : (
            <ol className="divide-y rounded-xl border bg-white" style={{ borderColor: "var(--earn-border)" }}>
              {results.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={helpArticlePath(a.slug)}
                    className="block px-5 py-4 transition-colors hover:bg-[color:var(--earn-chip)]"
                    data-testid={`link-help-article-${a.slug}`}
                  >
                    <span className="block text-[16px] font-semibold" style={{ color: "var(--earn-navy)" }}>{a.title}</span>
                    <span className="mt-0.5 block text-sm" style={{ color: "var(--earn-muted)" }}>{a.summary}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <ContactCard />
      </CompanyPage>
    </>
  );
}

export function HelpArticlePage() {
  const params = useParams<{ slug: string }>();
  // A held article (its feature is not on `main` yet) answers exactly like an unknown slug.
  const article = getPublishedHelpArticle(params.slug ?? "");
  const pricing = usePricing();

  if (!article) {
    return (
      <>
        <SEOHead title="Help article not found" url="/help" noindex />
        <CompanyPage eyebrow="Help center" title="We couldn't find that article" testId="page-help-article-missing">
          <p>
            <Link href="/help" className="underline underline-offset-2" data-testid="link-help-back">
              See all help articles
            </Link>
          </p>
        </CompanyPage>
      </>
    );
  }

  const { blocks, pricingOmitted } = resolveHelpArticle(article, pricing);
  const index = PUBLISHED_HELP_ARTICLES.findIndex((a) => a.slug === article.slug);
  const next = PUBLISHED_HELP_ARTICLES[index + 1];

  return (
    <>
      <SEOHead title={article.title} description={article.summary} url={helpArticlePath(article.slug)} type="article" />
      <CompanyPage eyebrow="Help center" title={article.title} testId={`page-help-article-${article.slug}`}>
        <article className="space-y-4 text-[15.5px] leading-relaxed" style={{ color: "var(--earn-ink)" }}>
          {blocks.map((b, i) => {
            if (b.kind === "p") {
              return (
                <p key={i}>
                  {b.lead && <strong>{b.lead} </strong>}
                  {b.text}
                </p>
              );
            }
            if (b.kind === "list") {
              return (
                <ul key={i} className="list-disc space-y-1.5 pl-5">
                  {b.items.map((it, j) => (
                    <li key={j}>
                      {it.lead && <strong>{it.lead}: </strong>}
                      {it.text}
                    </li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i}>
                <Link href={b.href} className="font-semibold underline underline-offset-2">{b.text} →</Link>
              </p>
            );
          })}
          {pricingOmitted && (
            <p data-testid="text-help-see-pricing">
              Current prices are on the{" "}
              <Link href="/pricing" className="underline underline-offset-2">Pricing</Link> page.
            </p>
          )}
        </article>

        <nav className="flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm" style={{ borderColor: "var(--earn-border)" }}>
          <Link href="/help" className="underline underline-offset-2" data-testid="link-help-all">← All help articles</Link>
          {next && (
            <Link href={helpArticlePath(next.slug)} className="underline underline-offset-2" style={{ fontFamily: FRAUNCES }}>
              Next: {next.title} →
            </Link>
          )}
        </nav>

        <ContactCard />
      </CompanyPage>
    </>
  );
}
