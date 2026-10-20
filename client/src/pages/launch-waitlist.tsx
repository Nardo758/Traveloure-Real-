// LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch market's waitlist page (`/kyoto`).
//
// Every visible word is Marketing's F1 copy (hand-off Part F), word for word; the blocked line is answer 7 and the
// supply link label is answer 8. The editor notes, the field mapping and the image briefs are never rendered (no
// licensed image exists yet, so the page carries none). Both forms post to POST /api/waitlist: the traveler form
// (email, the OPT-IN consent tick — never required, Launch ruling 1 — trip type, rough month, worry) and the
// provider form (name, business name, email, type of service, the same tick). The source comes from this page's
// own URL, checked against the allowlist pattern; a hidden honeypot rides along. The answer is the same whether or
// not the address was already on the list.
// LW-2 (ledger `2026-10-16-lw2-all-markets-waitlist`): under each form, "Planning somewhere else? Tell us where." —
// ONE city per submission, from `OPERATING_MARKETS`, defaulting to the launch market (Kyoto). The Kyoto words are
// unchanged; another city's tick, button and thank-you name that city and promise only an email when it opens.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SEOHead } from "@/components/seo-head";
import {
  WAITLIST_CONSENT_PRIVACY_LINK,
  WAITLIST_EMAIL_ERROR,
  WAITLIST_MARKET_OPTIONS,
  WAITLIST_OTHER_CITY_PROMPT,
  waitlistCityName,
  waitlistConsentLine,
  waitlistOtherCityDone,
  waitlistOtherCityJoinButton,
  waitlistOtherCityProviderDone,
  waitlistOtherCityProviderLine,
  WAITLIST_SERVICE_TYPES,
  WAITLIST_TRIP_TYPES,
  WAITLIST_WORRY_MAX,
  type WaitlistServiceType,
  type WaitlistTripType,
} from "@shared/launch-waitlist";
import { TRAVELER_WAITLIST_BUTTON, TRAVELER_WAITLIST_MESSAGE } from "@shared/launch-signup";
import { waitlistSourceFromSearch, type SignupModeView } from "@/lib/launch-waitlist-view";
import { arrivalRef } from "@/lib/ready-made-waitlist";
import { getAcquisitionRef } from "@/lib/acquisition";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Status = "idle" | "sending" | "done" | "error";

async function postWaitlist(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: typeof data?.error === "string" ? data.error : WAITLIST_EMAIL_ERROR };
  } catch {
    return { ok: false, error: WAITLIST_EMAIL_ERROR };
  }
}

function Honeypot({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  // Hidden from people and from assistive technology; a bot that fills it is answered as a success.
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
      <label htmlFor={id}>Homepage</label>
      <input id={id} name="homepage" type="text" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ConsentTick({ id, market, checked, onChange }: { id: string; market: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} data-testid={`checkbox-${id}`} />
      <div className="text-sm leading-snug">
        <Label htmlFor={id} className="font-normal" data-testid={`label-${id}`}>{waitlistConsentLine(market)}</Label>{" "}
        {WAITLIST_CONSENT_PRIVACY_LINK.before}
        <Link href={WAITLIST_CONSENT_PRIVACY_LINK.href} className="underline">{WAITLIST_CONSENT_PRIVACY_LINK.label}</Link>
        {WAITLIST_CONSENT_PRIVACY_LINK.after}
      </div>
    </div>
  );
}

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/** LW-2: the one city this submission is for. A single select — never several cities in one submission. */
function CityPicker({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{WAITLIST_OTHER_CITY_PROMPT}</Label>
      <select id={id} className={`${selectClass} block`} value={value} onChange={(e) => onChange(e.target.value)} data-testid={`select-${id}`}>
        {WAITLIST_MARKET_OPTIONS.map((m) => (
          <option key={m.key} value={m.key}>{m.city}</option>
        ))}
      </select>
    </div>
  );
}

function TravelerForm({ source, refCode, launchMarket }: { source: string | null; refCode: string | null; launchMarket: string }) {
  const [market, setMarket] = useState(launchMarket);
  const isLaunch = market === launchMarket;
  const city = waitlistCityName(market) ?? market;
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [tripType, setTripType] = useState<WaitlistTripType | "">("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [worry, setWorry] = useState("");
  const [homepage, setHomepage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear + 1, thisYear + 2];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_SHAPE.test(email.trim())) {
      setError(WAITLIST_EMAIL_ERROR);
      return;
    }
    setStatus("sending");
    setError(null);
    const r = await postWaitlist({
      role: "traveler",
      email: email.trim(),
      market,
      consent,
      ...(source ? { source } : {}),
      ...(refCode ? { ref: refCode } : {}),
      ...(tripType ? { tripType } : {}),
      ...(month && year ? { roughMonth: `${year}-${month}` } : {}),
      ...(worry.trim() ? { worry: worry.trim() } : {}),
      ...(homepage ? { homepage } : {}),
    });
    if (!r.ok) {
      setStatus("error");
      setError(r.error ?? WAITLIST_EMAIL_ERROR);
      return;
    }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <p className="mt-6 rounded-lg border p-4" role="status" data-testid="text-waitlist-done">
        {isLaunch
          ? "You're on the Kyoto waitlist. Thanks for telling us about your trip. If you ticked the box, we'll email you when Traveloure opens for Kyoto."
          : waitlistOtherCityDone(city, consent)}
      </p>
    );
  }

  return (
    <form className="mt-6 space-y-5" onSubmit={submit} noValidate data-testid="form-waitlist">
      <div className="space-y-1.5">
        <Label htmlFor="waitlist-email">Email</Label>
        <Input
          id="waitlist-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          data-testid="input-waitlist-email"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="text-waitlist-error">{error}</p>
        )}
      </div>
      <Honeypot id="waitlist-homepage" value={homepage} onChange={setHomepage} />
      <ConsentTick id="waitlist-consent" market={market} checked={consent} onChange={setConsent} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What's the trip for?</legend>
        <div className="flex flex-wrap gap-2">
          {WAITLIST_TRIP_TYPES.map((t) => (
            <label
              key={t.key}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${tripType === t.key ? "border-primary bg-primary/10" : ""}`}
            >
              <input
                type="radio"
                name="tripType"
                value={t.key}
                className="sr-only"
                checked={tripType === t.key}
                onChange={() => setTripType(t.key)}
                data-testid={`radio-trip-type-${t.key}`}
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Rough dates (optional)</legend>
        <div className="flex gap-2">
          <select aria-label="Month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)} data-testid="select-waitlist-month">
            <option value="">—</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
            ))}
          </select>
          <select aria-label="Year" className={selectClass} value={year} onChange={(e) => setYear(e.target.value)} data-testid="select-waitlist-year">
            <option value="">—</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-muted-foreground">Month and year is plenty.</p>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="waitlist-worry">What worries you most about planning it?</Label>
        <Textarea
          id="waitlist-worry"
          placeholder="Anything, big or small."
          maxLength={WAITLIST_WORRY_MAX}
          value={worry}
          onChange={(e) => setWorry(e.target.value)}
          data-testid="input-waitlist-worry"
        />
      </div>
      <CityPicker id="waitlist-city" value={market} onChange={setMarket} />
      <Button type="submit" disabled={status === "sending"} data-testid="button-waitlist-join">
        {isLaunch ? "Join the Kyoto waitlist" : waitlistOtherCityJoinButton(city)}
      </Button>
    </form>
  );
}

function ProviderForm({ source, refCode, launchMarket }: { source: string | null; refCode: string | null; launchMarket: string }) {
  const [market, setMarket] = useState(launchMarket);
  const isLaunch = market === launchMarket;
  const city = waitlistCityName(market) ?? market;
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [serviceType, setServiceType] = useState<WaitlistServiceType | "">("");
  const [consent, setConsent] = useState(false);
  const [homepage, setHomepage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_SHAPE.test(email.trim())) {
      setError(WAITLIST_EMAIL_ERROR);
      return;
    }
    if (!contactName.trim() || !serviceType) return;
    setStatus("sending");
    setError(null);
    const r = await postWaitlist({
      role: "provider",
      email: email.trim(),
      market,
      consent,
      contactName: contactName.trim(),
      ...(businessName.trim() ? { businessName: businessName.trim() } : {}),
      serviceType,
      ...(source ? { source } : {}),
      ...(refCode ? { ref: refCode } : {}),
      ...(homepage ? { homepage } : {}),
    });
    if (!r.ok) {
      setStatus("error");
      setError(r.error ?? WAITLIST_EMAIL_ERROR);
      return;
    }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <p className="mt-6 rounded-lg border p-4" role="status" data-testid="text-provider-waitlist-done">
        {isLaunch
          ? "Thanks, we've got your details. We'll be in touch about joining Traveloure in Kyoto."
          : waitlistOtherCityProviderDone(city)}
      </p>
    );
  }

  return (
    <form className="mt-6 space-y-5" onSubmit={submit} data-testid="form-provider-waitlist">
      <div className="space-y-1.5">
        <Label htmlFor="provider-name">Your name</Label>
        <Input id="provider-name" required autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} data-testid="input-provider-name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="provider-business">Business name (if any)</Label>
        <Input id="provider-business" autoComplete="organization" value={businessName} onChange={(e) => setBusinessName(e.target.value)} data-testid="input-provider-business" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="provider-email">Email</Label>
        <Input
          id="provider-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          data-testid="input-provider-email"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="text-provider-waitlist-error">{error}</p>
        )}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Type of service</legend>
        <div className="flex flex-wrap gap-2">
          {WAITLIST_SERVICE_TYPES.map((t) => (
            <label
              key={t.key}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${serviceType === t.key ? "border-primary bg-primary/10" : ""}`}
            >
              <input
                type="radio"
                name="serviceType"
                value={t.key}
                required
                className="sr-only"
                checked={serviceType === t.key}
                onChange={() => setServiceType(t.key)}
                data-testid={`radio-service-type-${t.key}`}
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Honeypot id="provider-homepage" value={homepage} onChange={setHomepage} />
      <ConsentTick id="provider-consent" market={market} checked={consent} onChange={setConsent} />
      <CityPicker id="provider-city" value={market} onChange={setMarket} />
      {!isLaunch && (
        <p className="text-sm text-muted-foreground" data-testid="text-provider-other-city">{waitlistOtherCityProviderLine(city)}</p>
      )}
      <Button type="submit" disabled={status === "sending"} data-testid="button-provider-waitlist-send">
        Send my details
      </Button>
    </form>
  );
}

/** The expert section draws only when a public Kyoto expert list has someone. Loading, an error and [] hide it. */
export function kyotoExpertsSectionVisible(data: unknown, isSuccess: boolean): boolean {
  return isSuccess && Array.isArray(data) && data.length > 0;
}

export default function LaunchWaitlistPage() {
  const { data: signup } = useQuery<SignupModeView>({ queryKey: ["/api/public/signup-mode"], retry: false });
  const { data: kyotoExperts, isSuccess: kyotoExpertsLoaded } = useQuery<unknown>({
    queryKey: ["/api/experts", "kyoto-public"],
    queryFn: async () => {
      const res = await fetch("/api/experts?location=Kyoto");
      if (!res.ok) throw new Error("Failed to fetch Kyoto experts");
      return res.json();
    },
    retry: false,
  });
  const showKyotoExperts = kyotoExpertsSectionVisible(kyotoExperts, kyotoExpertsLoaded);
  const { source, blocked } = waitlistSourceFromSearch(window.location.search, signup?.launchMarketSlug ?? null);
  // LW-1d: the raw short-link code the visitor arrived with (this page's ?ref=, else the session's). The server
  // decides any credit; the page never names a referrer.
  const refCode = arrivalRef(window.location.search, getAcquisitionRef());
  // LW-2: the picker's default is the launch market (Kyoto); until the setting has loaded, the first operating market.
  const launchMarket =
    signup?.launchMarketSlug && waitlistCityName(signup.launchMarketSlug) ? signup.launchMarketSlug : WAITLIST_MARKET_OPTIONS[0].key;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12" data-testid="page-launch-waitlist">
      <SEOHead
        title="Kyoto Trip Planning with Local Experts"
        description="Closed days, last entry, crowds: plan Kyoto around the days that don't work. Join the Traveloure waitlist and be first to book when Kyoto opens."
        ogTitle="Kyoto's autumn, planned to work on the day."
        url="/kyoto"
      />

      {blocked && (
        <div className="mb-8 rounded-lg border p-4" role="status" data-testid="text-waitlist-blocked">
          <p className="text-sm">{TRAVELER_WAITLIST_MESSAGE}</p>
          <Button asChild size="sm" className="mt-3">
            <a href="#join" data-testid="button-waitlist-blocked-join">{TRAVELER_WAITLIST_BUTTON}</a>
          </Button>
        </div>
      )}

      <header>
        <h1 className="text-3xl font-bold sm:text-4xl" data-testid="heading-waitlist">
          Kyoto's autumn, planned to work on the day.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Closed days, last entry, crowds. Most Kyoto plans break on a detail you can't see from home. Traveloure is bringing local experts to catch the days that don't work, before you fly.
        </p>
        <div className="mt-6">
          <Button asChild size="lg">
            <a href="#join" data-testid="button-waitlist-hero">Join the Kyoto waitlist</a>
          </Button>
          <p className="mt-2 text-sm text-muted-foreground">Be first to book when Kyoto opens.</p>
        </div>
        <p className="mt-6 text-sm">
          <a href="#providers" className="underline" data-testid="link-waitlist-providers">I'm a Kyoto guide or provider →</a>
        </p>
      </header>

      <section className="mt-12" data-testid="section-waitlist-why">
        <h2 className="text-2xl font-semibold">Why Kyoto days go wrong</h2>
        <p className="mt-3">Autumn is when Kyoto is most loved, and when small details sink a day:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><strong>Gates close on their own schedule.</strong> Hours change with the season, and some places shut earlier than you'd guess.</li>
          <li><strong>Last entry comes before closing.</strong> Getting there "before it closes" can still mean getting there too late.</li>
          <li><strong>Some days just don't run.</strong> Seasonal services skip dates, and some depend on the weather on the day.</li>
          <li><strong>The crowds pick the hour.</strong> The same spot can be a different place an hour later.</li>
        </ul>
        <p className="mt-3">None of this is hard on its own. Put it together across a few packed days and one mistake costs you an afternoon.</p>
      </section>

      {showKyotoExperts && (
      <section className="mt-12" data-testid="section-waitlist-coming">
        <h2 className="text-2xl font-semibold">Local experts in Kyoto</h2>
        <p className="mt-3">Kyoto experts on Traveloure can:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><strong>Read your plan like a local.</strong> Spot the day that's overpacked, the stop that's closed by the time you get there, and the booking that should have been made last week.</li>
          <li><strong>Suggest better options.</strong> A different order, a quieter moment, or a backup for the day something doesn't run.</li>
          <li><strong>Keep it human.</strong> You'll talk to a real person who knows Kyoto, not a list of search results.</li>
        </ul>
        <p className="mt-3">Your plan will live on one <strong>Trip Card</strong>, so everything for the trip is in one place.</p>
      </section>
      )}

      <section id="join" className="mt-12 scroll-mt-20 rounded-xl border p-6" data-testid="section-waitlist-join">
        <h2 className="text-2xl font-semibold">Be first to book when Kyoto opens.</h2>
        <p className="mt-3 text-muted-foreground">
          We're opening Traveloure in Kyoto first. Join the waitlist and tell us about your trip, so it's shaped around trips like yours.
        </p>
        <TravelerForm key={launchMarket} source={source} refCode={refCode} launchMarket={launchMarket} />
      </section>

      <section id="providers" className="mt-12 scroll-mt-20 rounded-xl border p-6" data-testid="section-waitlist-providers">
        <h2 className="text-xl font-semibold">Know Kyoto? Help travelers plan it.</h2>
        <p className="mt-3 text-muted-foreground">
          Traveloure is opening in Kyoto first. As local experts and providers join, travelers will be able to plan trips, proposals and weddings with them. Leave your details and we'll be in touch about joining.
        </p>
        <ProviderForm key={launchMarket} source={source} refCode={refCode} launchMarket={launchMarket} />
        <p className="mt-6 text-sm">
          <Link href="/signup?intent=supply" className="underline" data-testid="link-waitlist-offer-services">Offer my services in Kyoto</Link>
        </p>
      </section>
    </div>
  );
}
