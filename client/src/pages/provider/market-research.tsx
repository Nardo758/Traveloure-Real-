/**
 * Provider Market Research — Partner Demand Phase 3, STEP 3.2 (read-only spine).
 * Ledger 2026-08-18-partner-demand-phase3 (R19/R20/R23).
 *
 * The market-level surface of the demand system: a market switcher, a server-summarised hero
 * (NO client math — every total comes from `summary`, computed in the L6 module), a ±window
 * requested/missed axis, and the Requested-Windows list at (market, date) grain.
 *
 * HONESTY (§13): every figure is an endpoint field. Below-floor cells render the named empty
 * state, never a softened number. Forward = "requested", past = "missed" — NEVER summed (R20).
 * Service-shaped ($) and stay-shaped (trips/nights) demand never blend (R19).
 *
 * DELIBERATELY NOT HERE YET (finer grain than 3.1's market-level rollup produces — tracked for
 * Leon): the neighbourhood-centroid MAP ($ circles need a neighbourhood grain), R23 smart
 * "add to <listing>" verbs (need a category match on the cell), and per-listing funnel rows
 * (need a per-service grain). This spine offers the market-seeded "create" deep-link only; the
 * wizard ignores unknown params today, so behaviour is byte-identical until STEP 3.2's handoff
 * increment wires seeding + provenance.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ── response shape (mirrors server RollupReadResult + markets/summary) ───────────────────────────
type DemandKind = "requested" | "missed";
interface SlipValue { count: number; amount: number | null; valuedCount: number }
interface StayValue { trips: number; nights: number; travelers: number | null; travelersCaptured: number }
interface RollupRow {
  marketSlug: string;
  date: string;
  metric: "unmet_demand_slip" | "slip_funnel" | "unmet_demand_stay";
  value: unknown | null;
  n: number;
  status: "ok" | "no_data";
  kind: DemandKind;
  lowN: boolean;              // R29: floor-cleared but thin (early signal) — labeled, never silent
  partnerId: string | null;
  serviceId: string | null;   // per-service (R25b) cells are the Catalog funnel's (3.3), not this list
}
interface SummaryBucket {
  slipAmount: number | null; slipCount: number; slipValuedCount: number; slipLowN: boolean;
  stayTrips: number; stayNights: number; stayTravelers: number | null; stayLowN: boolean;
}
interface MarketSummary { marketSlug: string; requested: SummaryBucket; missed: SummaryBucket }
interface RollupResponse {
  cadence: string;
  window: { from: string; to: string };
  historySince: string | null;
  markets: string[];
  rows: RollupRow[];
  summary: MarketSummary[];
}

const NAVY = "var(--earn-navy)";
const GOLD_INK = "var(--earn-gold-ink)";
const MUTED = "var(--earn-muted)";
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const prettyMarket = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const prettyDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

export default function ProviderMarketResearch() {
  const { data, isLoading, isError } = useQuery<RollupResponse>({ queryKey: ["/api/me/demand-rollup"] });
  const [market, setMarket] = useState<string | null>(null);
  const [kind, setKind] = useState<DemandKind>("requested");

  const markets = data?.markets ?? [];
  const selected = market ?? markets[0] ?? null;
  const summary = useMemo(
    () => data?.summary.find((s) => s.marketSlug === selected) ?? null,
    [data, selected],
  );
  // client-side FILTER only (never math): the selected market's slip+stay windows for the active kind
  const windows = useMemo(() => {
    if (!data || !selected) return [] as RollupRow[];
    const rows = data.rows.filter(
      (r) => r.marketSlug === selected && r.kind === kind && r.serviceId == null && r.partnerId == null &&
        (r.metric === "unmet_demand_slip" || r.metric === "unmet_demand_stay"),
    );
    return rows.sort((a, b) => (kind === "requested" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
  }, [data, selected, kind]);

  return (
    <ProviderLayout title="Market Research">
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 0 48px" }} data-testid="market-research-page">
        <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 22, color: NAVY, marginBottom: 4 }}>
          Market Research
        </h1>
        <p style={{ fontSize: 13, color: MUTED, marginBottom: 20, lineHeight: 1.5 }}>
          What travelers are asking for in your markets — and where you have no bookable slot. Updated daily.
        </p>

        {isLoading && <Skeleton className="h-40 w-full" data-testid="market-research-loading" />}
        {isError && (
          <Card><CardContent className="p-4" style={{ color: MUTED }} data-testid="market-research-error">
            Couldn't load demand right now. It refreshes daily — check back shortly.
          </CardContent></Card>
        )}

        {data && markets.length === 0 && (
          <Card><CardContent className="p-6" style={{ color: MUTED }} data-testid="market-research-nomarkets">
            No market is linked to your listings yet. Once a service is tied to one of our operating
            markets, its demand shows up here.
          </CardContent></Card>
        )}

        {data && selected && (
          <>
            {/* market switcher (server-derived markets only — never a free-text value) */}
            {markets.length > 1 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }} data-testid="market-switcher">
                {markets.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMarket(m)}
                    data-testid={`market-tab-${m}`}
                    style={{
                      fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 99, cursor: "pointer",
                      border: `1px solid ${m === selected ? NAVY : "var(--earn-faint)"}`,
                      background: m === selected ? NAVY : "transparent",
                      color: m === selected ? "#fff" : "var(--earn-ink)",
                    }}
                  >
                    {prettyMarket(m)}
                  </button>
                ))}
              </div>
            )}

            {/* hero — SERVER-SUMMARISED, forked by kind + metric; no client math */}
            <Hero market={selected} summary={summary} historySince={data.historySince} />

            {/* ±window axis (STEP 3.7 Part B, B4): a −90…+90 BAND — past half muted (missed),
                forward half gold (requested), with a navy "today" marker — never a summed total (R20).
                The toggle pills select which half's windows the list shows. */}
            <ScrubberBand window={data.window} kind={kind} setKind={setKind} />

            {/* Requested-Windows list */}
            <WindowsList market={selected} kind={kind} windows={windows} historySince={data.historySince} />

            {/* Search-interest map UNMOUNTED (STEP 3.7 Part B, R29 dispatch): the search substrate is
                dark on real data (search_analytics/demand_signals empty), so the layer could only paint
                coverage-gap markers under a "search interest" header — a label/pixels mismatch (§13).
                It returns as a separately-named, honest surface once the search write-path lands (the
                standing FOLLOWUP). See docs/findings/partner-demand-3.7-partA-diagnosis.md §A2. */}
          </>
        )}
      </div>
    </ProviderLayout>
  );
}

// The fractional position (0..1) of a target ISO date within [from, to]; 0.5 if the span is degenerate.
function dayFraction(fromISO: string, toISO: string, targetISO: string): number {
  const f = Date.parse(`${fromISO}T00:00:00Z`);
  const t = Date.parse(`${toISO}T00:00:00Z`);
  const x = Date.parse(`${targetISO}T00:00:00Z`);
  if (!(t > f) || Number.isNaN(x)) return 0.5;
  return Math.max(0, Math.min(1, (x - f) / (t - f)));
}

// B4 — the ±window scrubber, drawn as a BAND (visual target Surface 5): a −90…+90 track split at
// "today", past half muted (missed), forward half gold (requested), with a navy today-marker. The two
// pills select which half's windows the list below shows. R20: the halves are NEVER summed.
function ScrubberBand({ window, kind, setKind }: { window: { from: string; to: string }; kind: DemandKind; setKind: (k: DemandKind) => void }) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const todayPct = Math.round(dayFraction(window.from, window.to, todayISO) * 100);
  return (
    <div style={{ margin: "18px 0 10px" }} data-testid="demand-scrubber">
      <div
        style={{
          position: "relative", height: 10, borderRadius: 99, border: "1px solid var(--earn-faint)",
          background: `linear-gradient(90deg, var(--earn-chip) 0%, var(--earn-chip) ${todayPct}%, var(--earn-gold-wash) ${todayPct}%, var(--earn-gold-wash) 100%)`,
        }}
      >
        <div
          data-testid="scrubber-today"
          style={{ position: "absolute", top: -3, bottom: -3, left: `${todayPct}%`, width: 2, background: NAVY, transform: "translateX(-1px)" }}
        />
      </div>
      <div style={{ position: "relative", marginTop: 4, fontSize: 11, color: MUTED, height: 14 }}>
        <span>{window.from}</span>
        <span style={{ position: "absolute", left: `${todayPct}%`, transform: "translateX(-50%)", color: NAVY, fontWeight: 700 }}>today</span>
        <span style={{ position: "absolute", right: 0 }}>{window.to}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 12, color: MUTED, flexWrap: "wrap" }}>
        <span>past = <b style={{ color: "var(--earn-muted)" }}>missed</b> · forward = <b style={{ color: GOLD_INK }}>requested</b> — never summed</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          {(["requested", "missed"] as DemandKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              data-testid={`kind-toggle-${k}`}
              style={{
                fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 99, cursor: "pointer",
                border: `1px solid ${k === kind ? (k === "requested" ? GOLD_INK : "var(--earn-muted)") : "var(--earn-faint)"}`,
                background: k === kind ? (k === "requested" ? "var(--earn-gold-wash)" : "var(--earn-chip)") : "transparent",
                color: k === "requested" ? GOLD_INK : "var(--earn-muted)",
              }}
            >
              {k === "requested" ? "Requested (forward)" : "Missed (past)"}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

// R29 — an "early signal" tag for a floor-cleared-but-thin (low-n) enumerable own-book figure. States
// the thinness plainly beside the value; never lets a 3-sample figure read as a full one (§13).
function EarlySignalTag() {
  return (
    <span
      data-testid="early-signal-tag"
      style={{
        marginLeft: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", verticalAlign: "middle",
        padding: "2px 8px", borderRadius: 99, color: GOLD_INK,
        background: "var(--earn-gold-wash)", border: "1px solid var(--earn-faint)",
      }}
    >
      early signal
    </span>
  );
}

function Hero({ market, summary, historySince }: { market: string; summary: MarketSummary | null; historySince: string | null }) {
  const b = summary?.requested;
  const hasSlip = b && b.slipAmount != null && b.slipAmount > 0;
  const hasStay = b && b.stayTrips > 0;
  return (
    <Card data-testid="market-research-hero" style={{ borderTop: `2px solid var(--earn-gold-wash)` }}>
      {/* B4 — the hero figure sits on a gold-wash band (visual target Surface 5): a faint gold
          gradient behind the number, the requested-demand accent color. */}
      <CardContent className="p-5" style={{ background: "linear-gradient(180deg, var(--earn-gold-wash) 0%, transparent 70%)" }}>
        {hasSlip ? (
          <>
            <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 30, fontWeight: 700, color: NAVY }}>
              {usd.format(b!.slipAmount!)}
              {b!.slipLowN && <EarlySignalTag />}
            </div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
              requested in {prettyMarket(market)} with no bookable slot · based on{" "}
              <b style={{ color: "var(--earn-ink)" }}>{b!.slipValuedCount}</b> priced planned items · updated daily
            </div>
          </>
        ) : hasStay ? (
          <>
            <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 30, fontWeight: 700, color: NAVY }}>
              {b!.stayTrips} trips · {b!.stayNights} nights
              {b!.stayLowN && <EarlySignalTag />}
            </div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
              seeking a stay in {prettyMarket(market)} with none anchored · count-only, no price shown · updated daily
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: MUTED }} data-testid="hero-empty">
            No demand clears our reporting floor in {prettyMarket(market)} yet — we only show a figure once the
            sample is large enough to be honest{historySince ? `, and history here begins ${prettyDate(historySince)}` : ""}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WindowsList({ market, kind, windows, historySince }: {
  market: string; kind: DemandKind; windows: RollupRow[]; historySince: string | null;
}) {
  return (
    <Card data-testid="requested-windows">
      <CardContent className="p-0">
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--earn-chip)", fontSize: 12, fontWeight: 700 }}>
          {kind === "requested" ? "Requested windows" : "Missed windows (past)"}{" "}
          <span style={{ fontWeight: 400, color: MUTED }}>· {market ? prettyMarket(market) : ""} · updated daily</span>
        </div>
        {windows.length === 0 ? (
          <div style={{ padding: "16px", fontSize: 12.5, color: MUTED }} data-testid="windows-empty">
            No {kind === "requested" ? "forward" : "past"} windows clear the floor here yet
            {historySince ? ` (history since ${prettyDate(historySince)})` : ""}.
          </div>
        ) : (
          windows.map((w, i) => <WindowRow key={`${w.metric}-${w.date}-${i}`} market={market} row={w} />)
        )}
      </CardContent>
    </Card>
  );
}

function WindowRow({ market, row }: { market: string; row: RollupRow }) {
  const suppressed = row.status === "no_data";
  const isStay = row.metric === "unmet_demand_stay";
  // create deep-link seeds market + date only (rollup has no category/neighbourhood grain).
  const createHref = isStay
    ? `/provider/properties/new?market_slug=${encodeURIComponent(market)}`
    : `/provider/services/new?market_slug=${encodeURIComponent(market)}&requested_date=${encodeURIComponent(row.date)}`;

  return (
    <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--earn-chip)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
         data-testid={`window-row-${row.metric}-${row.date}`}>
      <div style={{ minWidth: 96, fontSize: 12.5, fontWeight: 600 }}>{prettyDate(row.date)}</div>
      <div style={{ flex: 1, minWidth: 180, fontSize: 12.5 }}>
        {suppressed ? (
          <span style={{ color: MUTED }} data-testid="window-nodata">
            Not enough planned trips yet to show a figure (n={row.n}) — appears once the sample clears the floor.
          </span>
        ) : isStay ? (
          <StayCell value={row.value as StayValue} n={row.n} lowN={row.lowN} />
        ) : (
          <SlipCell value={row.value as SlipValue} n={row.n} lowN={row.lowN} />
        )}
      </div>
      {/* B4 — row deep-links (visual target Surface 5). calendar↗ opens the Calendar at this window's
          month. map↗ is intentionally OMITTED: the search-interest map layer was unmounted (B-search),
          so there is no honest map target to deep-link to — a dead link would violate §13. */}
      <Link href={`/provider/calendar?date=${encodeURIComponent(row.date)}`} data-testid="window-calendar">
        <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer", whiteSpace: "nowrap" }}>
          calendar ↗
        </span>
      </Link>
      {row.kind === "requested" && (
        <Link href={createHref} data-testid="window-create">
          <span style={{ fontSize: 12, fontWeight: 600, color: GOLD_INK, cursor: "pointer", whiteSpace: "nowrap" }}>
            {isStay ? "Add a property here →" : "Create a service here →"}
          </span>
        </Link>
      )}
    </div>
  );
}

// SearchInterestLayer REMOVED (STEP 3.7 Part B, R29 dispatch). It mounted `MarketInsightsView`
// unscoped and, with the search substrate dark on real data, could only paint coverage-gap markers
// under a "search interest" header (a label/pixels mismatch, §13 — see the 3.7 Part-A diagnosis).
// The layer returns as a separately-named, honest surface once the search write-path FOLLOWUP lands.
// `MarketInsightsView` itself is unchanged and still mounts on Catalog; B1 filters its endpoint so a
// non-operating market never reaches a partner surface wherever it renders.

function SlipCell({ value, n, lowN = false }: { value: SlipValue | null; n: number; lowN?: boolean }) {
  if (!value) return <span style={{ color: MUTED }}>—</span>;
  return (
    <span>
      {value.amount != null ? (
        <><b style={{ color: NAVY }}>{usd.format(value.amount)}</b> unmet</>
      ) : (
        <><b style={{ color: NAVY }}>{value.count}</b> requested <span style={{ color: MUTED }}>(no priced items)</span></>
      )}
      <span style={{ color: MUTED }}> · {value.count} item{value.count === 1 ? "" : "s"} · n={n}</span>
      {lowN && <EarlySignalTag />}
    </span>
  );
}

function StayCell({ value, n, lowN = false }: { value: StayValue | null; n: number; lowN?: boolean }) {
  if (!value) return <span style={{ color: MUTED }}>—</span>;
  return (
    <span>
      <b style={{ color: NAVY }}>{value.trips}</b> trip{value.trips === 1 ? "" : "s"} seeking a stay ·{" "}
      <b style={{ color: NAVY }}>{value.nights}</b> night{value.nights === 1 ? "" : "s"}
      {value.travelers != null && <> · {value.travelers} traveler{value.travelers === 1 ? "" : "s"}</>}
      <span style={{ color: MUTED }}> · n={n}</span>
      {lowN && <EarlySignalTag />}
    </span>
  );
}
