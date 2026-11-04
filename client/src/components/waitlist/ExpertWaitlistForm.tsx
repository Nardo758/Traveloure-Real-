// WL-B screen (ledger `2026-10-30-wlb-provider-signup-screen`): the waitlist page's expert application (`/kyoto#experts`).
// Its own file so the page keeps its three reads and its two traveler/provider forms; it reuses the page's shared
// consent boxes, honeypot and one POST helper (render-time imports only).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WAITLIST_EMAIL_ERROR, WAITLIST_MARKET_OPTIONS, waitlistCityName } from "@shared/launch-waitlist";
import { KEEP_RATES_ENDPOINT, type PublicKeepRates } from "@/lib/fee-keep-copy";
import {
  EMPTY_EXPERT_DRAFT,
  WLB_SIGNUP_COPY,
  expertApplicationBody,
  expertApplicationReady,
  expertKeepLine,
  type ExpertApplicationDraft,
} from "@/lib/wlb-signup-copy";
import { ConsentBoxes, EMAIL_SHAPE, Honeypot, marketingBoxOpen, postWaitlist } from "@/pages/launch-waitlist";
import { LIVE_MARKETS_ROUTE } from "@shared/live-markets";
import { WaitlistMarketChips } from "@/components/waitlist/WaitlistMarkets";
import { statusSettingsFrom } from "@/lib/waitlist-markets";

type Status = "idle" | "sending" | "done" | "error";

/** The section's form, with the keep rate read from the server (admin config). */
export function ExpertWaitlistForm({ source, launchMarket }: { source: string | null; launchMarket: string }) {
  const { data } = useQuery<PublicKeepRates>({ queryKey: [KEEP_RATES_ENDPOINT], retry: false });
  const { data: liveMarkets } = useQuery<unknown>({ queryKey: [LIVE_MARKETS_ROUTE], retry: false });
  return <ExpertForm source={source} launchMarket={launchMarket} keepRates={data ?? null} statusAnswer={liveMarkets} />;
}

/**
 * WL-B (ledger `2026-10-30-wlb-provider-signup-screen`): the expert application, at `#experts`, where a refused expert
 * sign-up is sent. Posts role "expert" to the same `/api/waitlist`. The keep rate is the server's (admin config); an
 * unreadable rate leaves that sentence out.
 */
export function ExpertForm({
  source,
  launchMarket,
  keepRates,
  statusAnswer,
}: {
  source: string | null;
  launchMarket: string;
  keepRates: PublicKeepRates | null;
  statusAnswer?: unknown;
}) {
  const [draft, setDraft] = useState<ExpertApplicationDraft>(EMPTY_EXPERT_DRAFT);
  // The consent words and the subline follow the picked city; before a pick, the launch market's.
  const market = draft.market || launchMarket;
  // WAIT-1: "City you know best" stays the one select; the chips add any other markets to join for.
  const [extraMarkets, setExtraMarkets] = useState<string[]>([]);
  const markets = [market, ...extraMarkets.filter((m) => m !== market)];
  const [consent, setConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const marketingOpen = marketingBoxOpen(market);
  const [homepage, setHomepage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ name: string; email: string } | null>(null);
  const set = (k: keyof ExpertApplicationDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_SHAPE.test(draft.email.trim())) {
      setError(WAITLIST_EMAIL_ERROR);
      return;
    }
    if (!expertApplicationReady(draft)) return;
    setStatus("sending");
    setError(null);
    const r = await postWaitlist({
      ...expertApplicationBody(draft),
      ...(markets.length > 1 ? { markets } : {}),
      consent,
      marketingConsent: marketingOpen && marketingConsent,
      ...(source ? { source } : {}),
      ...(homepage ? { homepage } : {}),
    });
    if (!r.ok) {
      setStatus("error");
      setError(r.error ?? WAITLIST_EMAIL_ERROR);
      return;
    }
    setSent({ name: draft.contactName.trim(), email: draft.email.trim() });
    setStatus("done");
  }

  if (status === "done" && sent) {
    return (
      <div className="mt-6 space-y-2" role="status" data-testid="text-expert-waitlist-done">
        <h3 className="text-lg font-semibold">{WLB_SIGNUP_COPY.expertDoneHeading}</h3>
        <p>{WLB_SIGNUP_COPY.expertDoneBody(sent.name, sent.email)} {WLB_SIGNUP_COPY.expertPayouts}</p>
      </div>
    );
  }

  const keep = expertKeepLine(keepRates);
  return (
    <form className="mt-6 space-y-5" onSubmit={submit} data-testid="form-expert-waitlist">
      <p className="text-muted-foreground" data-testid="text-expert-subline">
        {WLB_SIGNUP_COPY.expertSublineLead(waitlistCityName(market) ?? market)}
        {keep ? ` ${keep}` : ""}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="expert-name">{WLB_SIGNUP_COPY.expertName}</Label>
        <Input id="expert-name" required autoComplete="name" value={draft.contactName} onChange={set("contactName")} data-testid="input-expert-name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="expert-email">{WLB_SIGNUP_COPY.expertEmail}</Label>
        <Input id="expert-email" type="email" required autoComplete="email" value={draft.email} onChange={set("email")}
          aria-invalid={error ? true : undefined} data-testid="input-expert-email" />
        {error && <p role="alert" className="text-sm text-destructive" data-testid="text-expert-waitlist-error">{error}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="expert-city">{WLB_SIGNUP_COPY.expertCity}</Label>
        <select
          id="expert-city"
          required
          value={draft.market}
          onChange={set("market")}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="input-expert-city"
        >
          <option value="" />
          {WAITLIST_MARKET_OPTIONS.map((m) => (
            <option key={m.key} value={m.key}>{m.city}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="expert-languages">{WLB_SIGNUP_COPY.expertLanguages}</Label>
        <Input id="expert-languages" maxLength={200} value={draft.languages} onChange={set("languages")} data-testid="input-expert-languages" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="expert-link">{WLB_SIGNUP_COPY.expertLink}</Label>
        <Input id="expert-link" type="url" maxLength={200} value={draft.link} onChange={set("link")} data-testid="input-expert-link" />
      </div>
      <WaitlistMarketChips
        idPrefix="expert"
        selected={markets}
        onChange={(next) => setExtraMarkets(next.filter((m) => m !== market))}
        settings={statusSettingsFrom(statusAnswer)}
      />
      <Honeypot id="expert-homepage" value={homepage} onChange={setHomepage} />
      <ConsentBoxes
        role="expert"
        market={market}
        markets={markets}
        consent={consent}
        onConsent={setConsent}
        marketingConsent={marketingConsent}
        onMarketingConsent={setMarketingConsent}
        marketingOpen={marketingOpen}
      />
      <Button type="submit" disabled={status === "sending" || !expertApplicationReady(draft)} data-testid="button-expert-waitlist-send">
        {WLB_SIGNUP_COPY.expertSubmit}
      </Button>
    </form>
  );
}

