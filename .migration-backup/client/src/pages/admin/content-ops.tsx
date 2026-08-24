/**
 * /admin/content-ops — the "Content Ops" admin page (mockup §09, decision-maker ratified Aug 10
 * 2026; CLAUDE.md §2/§13/§17/§20). One seat for the content-pipeline gaps the mockup names:
 *
 *   1. YouTube guide ingestion — trigger UI (POST /api/admin/dmo/ingest-youtube, already live)
 *      plus a real last-run line from the dmo_extraction_runs ledger (migration 191, §17 lesson
 *      applied by analogy: silence must be distinguishable from "never ran").
 *   2. Extraction & enrichment status — per-guide place/enrichment counts
 *      (GET /api/admin/dmo/extraction-status) plus the latest warmup-sweep run row.
 *   3. Requested offering types — the existing 06c queue (GET /api/admin/offering-requests),
 *      reused verbatim, including its Custom/Other listings counter.
 *   4. Market launch — manual checklist. Tickable per-market state is explicitly OUT of scope for
 *      v1 (it needs its own ruling); this renders the STATIC "Manual before launch" list from
 *      docs/MARKET_LAUNCH_CHECKLIST.md (the canonical text — keep both in sync), the same summary
 *      /admin/markets already hardcodes for its own panel.
 *
 * §13 throughout: every number on this page is a real query result. An endpoint with nothing to
 * report renders an honest empty state, never a fabricated placeholder.
 */
import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Youtube, MapPinned, Inbox, ClipboardCheck, Loader2, RefreshCw, HelpCircle } from "lucide-react";

// ── Types (mirror the endpoint response shapes verbatim) ─────────────────────

interface YoutubeIngestStats {
  ready: boolean;
  reason?: string;
  scanned: number;
  upserted: number;
  skippedShape: number;
  skippedShort: number;
  skippedDuplicate: number;
  error?: string;
}

interface DmoExtractionRunRow {
  id: string;
  kind: "youtube_ingest" | "warmup_sweep";
  counts: Record<string, unknown>;
  createdAt: string;
}

interface YoutubeLastRunResponse {
  ready: boolean;
  lastRun: DmoExtractionRunRow | null;
}

interface ExtractionGuideRow {
  id: string;
  name: string;
  city: string;
  sourceDomain: string | null;
  placeCount: number;
  enrichedCount: number;
  state: "extracted" | "concluded_empty" | "not_extracted";
}

interface ExtractionStatusResponse {
  guides: ExtractionGuideRow[];
  latestWarmupRun: DmoExtractionRunRow | null;
}

interface OfferingRequestRow {
  id: string;
  userId: string;
  requestedName: string;
  description: string | null;
  status: string;
  createdAt: string;
  requesterEmail: string | null;
}

interface OfferingRequestsResponse {
  requests: OfferingRequestRow[];
  customOtherListingsCount: number;
}

// ── Small shared bits ──────────────────────────────────────────────────────

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const EXTRACTION_STATE_LABEL: Record<ExtractionGuideRow["state"], { label: string; className: string }> = {
  extracted: { label: "extracted", className: "bg-green-50 text-green-700 border-green-200" },
  concluded_empty: { label: "concluded empty — live fetch found nothing", className: "bg-gray-100 text-gray-500 border-gray-200" },
  not_extracted: { label: "not yet extracted", className: "bg-amber-50 text-amber-700 border-amber-200" },
};

// ── YouTube ingestion card ────────────────────────────────────────────────

function YoutubeIngestionCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [market, setMarket] = useState("");
  const [city, setCity] = useState("");
  const [maxResults, setMaxResults] = useState("10");
  const [lastResult, setLastResult] = useState<{ message: string; stats?: YoutubeIngestStats } | null>(null);

  const { data: lastRunData, isLoading: lastRunLoading } = useQuery<YoutubeLastRunResponse>({
    queryKey: ["/api/admin/dmo/ingest-youtube/last-run"],
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { market: market.trim(), city: city.trim() };
      const parsedMax = Number(maxResults);
      if (Number.isFinite(parsedMax) && parsedMax > 0) body.maxResults = parsedMax;
      const res = await apiRequest("POST", "/api/admin/dmo/ingest-youtube", body);
      return res.json();
    },
    onSuccess: (body) => {
      setLastResult(body);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dmo/ingest-youtube/last-run"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dmo/extraction-status"] });
      if (body?.stats?.error) {
        toast({ title: "Run completed with an error", description: body.stats.error, variant: "destructive" });
      } else {
        toast({ title: body?.message ?? "Run complete" });
      }
    },
    onError: async (err: any) => {
      // The route reports the keyless case as a 503 with the message rendered verbatim (§13 —
      // honest keyless behavior, no fabricated "success").
      let message = err?.message ?? "YouTube ingestion failed";
      try {
        const parsed = JSON.parse(message.replace(/^\d+:\s*/, ""));
        if (parsed?.message) message = parsed.message;
      } catch {
        // not JSON — keep the raw message
      }
      setLastResult({ message });
      toast({ title: "Ingestion not run", description: message, variant: "destructive" });
    },
  });

  const lastRun = lastRunData?.lastRun ?? null;
  const lastRunCounts = (lastRun?.counts ?? {}) as Partial<YoutubeIngestStats>;

  return (
    <Card data-testid="card-youtube-ingestion">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Youtube className="h-4 w-4 text-[#7A7A72]" />
          <CardTitle className="text-sm">YouTube guide ingestion</CardTitle>
        </div>
        <CardDescription>Market + city → born-hidden intake rows. Admin approval flips them visible.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="yt-market" className="text-[11px] text-gray-500">Market</Label>
            <Input
              id="yt-market"
              className="h-8 w-32 text-[13px]"
              placeholder="japan"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              data-testid="input-youtube-market"
            />
          </div>
          <div>
            <Label htmlFor="yt-city" className="text-[11px] text-gray-500">City</Label>
            <Input
              id="yt-city"
              className="h-8 w-32 text-[13px]"
              placeholder="Kyoto"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              data-testid="input-youtube-city"
            />
          </div>
          <div>
            <Label htmlFor="yt-max" className="text-[11px] text-gray-500">Max results</Label>
            <Input
              id="yt-max"
              className="h-8 w-20 text-[13px]"
              type="number"
              min={1}
              max={15}
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
              data-testid="input-youtube-max-results"
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-[13px] gap-1.5"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !market.trim() || !city.trim()}
            data-testid="button-run-youtube-ingest"
          >
            {runMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Run
          </Button>
        </div>

        {lastResult && (
          <p className="text-[12px] text-gray-600" data-testid="text-youtube-run-result">
            {lastResult.message}
            {lastResult.stats && (
              <span className="text-gray-400">
                {" "}— scanned {lastResult.stats.scanned} · upserted {lastResult.stats.upserted} · skipped{" "}
                {lastResult.stats.skippedShape + lastResult.stats.skippedShort + lastResult.stats.skippedDuplicate}
                {" "}({lastResult.stats.skippedShape} shape, {lastResult.stats.skippedShort} short, {lastResult.stats.skippedDuplicate} dup)
              </span>
            )}
          </p>
        )}

        <div className="text-[12px] text-gray-500 border-t pt-2" data-testid="text-youtube-last-run">
          {lastRunLoading ? (
            "Loading last run…"
          ) : lastRun ? (
            <>
              Last run: {formatWhen(lastRun.createdAt)} · scanned {lastRunCounts.scanned ?? 0} · upserted{" "}
              {lastRunCounts.upserted ?? 0} · skipped{" "}
              {(lastRunCounts.skippedShape ?? 0) + (lastRunCounts.skippedShort ?? 0) + (lastRunCounts.skippedDuplicate ?? 0)}
              {" "}({lastRunCounts.skippedShape ?? 0} shape, {lastRunCounts.skippedShort ?? 0} short,{" "}
              {lastRunCounts.skippedDuplicate ?? 0} dup)
              {lastRunCounts.error ? <span className="text-red-600"> · error: {String(lastRunCounts.error)}</span> : null}
            </>
          ) : (
            "No runs yet."
          )}
          {!lastRunLoading && lastRunData && !lastRunData.ready && (
            <span className="block text-amber-600 mt-1">YOUTUBE_API_KEY not set on this environment.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Extraction & enrichment status card ───────────────────────────────────

function ExtractionStatusCard() {
  const { data, isLoading } = useQuery<ExtractionStatusResponse>({
    queryKey: ["/api/admin/dmo/extraction-status"],
  });

  const guides = data?.guides ?? [];
  const warmup = data?.latestWarmupRun ?? null;
  const warmupCounts = (warmup?.counts ?? {}) as Record<string, unknown>;

  return (
    <Card data-testid="card-extraction-status">
      <CardHeader>
        <CardTitle className="text-sm">Extraction & enrichment status</CardTitle>
        <CardDescription>Per-guide place counts, drawn from dmo_extracted_places joined to visible guides.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-[12px] text-gray-400">Loading…</p>
        ) : guides.length === 0 ? (
          <p className="text-[12px] text-gray-400" data-testid="text-no-guides">
            No expert-visible, guide-shaped content yet.
          </p>
        ) : (
          <div className="space-y-1.5" data-testid="list-extraction-guides">
            {guides.map((g) => {
              const cfg = EXTRACTION_STATE_LABEL[g.state];
              return (
                <div key={g.id} className="flex items-center justify-between gap-2 text-[12px]" data-testid={`row-guide-${g.id}`}>
                  <span className="truncate">
                    {g.name}
                    <span className="text-gray-400"> · {g.sourceDomain ?? "unknown source"}</span>
                  </span>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    {g.state === "extracted" ? (
                      <>
                        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                          {g.placeCount} places
                        </Badge>
                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                          {g.enrichedCount} enriched
                        </Badge>
                      </>
                    ) : (
                      <Badge variant="outline" className={`text-[10px] ${cfg.className}`}>
                        {cfg.label}
                      </Badge>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-[12px] text-gray-500 border-t pt-2" data-testid="text-warmup-last-run">
          <span className="font-medium text-gray-700">Warmup sweep</span>{" "}
          {warmup ? (
            <>
              · last run {formatWhen(warmup.createdAt)} · scanned {String(warmupCounts.scanned ?? 0)} · extracted{" "}
              {String(warmupCounts.extracted ?? 0)} · {String(warmupCounts.failed ?? 0)} failed
              {Number(warmupCounts.skippedCap ?? 0) > 0 ? ` · ${warmupCounts.skippedCap} deferred (cap)` : ""}
              {warmupCounts.stoppedNoApiKey ? " · stopped: no API key" : ""}
            </>
          ) : (
            "· no boot-sweep runs recorded yet."
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Requested offering types card (reuses the existing 06c queue) ────────

function OfferingRequestsCard() {
  const { data, isLoading } = useQuery<OfferingRequestsResponse>({
    queryKey: ["/api/admin/offering-requests"],
  });

  const requests = data?.requests ?? [];
  const pending = requests.filter((r) => r.status === "pending");

  return (
    <Card data-testid="card-offering-requests">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-[#7A7A72]" />
          <CardTitle className="text-sm">Requested offering types ({requests.length})</CardTitle>
        </div>
        <CardDescription>
          "Don't see your offering?" requests from providers/experts (mockup §06c) · {data?.customOtherListingsCount ?? 0} listings
          sitting in Custom/Other.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-[12px] text-gray-400">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-[12px] text-gray-400" data-testid="text-no-offering-requests">
            No requests yet.
          </p>
        ) : (
          <ul className="space-y-1.5" data-testid="list-offering-requests">
            {requests.slice(0, 8).map((r) => (
              <li key={r.id} className="text-[12px] flex items-start justify-between gap-2" data-testid={`row-offering-request-${r.id}`}>
                <span className="truncate">
                  "{r.requestedName}"
                  {r.requesterEmail ? <span className="text-gray-400"> — {r.requesterEmail}</span> : null}
                </span>
                <Badge variant="outline" className="text-[10px] flex-shrink-0">{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
        {pending.length > 8 && (
          <p className="text-[11px] text-gray-400 mt-1.5">+{requests.length - 8} more</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Market launch — static manual checklist ───────────────────────────────
// v1 SKIPS tickable per-market state (that needs its own ruling — see the file header). This is
// the same static "Manual before launch" summary /admin/markets already hardcodes; both mirror
// docs/MARKET_LAUNCH_CHECKLIST.md, the canonical text. Keep all three in sync when the doc changes.

function MarketLaunchChecklistCard() {
  return (
    <Card className="border-dashed" data-testid="card-market-launch-checklist">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-[#7A7A72]" />
          <CardTitle className="text-sm text-gray-600">Market launch — manual checklist</CardTitle>
        </div>
        <CardDescription>
          What the "Add market" flow (/admin/markets) does NOT automate — see docs/MARKET_LAUNCH_CHECKLIST.md for the full
          text. Per-market tickable state is intentionally out of scope for v1.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-[12px] text-gray-600 space-y-1.5">
        <p>1. Review + tune seeded neighborhoods — rename, set radii, mark 1-2 as featured.</p>
        <p>2. Recruit local experts to fill each neighborhood's lead-expert slot.</p>
        <p>3. Get approved lodging/services with real coordinates into this market (Advisor stay-anchor + platform-first booking, CLAUDE.md §16).</p>
        <p>4. Ingest and admin-approve DMO/research content for the city (<code className="bg-gray-100 px-1 rounded">expert_workspace_visible = true</code>).</p>
        <p>5. QA pass: teaser SVG, Social Kit route frame, expert workspace map, Advisor anchor label.</p>
        <p>6. Confirm the Google Places/geocoding key has quota for the new market's expected traffic.</p>
        <p className="pt-1 text-gray-400">Not per-market: fee bands (§8), service templates, Places/geocoding provider config — all global.</p>
      </CardContent>
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function AdminContentOps() {
  return (
    <AdminLayout title="Content Ops">
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-[12px] text-gray-400">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Everything on this page reads real rows from the existing ingestion/extraction pipelines — no simulated data.
        </div>
        <YoutubeIngestionCard />
        <ExtractionStatusCard />
        <div className="grid gap-4 sm:grid-cols-2">
          <OfferingRequestsCard />
          <MarketLaunchChecklistCard />
        </div>
        <p className="text-[11px] text-gray-400 flex items-center gap-1.5 pt-1">
          <HelpCircle className="h-3 w-3" />
          Filed, not built: a YouTube ToS refresh/purge job (would ship with a visible last-run row here, same ledger).
        </p>
      </div>
    </AdminLayout>
  );
}
