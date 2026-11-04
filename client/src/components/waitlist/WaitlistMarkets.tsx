/**
 * WAIT-1 (ledger `2026-11-04-wait1-all-markets`): the waitlist's market pieces — the market chips (one or more
 * markets per sign-up, each labelled with its status from settings), the three-column sign-up row, and the page for
 * a market that is not the marquee. Words are HELD for "Wording approved — Leon".
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { marketStatus, marketStatusLabel, type MarketStatusSettings } from "@shared/ticker";
import { KEEP_RATES_ENDPOINT, expertKeepLine, providerKeepLine, type PublicKeepRates } from "@/lib/fee-keep-copy";
import { WAITLIST_SIGNUP_ROW_COPY, becomeProviderHref, toggleWaitlistMarket } from "@/lib/waitlist-markets";

/** The market chips: every operating market with its status label; the page's market is pre-ticked by the form. */
export function WaitlistMarketChips({
  idPrefix,
  selected,
  onChange,
  settings,
}: {
  idPrefix: string;
  selected: readonly string[];
  onChange: (next: string[]) => void;
  settings: MarketStatusSettings;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Cities" data-testid={`chips-${idPrefix}-markets`}>
      {OPERATING_MARKETS.map((m) => {
        const on = selected.includes(m.marketKey);
        return (
          <button
            key={m.marketKey}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(toggleWaitlistMarket(selected, m.marketKey))}
            className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-primary bg-primary/10" : ""}`}
            data-testid={`chip-${idPrefix}-market-${m.marketKey}`}
          >
            {m.cityName}
            <span className="ml-1.5 text-xs text-muted-foreground" data-testid={`text-${idPrefix}-market-status-${m.marketKey}`}>
              {marketStatusLabel(m.marketKey, settings)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The three sign-up types side by side, stacking under 640px. Experts and providers show the keep line from the
 * server's rates (admin config, never a typed number); travelers have no money line.
 */
export function WaitlistSignupRow({ market, cityName, keepRates }: { market: string; cityName: string; keepRates: PublicKeepRates | null }) {
  const c = WAITLIST_SIGNUP_ROW_COPY;
  const expertKeep = expertKeepLine(keepRates);
  const providerKeep = providerKeepLine(keepRates);
  return (
    <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="section-waitlist-signup-row">
      <div className="rounded-lg border p-4" data-testid="signup-col-traveler">
        <a href="#join" className="text-lg font-semibold underline" data-testid="link-signup-traveler">{c.travelersHeading}</a>
        <p className="mt-2 text-sm text-muted-foreground">{c.travelersLine(cityName)}</p>
      </div>
      <div className="rounded-lg border p-4" data-testid="signup-col-expert">
        <a href="#experts" className="text-lg font-semibold underline" data-testid="link-signup-expert">{c.expertsHeading}</a>
        <p className="mt-2 text-sm text-muted-foreground">{c.expertsLine}</p>
        {expertKeep && <p className="mt-2 text-sm" data-testid="text-signup-expert-keep">{expertKeep}</p>}
      </div>
      <div className="rounded-lg border p-4" data-testid="signup-col-provider">
        <Link href={becomeProviderHref(market)} className="text-lg font-semibold underline" data-testid="link-signup-provider">{c.providersHeading}</Link>
        <p className="mt-2 text-sm text-muted-foreground">{c.providersLine}</p>
        {providerKeep && <p className="mt-2 text-sm" data-testid="text-signup-provider-keep">{providerKeep}</p>}
      </div>
    </section>
  );
}

/** The sign-up row with the keep rates read from the server (admin config). */
export function WaitlistSignupRowLive({ market, cityName }: { market: string; cityName: string }) {
  const { data } = useQuery<PublicKeepRates>({ queryKey: [KEEP_RATES_ENDPOINT], retry: false });
  return <WaitlistSignupRow market={market} cityName={cityName} keepRates={data ?? null} />;
}

/**
 * The header for a market that is not the marquee: the city, its status from settings, and the sign-up row. No
 * listings, no sample items — nothing about the city is claimed beyond its status.
 */
export function OtherMarketWaitlistHeader({
  market,
  cityName,
  settings,
  keepRates,
}: {
  market: string;
  cityName: string;
  settings: MarketStatusSettings;
  /** Given in tests; absent ⇒ read from the server. */
  keepRates?: PublicKeepRates | null;
}) {
  return (
    <header data-testid={`waitlist-market-${market}`}>
      <h1 className="text-3xl font-bold sm:text-4xl" data-testid="heading-waitlist-market">{cityName}</h1>
      <p className="mt-3 inline-block rounded-full border px-3 py-1 text-sm" data-testid="text-waitlist-market-status" data-status={marketStatus(market, settings)}>
        {marketStatusLabel(market, settings)}
      </p>
      {keepRates === undefined ? (
        <WaitlistSignupRowLive market={market} cityName={cityName} />
      ) : (
        <WaitlistSignupRow market={market} cityName={cityName} keepRates={keepRates} />
      )}
    </header>
  );
}
