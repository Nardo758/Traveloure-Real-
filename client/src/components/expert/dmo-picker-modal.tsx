import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MapPin, Plus, Check, Library, Search, Pencil, Sparkles, BookOpen, ArrowLeft, Loader2, ExternalLink, ChevronDown } from "lucide-react";
import { usePublishMapCandidates } from "@/lib/map-candidates";

interface DmoItem {
  id: string;
  name: string;
  description?: string | null;
  city: string;
  neighborhood?: string | null;
  contentType: string;
  tags?: string[] | null;
  // L27-P1: dmo_raw_content.latitude/longitude are real decimal columns, returned by
  // GET /api/expert-workspace/library as-is (full row spread). No ingestion path writes
  // them today, so they are typically null — but when present they are the item's OWN
  // coordinate, not a neighborhood substitute, so they're safe to carry through.
  latitude?: string | number | null;
  longitude?: string | number | null;
  // W5-C: the server now overlays the requesting expert's OWN latest expert_dmo_edits row
  // onto name/description/tags/etc — `name`/`description`/`tags` above are already the
  // MERGED (refined-if-present) values. `isRefined` says whether an overlay actually
  // happened; `raw` is the untouched original so the UI can show what changed, honestly.
  isRefined?: boolean;
  raw?: {
    name: string;
    description?: string | null;
    shortDescription?: string | null;
    tags?: string[] | null;
  };
  // Research Reader (DMO_READER contract): "place" behaves byte-identically to pre-Reader
  // rows; "guide" swaps the Add action for Read (adding a whole article as an itinerary
  // item is the bug the Reader closes). Absent on older/unaugmented rows → treat as "place".
  shape?: "place" | "guide";
  extractedPlacesCount?: number | null;
}

// Mirrors workspace.tsx's isLocatedItem: decimal columns arrive as strings over JSON;
// reject null/NaN so an absent coordinate is never coerced into a fabricated one.
function hasRealCoords(item: { latitude?: string | number | null; longitude?: string | number | null }): boolean {
  const lat = item.latitude == null ? NaN : typeof item.latitude === "number" ? item.latitude : parseFloat(item.latitude);
  const lng = item.longitude == null ? NaN : typeof item.longitude === "number" ? item.longitude : parseFloat(item.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}
interface LibraryResponse { items: DmoItem[] }

// DMO content types → itinerary itemType (matches the workspace AddItemModal's set).
const TYPE_TO_ITEM: Record<string, string> = {
  restaurant: "dining",
  venue: "activity",
  attraction: "activity",
  destination: "activity",
  event: "activity",
  transport: "transport",
};

// ---------------------------------------------------------------------------------------
// Research Reader — GET /api/expert-workspace/library/:id detail + POST extract-places.
// §13: never invent coordinates or extracted places client-side; every state below reflects
// exactly what the server returned (loading / thin-text / error / real places), no filler.
// ---------------------------------------------------------------------------------------

interface DmoLibraryDetail {
  id: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  contentType: string;
  neighborhood?: string | null;
  city: string;
  address?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  sourceUrl?: string | null;
  sourcePageTitle?: string | null;
  scrapedAt?: string | null;
  license?: string | null;
  tags?: string[] | null;
  primaryImageUrl?: string | null;
  shape: "place" | "guide";
  extractedData?: unknown;
}

interface Place {
  n: number;
  name: string;
  latitude?: string;
  longitude?: string;
  inLibraryId?: string;
  ticketingUrl?: string;
}

interface ExtractPlacesResponse {
  places: Place[] | null;
  cached?: boolean;
  thinText?: boolean;
}

type PlaceDotState = "default" | "added" | "library";

function hostnameOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// 19px default / 15px inline (full-text prefix) / 16px (library-tile chip) per the mockup's
// dot spec: brand = untouched, ok = added to a day, hollow = already a library item.
function PlaceDot({ n, state, size = 19, testId }: { n: number; state: PlaceDotState; size?: number; testId?: string }) {
  const isLibrary = state === "library";
  const isAdded = state === "added";
  return (
    <span
      data-testid={testId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        flexShrink: 0,
        fontFamily: "monospace",
        fontWeight: 800,
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        background: isAdded ? "var(--console-ok)" : isLibrary ? "var(--console-card)" : "var(--console-brand)",
        color: isLibrary ? "var(--console-mid)" : "#FFFFFF",
        border: isLibrary ? "1.5px solid var(--console-faint)" : "none",
      }}
    >
      {n}
    </span>
  );
}

function GeoChip({ hasCoords }: { hasCoords: boolean }) {
  return hasCoords ? (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: "var(--console-ok-soft)", color: "var(--console-ok)" }}
    >
      <MapPin className="w-2.5 h-2.5" /> pinned
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: "var(--console-warn-soft)", color: "var(--console-warn)" }}
    >
      no pin yet
    </span>
  );
}

// Split "+ Day N ▾" add button — left side adds to focusDay directly, caret opens Day
// 1..maxDay plus "+ New day" (maxDay+1, mirrors workspace.tsx's own add-day affordance).
function AddPlaceSplitButton({
  place,
  focusDay,
  maxDay,
  pending,
  onPick,
}: {
  place: Place;
  focusDay: number;
  maxDay: number;
  pending: boolean;
  onPick: (day: number) => void;
}) {
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  return (
    <div className="inline-flex rounded-md overflow-hidden" style={{ border: "1px solid var(--console-brand)" }}>
      <button
        onClick={() => onPick(focusDay)}
        disabled={pending}
        data-testid={`button-add-place-${place.n}`}
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold"
        style={{ background: "var(--console-brand-soft)", color: "var(--console-brand)", cursor: pending ? "default" : "pointer" }}
      >
        {pending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Plus className="w-2.5 h-2.5" />}
        Day {focusDay}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            data-testid={`menu-add-place-${place.n}`}
            disabled={pending}
            className="px-1.5 py-1"
            style={{ background: "var(--console-brand-soft)", color: "var(--console-brand)", borderLeft: "1px solid var(--console-brand)", cursor: pending ? "default" : "pointer" }}
          >
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {days.map((d) => (
            <DropdownMenuItem key={d} onClick={() => onPick(d)}>
              Day {d}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => onPick(maxDay + 1)}>+ New day</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Ticketing sub-line — informational outbound only (§16 governs traveler-facing off-site
// "Book" CTAs; this is an expert-console reference link to where the expert can buy tickets,
// never surfaced to a traveler). PATCHes the contract's extracted-places endpoint on save.
function TicketingSubline({ place, ticketingUrl, onSave }: { place: Place; ticketingUrl?: string; onSave: (url: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (ticketingUrl) {
    const host = hostnameOf(ticketingUrl) ?? ticketingUrl;
    return (
      <a
        href={ticketingUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`link-ticketing-${place.n}`}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: "var(--console-info-soft)", color: "var(--console-info)" }}
      >
        {host} <ExternalLink className="w-2.5 h-2.5" />
      </a>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        data-testid={`button-add-ticketing-${place.n}`}
        className="text-[10px] font-medium rounded-full px-2 py-0.5"
        style={{ color: "var(--console-mid)", border: "1px dashed var(--console-line)" }}
      >
        + Add ticketing link
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="https://…"
        className="h-6 text-[11px] px-2 w-40"
        data-testid={`input-ticketing-${place.n}`}
      />
      <Button
        size="sm"
        className="h-6 px-2 text-[11px]"
        data-testid={`button-save-ticketing-${place.n}`}
        onClick={() => {
          const url = draft.trim();
          if (!/^https:\/\//i.test(url)) {
            setError("Must start with https://");
            return;
          }
          setError(null);
          onSave(url);
          setEditing(false);
        }}
      >
        Save
      </Button>
      <button onClick={() => { setEditing(false); setError(null); }} className="text-[10px]" style={{ color: "var(--console-faint)" }}>
        Cancel
      </button>
      {error && <span className="text-[10px] w-full" style={{ color: "var(--console-warn)" }}>{error}</span>}
    </div>
  );
}

function PlaceRow({
  place,
  focusDay,
  maxDay,
  addedDay,
  isFlashed,
  dotState,
  ticketingUrl,
  onRowRef,
  onRowClick,
  onAdd,
  addPending,
  onViewInLibrary,
  onSaveTicketing,
}: {
  place: Place;
  focusDay: number;
  maxDay: number;
  addedDay: number | null;
  isFlashed: boolean;
  dotState: PlaceDotState;
  ticketingUrl?: string;
  onRowRef: (n: number, el: HTMLDivElement | null) => void;
  onRowClick: (n: number) => void;
  onAdd: (place: Place, day: number) => void;
  addPending: boolean;
  onViewInLibrary: (place: Place) => void;
  onSaveTicketing: (place: Place, url: string) => void;
}) {
  const hasCoords = place.latitude != null && place.latitude !== "" && place.longitude != null && place.longitude !== "";
  return (
    <div
      ref={(el) => onRowRef(place.n, el)}
      onClick={() => onRowClick(place.n)}
      data-testid={`row-place-${place.n}`}
      className="flex gap-2 rounded-lg p-2 cursor-pointer transition-colors"
      style={{ background: isFlashed ? "var(--console-brand-soft)" : "transparent" }}
    >
      <PlaceDot n={place.n} state={dotState} testId={`dot-place-${place.n}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: "var(--console-ink)" }}>{place.name}</div>
            <div className="mt-1"><GeoChip hasCoords={hasCoords} /></div>
          </div>
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {place.inLibraryId ? (
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                  style={{ background: "var(--console-ground)", color: "var(--console-mid)", border: "1px solid var(--console-line)" }}
                >
                  in library
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" data-testid={`button-view-place-${place.n}`} onClick={() => onViewInLibrary(place)}>
                  view
                </Button>
              </div>
            ) : addedDay != null ? (
              <span
                data-testid={`button-add-place-${place.n}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold"
                style={{ background: "var(--console-ok-soft)", color: "var(--console-ok)" }}
              >
                <Check className="w-3 h-3" /> Day {addedDay}
              </span>
            ) : (
              <AddPlaceSplitButton place={place} focusDay={focusDay} maxDay={maxDay} pending={addPending} onPick={(day) => onAdd(place, day)} />
            )}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="mt-1.5">
          <TicketingSubline place={place} ticketingUrl={ticketingUrl} onSave={(url) => onSaveTicketing(place, url)} />
        </div>
      </div>
    </div>
  );
}

// Best-effort linking: first case-insensitive occurrence of each place name, non-overlapping,
// earliest-start wins. A name absent from the text simply gets no highlight — never forced
// (§13 honesty). Built as React nodes, never dangerouslySetInnerHTML.
function splitTextWithHighlights(
  text: string,
  places: Place[],
  dotStateFor: (n: number) => PlaceDotState,
  registerHighlightRef: (n: number, el: HTMLElement | null) => void,
  onHighlightClick: (n: number) => void,
): React.ReactNode[] {
  const lower = text.toLowerCase();
  const matches: { start: number; end: number; place: Place }[] = [];
  for (const p of places) {
    if (!p.name) continue;
    const idx = lower.indexOf(p.name.toLowerCase());
    if (idx === -1) continue;
    matches.push({ start: idx, end: idx + p.name.length, place: p });
  }
  matches.sort((a, b) => a.start - b.start);
  const kept: typeof matches = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start >= cursor) {
      kept.push(m);
      cursor = m.end;
    }
  }
  const nodes: React.ReactNode[] = [];
  let pos = 0;
  kept.forEach((m) => {
    if (m.start > pos) nodes.push(text.slice(pos, m.start));
    nodes.push(
      <span
        key={`hl-${m.place.n}`}
        ref={(el) => { registerHighlightRef(m.place.n, el); }}
        onClick={() => onHighlightClick(m.place.n)}
        data-testid={`highlight-place-${m.place.n}`}
        className="inline-flex items-baseline gap-1 cursor-pointer rounded-sm px-0.5"
        style={{ background: "var(--console-brand-soft)", borderBottom: "1.5px solid var(--console-brand)" }}
      >
        <PlaceDot n={m.place.n} state={dotStateFor(m.place.n)} size={15} />
        {text.slice(m.start, m.end)}
      </span>,
    );
    pos = m.end;
  });
  if (pos < text.length) nodes.push(text.slice(pos));
  return nodes;
}

/**
 * DmoReader — the picker's "Research Reader" view state: header + (guides only) the
 * places-first harvest panel + full text with best-effort place highlighting + source block.
 * Fetches GET .../library/:id (react-query) and, for guides, fires POST .../extract-places
 * exactly once (query keyed by id at staleTime:Infinity — react-query dedupes concurrent
 * fetches of the same key, so a StrictMode double-invoke never produces a second POST; the
 * server's own run-once cache is the second line of defense).
 */
function DmoReader({
  itemId,
  tripId,
  focusDay,
  maxDay,
  onBack,
  onAdded,
  onViewInLibrary,
}: {
  itemId: string;
  tripId: string;
  focusDay: number;
  maxDay: number;
  onBack: () => void;
  onAdded: () => void;
  onViewInLibrary: (name: string) => void;
}) {
  const { toast } = useToast();
  const [addedDays, setAddedDays] = useState<Record<number, number>>({});
  const [ticketingOverrides, setTicketingOverrides] = useState<Record<number, string>>({});
  const [flashN, setFlashN] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const highlightRefs = useRef<Map<number, HTMLElement>>(new Map());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detailQuery = useQuery<DmoLibraryDetail>({
    queryKey: ["/api/expert-workspace/library", itemId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/expert-workspace/library/${itemId}`);
      return res.json();
    },
  });

  const isGuide = detailQuery.data?.shape === "guide";

  const extractQuery = useQuery<ExtractPlacesResponse>({
    queryKey: ["/api/expert-workspace/library", itemId, "extract-places"],
    queryFn: async () => {
      const res = await apiRequest("POST", `/api/expert-workspace/library/${itemId}/extract-places`);
      return res.json();
    },
    enabled: isGuide,
    staleTime: Infinity,
    retry: false,
  });

  const rawPlaces = extractQuery.data?.places ?? [];
  const places = rawPlaces.map((p) => (ticketingOverrides[p.n] !== undefined ? { ...p, ticketingUrl: ticketingOverrides[p.n] } : p));

  const addPlaceMutation = useMutation({
    mutationFn: async ({ place, day }: { place: Place; day: number }) => {
      // Contract: same write as the list's addMutation — title/itemType/locationName/
      // dayNumber, coords carried ONLY when the server-supplied place already has them
      // (never geocoded or invented client-side, §13).
      const hasCoords = place.latitude != null && place.latitude !== "" && place.longitude != null && place.longitude !== "";
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
        title: place.name,
        itemType: "activity",
        locationName: place.name,
        ...(hasCoords ? { latitude: String(place.latitude), longitude: String(place.longitude) } : {}),
        dayNumber: day,
      });
      return res.json();
    },
    onSuccess: (_res, { place, day }) => {
      setAddedDays((prev) => ({ ...prev, [place.n]: day }));
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onAdded();
      toast({ title: "Added to itinerary", description: `${place.name} → Day ${day}` });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add place", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" });
    },
  });

  const ticketingMutation = useMutation({
    mutationFn: async ({ index, url }: { index: number; url: string }) => {
      const res = await apiRequest("PATCH", `/api/expert-workspace/library/${itemId}/extracted-places/${index}`, { ticketingUrl: url });
      return res.json() as Promise<Place>;
    },
    onSuccess: (updated) => {
      setTicketingOverrides((prev) => ({ ...prev, [updated.n]: updated.ticketingUrl ?? "" }));
      toast({ title: "Saved", description: "Ticketing link added." });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't save link", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" });
    },
  });

  function dotStateFor(n: number): PlaceDotState {
    if (addedDays[n] != null) return "added";
    const place = places.find((p) => p.n === n);
    if (place?.inLibraryId) return "library";
    return "default";
  }

  function flash(n: number) {
    setFlashN(n);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashN(null), 900);
  }

  function scrollToHighlight(n: number) {
    const el = highlightRefs.current.get(n);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    flash(n);
  }

  function scrollToRow(n: number) {
    const el = rowRefs.current.get(n);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    flash(n);
  }

  const detail = detailQuery.data;
  const fullText = detail?.description ?? "";
  const textNodes =
    isGuide && places.length > 0 && fullText
      ? splitTextWithHighlights(
          fullText,
          places,
          dotStateFor,
          (n, el) => { if (el) highlightRefs.current.set(n, el); else highlightRefs.current.delete(n); },
          scrollToRow,
        )
      : [fullText];

  const hostname = hostnameOf(detail?.sourceUrl);
  const scrapedDate = detail?.scrapedAt
    ? (() => {
        const d = new Date(detail.scrapedAt as string);
        return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      })()
    : null;

  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" onClick={onBack} data-testid="button-dmo-reader-back" className="gap-1 -ml-2">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to library
      </Button>

      {detailQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : detailQuery.error || !detail ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Could not load this item.</p>
      ) : (
        <>
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--console-ink)" }}>{detail.name}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {isGuide ? (
                <Badge variant="outline" className="text-[10px]" style={{ background: "var(--console-info-soft)", color: "var(--console-info)", borderColor: "var(--console-info)" }}>
                  Guide
                </Badge>
              ) : (
                <Badge variant="outline" className="capitalize text-[10px]">{detail.contentType}</Badge>
              )}
              {hostname && <span className="text-[11px]" style={{ color: "var(--console-mid)" }}>{hostname}</span>}
              {scrapedDate && <span className="text-[11px]" style={{ color: "var(--console-faint)" }}>scraped {scrapedDate}</span>}
            </div>
          </div>

          {isGuide && (
            <div className="rounded-lg border p-3" data-testid="panel-dmo-extraction">
              {extractQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--console-mid)" }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Finding places in this guide…
                </div>
              ) : extractQuery.data?.thinText ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-sm" style={{ color: "var(--console-mid)" }}>
                    Not enough stored text to find places — read the source.
                  </p>
                  {detail.sourceUrl && (
                    <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" data-testid="button-dmo-reader-source-fallback">
                        View source <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                    </a>
                  )}
                </div>
              ) : extractQuery.error ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-sm" style={{ color: "var(--console-warn)" }}>Couldn't extract places right now.</p>
                  {detail.sourceUrl && (
                    <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" data-testid="button-dmo-reader-source-fallback">
                        View source <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                    </a>
                  )}
                </div>
              ) : places.length === 0 ? (
                // Empty ≠ the article has no places — it means the STORED excerpt names none
                // (scrapers often capture only the page top: title + disclosure + intro, while
                // the venue list lives further down). Say so honestly and hand the expert the
                // source, exactly like the thin-text state — never a dead end.
                <div className="text-center py-4 space-y-2">
                  <p className="text-sm" style={{ color: "var(--console-mid)" }}>
                    No places named in the stored excerpt — the full article may list more. Read the source.
                  </p>
                  {detail.sourceUrl && (
                    <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" data-testid="button-dmo-reader-source-fallback">
                        View source <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--console-faint)" }}>
                    {places.length} place{places.length === 1 ? "" : "s"} in this guide · numbered in the guide's order
                  </div>
                  <div className="space-y-1">
                    {places.map((place) => (
                      <PlaceRow
                        key={place.n}
                        place={place}
                        focusDay={focusDay}
                        maxDay={maxDay}
                        addedDay={addedDays[place.n] ?? null}
                        isFlashed={flashN === place.n}
                        dotState={dotStateFor(place.n)}
                        ticketingUrl={place.ticketingUrl}
                        onRowRef={(n, el) => { if (el) rowRefs.current.set(n, el); else rowRefs.current.delete(n); }}
                        onRowClick={scrollToHighlight}
                        onAdd={(p, day) => addPlaceMutation.mutate({ place: p, day })}
                        addPending={addPlaceMutation.isPending && addPlaceMutation.variables?.place?.n === place.n}
                        onViewInLibrary={(p) => onViewInLibrary(p.name)}
                        onSaveTicketing={(p, url) => {
                          const idx = places.findIndex((pp) => pp.n === p.n);
                          ticketingMutation.mutate({ index: idx, url });
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--console-faint)", fontFamily: "monospace" }}>
              Full text
            </div>
            <div className="text-sm leading-relaxed rounded-lg border p-3" style={{ whiteSpace: "pre-wrap", color: "var(--console-ink)" }} data-testid="text-dmo-full">
              {fullText ? textNodes : <span style={{ color: "var(--console-faint)" }}>No stored text for this item.</span>}
            </div>
          </div>

          <div className="rounded-lg border p-3 text-xs" style={{ background: "var(--console-ground)", color: "var(--console-mid)" }} data-testid="block-dmo-source">
            <div>
              Source{hostname ? ` · ${hostname}` : ""}
              {detail.sourcePageTitle ? ` — "${detail.sourcePageTitle}"` : ""}
              {scrapedDate ? ` · scraped ${scrapedDate}` : ""}
              {detail.license ? ` · license: ${detail.license}` : ""}
            </div>
            {detail.sourceUrl && (
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-dmo-source"
                className="inline-flex items-center gap-1 mt-1 font-medium"
                style={{ color: "var(--console-info)" }}
              >
                View source <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * DmoPickerCore — the modal's search + list + add body, extracted (Phase A2) so the
 * workspace's Add panel can embed the same browse/add flow inline without the Dialog
 * chrome. Same fetch, same POST /api/trips/:tripId/itinerary-items write — one logic home.
 *
 * C7 (§17 17→9): also carries the review-and-refine flow (expert_dmo_edits) folded in
 * from the retired dmo-library.tsx — same POST /api/expert-workspace/content/:id/edit →
 * PATCH /api/expert-workspace/edits/:id/submit write, verbatim — so the Add panel's DMO
 * drawer is the library's one home; /expert/dmo-library redirects to the Workstation.
 *
 * DMO_READER: `maxDay` feeds the Research Reader's day-picker (Day 1..maxDay + "New day");
 * the one call site (workspace.tsx) already computes `maxDay` for its own add-day control.
 */
export function DmoPickerCore({
  tripId,
  dayNumber,
  maxDay,
  onAdded,
}: {
  tripId: string;
  dayNumber: number;
  maxDay: number;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [readerId, setReaderId] = useState<string | null>(null);

  // Refine editor state (one open editor at a time, form state scoped to it).
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [refined, setRefined] = useState<Set<string>>(new Set());

  function toggleRefine(item: DmoItem) {
    if (refiningId === item.id) {
      setRefiningId(null);
      return;
    }
    setRefiningId(item.id);
    setEditName(item.name ?? "");
    setEditDescription(item.description ?? "");
    setEditTags((item.tags ?? []).join(", "));
    // Reopening re-enables save (mirrors dmo-library.tsx's reset on open).
    setRefined((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }

  // Save enrichment as a draft edit, then submit it — refines the raw content (name,
  // description, tags) before it's built into a Ready Made Trip or a client itinerary.
  const submitEnrichment = useMutation({
    mutationFn: async (item: DmoItem) => {
      const tags = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const editRes = await apiRequest("POST", `/api/expert-workspace/content/${item.id}/edit`, {
        editedName: editName || undefined,
        editedDescription: editDescription || undefined,
        editedTags: tags.length > 0 ? tags : undefined,
      });
      const edit = await editRes.json();
      await apiRequest("PATCH", `/api/expert-workspace/edits/${edit.id}/submit`);
      return edit;
    },
    onSuccess: (_edit, item) => {
      setRefined((prev) => new Set(prev).add(item.id));
      queryClient.invalidateQueries({ queryKey: ["/api/expert-workspace/library"] });
      toast({ title: "Saved", description: "Your refinements were saved to this content." });
    },
    onError: (err: any) => {
      toast({ title: "Could not save", description: String(err?.message ?? err), variant: "destructive" });
    },
  });

  const { data, isLoading } = useQuery<LibraryResponse>({
    queryKey: ["/api/expert-workspace/library", "Kyoto", "picker"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/expert-workspace/library?city=Kyoto&limit=100`);
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (item: DmoItem) => {
      // L27-P1: never geocode client-side and never substitute a neighborhood centroid —
      // only carry the item's OWN latitude/longitude, and only when it's a real value.
      const withCoords = hasRealCoords(item);
      const res = await apiRequest("POST", `/api/trips/${tripId}/itinerary-items`, {
        title: item.name,
        description: item.description || undefined,
        itemType: TYPE_TO_ITEM[item.contentType] ?? "activity",
        locationName: item.neighborhood || item.name,
        ...(withCoords ? { latitude: String(item.latitude), longitude: String(item.longitude) } : {}),
        dayNumber,
      });
      return res.json();
    },
    onSuccess: (_res, item) => {
      setAdded((prev) => new Set(prev).add(item.id));
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/itinerary-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      onAdded();
      toast({ title: "Added to itinerary", description: `${item.name} → Day ${dayNumber}` });
    },
    // Plan-approval mode flip (migration 164): once the client approves a delivered plan, this
    // 409s with an honest "send it as a suggestion instead" message — parse it out rather than
    // showing the raw `"409: {...}"` string.
    onError: (err: any) => {
      toast({ title: "Couldn't add item", description: parseApiErrorMessage(err, "Please try again."), variant: "destructive" });
    },
  });

  const items = (data?.items ?? []).filter((it) =>
    !q.trim() || it.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  // W5-A (QA_PUNCH_LIST item 19) — publish this SAME filtered list (search already applied) as
  // candidate pins for the canvas map's discovery layer. Excludes already-`added` rows (once
  // added they become a real plan pin on the next refetch, so they shouldn't linger as a
  // separate candidate at the same coordinate) and anything failing the real-coords check (§13).
  usePublishMapCandidates(
    "dmo",
    "DMO Library",
    items
      .filter((it) => hasRealCoords(it) && !added.has(it.id))
      .map((it) => ({
        id: it.id,
        title: it.name,
        lat: typeof it.latitude === "number" ? it.latitude : parseFloat(String(it.latitude)),
        lng: typeof it.longitude === "number" ? it.longitude : parseFloat(String(it.longitude)),
        price: null,
      })),
    (id) => {
      const it = items.find((i) => i.id === id);
      if (it) addMutation.mutate(it);
    },
  );

  if (readerId) {
    return (
      <div className="space-y-3">
        <DmoReader
          itemId={readerId}
          tripId={tripId}
          focusDay={dayNumber}
          maxDay={maxDay}
          onBack={() => setReaderId(null)}
          onAdded={onAdded}
          onViewInLibrary={(name) => {
            setQ(name);
            setReaderId(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your library…"
            className="pl-8"
            data-testid="input-dmo-picker-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No approved content in your library yet. Ask an admin to approve DMO content — it will
            appear here, ready to refine and add to trips.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => {
              const isGuideItem = (it.shape ?? "place") === "guide";
              return (
              <div
                key={it.id}
                className="rounded-lg border p-3"
                data-testid={`dmo-picker-row-${it.id}`}
              >
                <div
                  className="flex items-start justify-between gap-3 cursor-pointer"
                  onClick={() => setReaderId(it.id)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{it.name}</span>
                      {isGuideItem ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-xs"
                          style={{ background: "var(--console-info-soft)", color: "var(--console-info)", borderColor: "var(--console-info)" }}
                        >
                          Guide
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="capitalize shrink-0 text-xs">{it.contentType}</Badge>
                      )}
                      {it.isRefined && (
                        <Badge className="shrink-0 text-xs gap-1" data-testid={`badge-refined-${it.id}`}>
                          <Sparkles className="w-3 h-3" /> Refined
                        </Badge>
                      )}
                    </div>
                    {it.neighborhood && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="w-3 h-3" /> {it.neighborhood}
                      </span>
                    )}
                    {it.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{it.description}</p>
                    )}
                    {isGuideItem && (it.extractedPlacesCount ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5" data-testid={`chip-dmo-extracted-${it.id}`}>
                        <PlaceDot n={it.extractedPlacesCount ?? 0} state="default" size={16} />
                        <span className="text-[11px]" style={{ color: "var(--console-mid)" }}>places extracted</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-stretch gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isGuideItem ? (
                      <Button
                        size="sm"
                        variant="outline"
                        style={{ background: "var(--console-info-soft)", color: "var(--console-info)", borderColor: "var(--console-info)" }}
                        onClick={() => setReaderId(it.id)}
                        data-testid={`button-dmo-read-${it.id}`}
                      >
                        <BookOpen className="w-3.5 h-3.5 mr-1" /> Read
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={added.has(it.id) ? "outline" : "default"}
                        disabled={added.has(it.id) || addMutation.isPending}
                        onClick={() => addMutation.mutate(it)}
                        data-testid={`button-dmo-add-${it.id}`}
                      >
                        {added.has(it.id) ? (
                          <><Check className="w-3.5 h-3.5 mr-1" />Added</>
                        ) : (
                          <><Plus className="w-3.5 h-3.5 mr-1" />Add</>
                        )}
                      </Button>
                    )}
                    {/* Refine (name/description/tags) is trivially compatible with guides —
                        it edits content metadata, not the itinerary-item shape — so it's kept. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => toggleRefine(it)}
                      data-testid={`button-dmo-refine-${it.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      {refiningId === it.id ? "Close" : "Refine"}
                    </Button>
                  </div>
                </div>

                {refiningId === it.id && (
                  <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-3" data-testid={`dmo-refine-editor-${it.id}`} onClick={(e) => e.stopPropagation()}>
                    <p className="text-xs text-muted-foreground flex gap-2">
                      <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      Refine the raw content below so it's ready to build into a Ready Made Trip or a
                      client itinerary.
                    </p>
                    {it.isRefined && it.raw && (
                      <p className="text-xs text-muted-foreground/80 rounded-md bg-background border px-2 py-1.5" data-testid={`dmo-refine-original-${it.id}`}>
                        Original (unrefined): <span className="italic">{it.raw.name}</span>
                        {it.raw.description ? ` — ${it.raw.description}` : ""}
                      </p>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor={`dmo-refine-name-${it.id}`} className="text-xs">Name</Label>
                      <Input
                        id={`dmo-refine-name-${it.id}`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        data-testid="input-dmo-refine-name"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`dmo-refine-description-${it.id}`} className="text-xs">Description</Label>
                      <Textarea
                        id={`dmo-refine-description-${it.id}`}
                        rows={4}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        data-testid="input-dmo-refine-description"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`dmo-refine-tags-${it.id}`} className="text-xs">Tags (comma-separated)</Label>
                      <Input
                        id={`dmo-refine-tags-${it.id}`}
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        data-testid="input-dmo-refine-tags"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {/* Factory wire B (carried from the retired dmo-library.tsx): library item →
                          Content Studio prefilled draft — research becomes social content. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() =>
                          navigate(
                            `/expert/content-studio?prefill=1&title=${encodeURIComponent(it.name ?? "")}` +
                              `&destination=Kyoto&type=travel-guide` +
                              `&description=${encodeURIComponent((it.description ?? "").slice(0, 500))}`,
                          )
                        }
                        data-testid={`button-social-post-${it.id}`}
                      >
                        Create social post
                      </Button>
                      <Button
                        size="sm"
                        disabled={submitEnrichment.isPending || refined.has(it.id)}
                        onClick={() => submitEnrichment.mutate(it)}
                        data-testid="button-dmo-refine-submit"
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1" />
                        {refined.has(it.id) ? "Saved" : submitEnrichment.isPending ? "Saving…" : "Save refinements"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

/**
 * "Add from DMO Library" — inside the expert trip workspace, browse the expert's
 * admin-approved DMO research content and drop a selected place onto the current
 * trip's itinerary. Writes via the live POST /api/trips/:tripId/itinerary-items
 * (the same endpoint AddItemModal uses) — no new server surface. Kyoto-scoped (§12).
 */
export function DmoPickerModal({
  tripId,
  dayNumber,
  onClose,
  onAdded,
}: {
  tripId: string;
  dayNumber: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="w-4 h-4 text-primary" />
            Add from DMO Library — Day {dayNumber}
          </DialogTitle>
          <DialogDescription>
            Your admin-approved Kyoto research content. Add a place to this trip's itinerary.
          </DialogDescription>
        </DialogHeader>
        {/* This standalone modal (unused by any call site today) has no day-list context
            beyond its own dayNumber — maxDay falls back to dayNumber itself. The workspace's
            embedded DmoPickerCore usage passes its real maxDay. */}
        <DmoPickerCore tripId={tripId} dayNumber={dayNumber} maxDay={dayNumber} onAdded={onAdded} />
      </DialogContent>
    </Dialog>
  );
}
