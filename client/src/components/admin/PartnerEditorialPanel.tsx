/**
 * CMS-1 (ledger `2026-11-04-cms1-launch-screens`): the editor for PARTNER-1's editorial columns (migration 432). Lists a
 * table's cached partner items by provider/partner and city; for each, our own short description and a "Reviewed"
 * button. The server screens the text (422 with the words) and stamps `editorial_reviewed_at`; only then does a traveler
 * read it. Console copy only.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EDITORIAL_REVIEWED_LABEL } from "@/lib/cms-console-copy";

export const PARTNER_ITEM_TABLE_LABELS = {
  fever_event_cache: "Fever events",
  activity_cache: "Activities",
  hotel_cache: "Hotels",
  affiliate_products: "Partner products",
} as const;
type Table = keyof typeof PARTNER_ITEM_TABLE_LABELS;

interface Item {
  id: string;
  name: string | null;
  source: string | null;
  city: string | null;
  editorialDescription: string | null;
  editorialReviewedAt: string | null;
}

export function partnerItemsUrl(table: Table, city: string, source: string): string {
  const q = new URLSearchParams({ table });
  if (city.trim()) q.set("city", city.trim());
  if (source.trim()) q.set("source", source.trim());
  return `/api/admin/partner-items?${q.toString()}`;
}

export function PartnerEditorialPanel() {
  const qc = useQueryClient();
  const [table, setTable] = useState<Table>("fever_event_cache");
  const [city, setCity] = useState("");
  const [source, setSource] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const url = partnerItemsUrl(table, city, source);
  const { data, isLoading, isError } = useQuery<{ items: Item[] }>({ queryKey: [url] });

  const review = async (item: Item) => {
    const text = drafts[item.id] ?? item.editorialDescription ?? "";
    setSaving(item.id);
    setErrors((e) => ({ ...e, [item.id]: "" }));
    try {
      const res = await fetch(`/api/admin/partner-items/${table}/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ editorialDescription: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors((e) => ({ ...e, [item.id]: String(body?.message ?? `Failed (${res.status})`) }));
        return;
      }
      await qc.invalidateQueries({ queryKey: [url] });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card data-testid="partner-editorial-panel">
      <CardHeader>
        <CardTitle>Editorial descriptions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PARTNER_ITEM_TABLE_LABELS) as Table[]).map((t) => (
            <Button key={t} size="sm" variant={t === table ? "default" : "outline"} onClick={() => setTable(t)} data-testid={`partner-editorial-table-${t}`}>
              {PARTNER_ITEM_TABLE_LABELS[t]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} data-testid="partner-editorial-city" />
          <Input className="max-w-xs" placeholder="Provider or partner id" value={source} onChange={(e) => setSource(e.target.value)} data-testid="partner-editorial-source" />
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {isError ? <p className="text-sm text-destructive">Couldn't load the items.</p> : null}
        {data && data.items.length === 0 ? <p className="text-sm text-muted-foreground">No items match.</p> : null}
        <ul className="space-y-3">
          {(data?.items ?? []).map((item) => (
            <li key={item.id} className="rounded-md border p-3 space-y-2" data-testid={`partner-editorial-item-${item.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{item.name ?? item.id}</p>
                <p className="text-xs text-muted-foreground">
                  {[item.source, item.city].filter(Boolean).join(" · ")}
                  {item.editorialReviewedAt ? ` · ${EDITORIAL_REVIEWED_LABEL} ${new Date(item.editorialReviewedAt).toLocaleDateString()}` : ""}
                </p>
              </div>
              <Textarea
                value={drafts[item.id] ?? item.editorialDescription ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                maxLength={600}
                data-testid={`partner-editorial-text-${item.id}`}
              />
              {errors[item.id] ? <p className="text-sm text-destructive" data-testid={`partner-editorial-error-${item.id}`}>{errors[item.id]}</p> : null}
              <Button size="sm" onClick={() => review(item)} disabled={saving === item.id} data-testid={`partner-editorial-review-${item.id}`}>
                {EDITORIAL_REVIEWED_LABEL}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
