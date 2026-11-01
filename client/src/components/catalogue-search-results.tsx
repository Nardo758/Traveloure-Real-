/**
 * Row 305 (CS-3 brief 8, D): the catalogue results under the city page's one search box.
 *
 * Reads `GET /api/search/catalogue` and draws each result with EXACTLY ONE action: Book (our listing, opens it),
 * Book on Viator / Book on the official site (a link out), or Add to plan (the existing add dialog). A Viator
 * result shows its attribution, its live price with the time it was read, and the commission line. A checked
 * place shows "from <source> · <checked date>", or "Not checked yet" with the official site. No request
 * action, no fee line.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CATALOGUE_QUERY_MIN, CATALOGUE_SEARCH_COPY, normalizeCatalogueQuery, type CatalogueResult, type CatalogueSearchResponse } from "@shared/catalogue-search";
import {
  CATALOGUE_RESULT_COPY,
  catalogueActionLabel,
  catalogueAddItem,
  catalogueTimeZone,
  viatorPriceLine,
} from "@/lib/catalogue-search-copy";

export function catalogueSearchUrl(city: string, query: string): string {
  return `/api/search/catalogue?city=${encodeURIComponent(city)}&q=${encodeURIComponent(query)}`;
}

/** The debounced query the results read. */
function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CatalogueResultRow({
  result,
  timeZone,
  onAdd,
}: {
  result: CatalogueResult;
  timeZone: string | null;
  onAdd: (item: Record<string, unknown>) => void;
}) {
  const label = catalogueActionLabel(result);
  const price = result.kind === "partner_viator" ? viatorPriceLine(result.livePrice, timeZone) : null;
  return (
    <li className="flex items-start justify-between gap-3 py-2.5" data-testid={`catalogue-result-${result.id}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium m-0 truncate">{result.title}</p>
        {result.attribution && (
          <p className="text-[11px] text-muted-foreground m-0" data-testid={`catalogue-attribution-${result.id}`}>
            {result.attribution}
          </p>
        )}
        {price && (
          <p className="text-[11px] text-muted-foreground m-0" data-testid={`catalogue-price-${result.id}`}>
            {price}
          </p>
        )}
        {result.kind === "partner_viator" && (
          <p className="text-[11px] text-muted-foreground m-0" data-testid={`catalogue-commission-${result.id}`}>
            {CATALOGUE_RESULT_COPY.commission}
          </p>
        )}
        {result.checked && (
          <p className="text-[11px] text-muted-foreground m-0" data-testid={`catalogue-checked-${result.id}`}>
            <a href={result.checked.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
              from {result.checked.sourceName}
            </a>
            {" · "}
            {result.checked.checked}
          </p>
        )}
        {result.notChecked && (
          <p className="text-[11px] text-muted-foreground m-0" data-testid={`catalogue-not-checked-${result.id}`}>
            {CATALOGUE_RESULT_COPY.notCheckedYet}
            {result.notChecked.officialUrl && (
              <>
                {" · "}
                <a href={result.notChecked.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                  {CATALOGUE_RESULT_COPY.officialSiteLink}
                </a>
              </>
            )}
          </p>
        )}
      </div>
      <div className="shrink-0" data-testid={`catalogue-action-${result.id}`}>
        {result.action.type === "book" ? (
          <Button asChild size="sm" className="h-8 text-xs">
            <Link href={result.action.href}>{label}</Link>
          </Button>
        ) : result.action.type === "book_on_site" ? (
          <Button asChild size="sm" variant="outline" className="h-8 text-xs">
            <a href={result.action.href} target="_blank" rel="noopener noreferrer nofollow sponsored">
              {label}
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onAdd(catalogueAddItem(result))}>
            {label}
          </Button>
        )}
      </div>
    </li>
  );
}

/** The results panel: nothing until the query is long enough; the approved empty line when nothing matched. */
export function CatalogueSearchView({
  data,
  status,
  city,
  onAdd,
}: {
  data: CatalogueSearchResponse | undefined;
  status: "idle" | "loading" | "error" | "ready";
  city: string;
  onAdd: (item: Record<string, unknown>) => void;
}) {
  if (status === "idle") return null;
  const timeZone = catalogueTimeZone(city);
  return (
    <div className="max-w-4xl rounded-lg border bg-card px-4" data-testid="catalogue-results">
      {status === "loading" && <p className="text-sm text-muted-foreground py-3 m-0">{CATALOGUE_RESULT_COPY.searching}</p>}
      {status === "error" && <p className="text-sm text-muted-foreground py-3 m-0">{CATALOGUE_RESULT_COPY.searchFailed}</p>}
      {status === "ready" && (data?.results.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground py-3 m-0" data-testid="catalogue-empty">
          {CATALOGUE_SEARCH_COPY.empty}
        </p>
      )}
      {status === "ready" && (data?.results.length ?? 0) > 0 && (
        <ul className="divide-y list-none p-0 m-0">
          {data!.results.map((r) => (
            <CatalogueResultRow key={r.id} result={r} timeZone={timeZone} onAdd={onAdd} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function CatalogueSearchResults({
  city,
  query,
  onAdd,
}: {
  city: string;
  query: string;
  onAdd: (item: Record<string, unknown>) => void;
}) {
  const q = normalizeCatalogueQuery(useDebounced(query, 300));
  const active = !!city && q.length >= CATALOGUE_QUERY_MIN;
  const read = useQuery<CatalogueSearchResponse>({
    queryKey: [catalogueSearchUrl(city, q)],
    enabled: active,
    staleTime: 0,
  });
  const status = !active ? "idle" : read.isError ? "error" : read.data ? "ready" : "loading";
  return <CatalogueSearchView data={read.data} status={status} city={city} onAdd={onAdd} />;
}
