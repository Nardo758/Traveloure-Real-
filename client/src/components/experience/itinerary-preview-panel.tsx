import { MapPin, Calendar, Users, Sparkles, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PreviewItem {
  id: string;
  name: string;
  type: string;
  price: number;
  quantity: number;
  provider?: string;
}

/**
 * ItineraryPreviewPanel — the inline "Itinerary Preview" view that shares the
 * template's right panel with the map (Map | Preview tab). It shows the plan
 * taking shape as the traveler adds items: header (destination/dates/party),
 * the selections grouped by category, and a running total + per-person cost.
 * "See full comparison" hands off to the AI comparison page (createComparison).
 * Read-only summary — no money decision here.
 */
export function ItineraryPreviewPanel({
  destination,
  startDate,
  endDate,
  travelers,
  items,
  total,
  onRemove,
  onGenerate,
  generating,
  canGenerate,
}: {
  destination: string;
  startDate?: Date;
  endDate?: Date;
  travelers: number;
  items: PreviewItem[];
  total: number;
  onRemove?: (id: string) => void;
  onGenerate?: () => void;
  generating?: boolean;
  canGenerate?: boolean;
}) {
  const fmtDate = (d?: Date) =>
    d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

  // Group selections by category so the plan reads as sections, not a flat list.
  const groups = items.reduce<Record<string, PreviewItem[]>>((acc, item) => {
    const key = (item.type || "other").replace(/_/g, " ");
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups).sort();

  const perPerson = travelers > 0 ? total / travelers : total;

  return (
    <div className="h-full flex flex-col bg-muted/20" data-testid="itinerary-preview-panel">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles className="w-4 h-4 text-primary" />
          Itinerary Preview
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {destination && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3 text-primary" />
              {destination}
            </span>
          )}
          {fmtDate(startDate) && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {fmtDate(startDate)}
              {fmtDate(endDate) ? ` → ${fmtDate(endDate)}` : ""}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {travelers} {travelers === 1 ? "traveler" : "travelers"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-10">
            <Sparkles className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm font-medium">Your plan will appear here</p>
            <p className="text-xs mt-1 max-w-[16rem]">
              Add services from the list or the map and watch your itinerary take shape.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupKeys.map((key) => (
              <div key={key} data-testid={`preview-group-${key.replace(/\s+/g, "-")}`}>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  {key}
                </h4>
                <ul className="space-y-1.5">
                  {groups[key].map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-md border bg-background px-3 py-2"
                      data-testid={`preview-item-${item.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{item.name}</div>
                        {item.provider && (
                          <div className="text-[11px] text-muted-foreground truncate">{item.provider}</div>
                        )}
                      </div>
                      <div className="text-sm font-semibold tabular-nums shrink-0">
                        ${(item.price * (item.quantity || 1)).toLocaleString()}
                      </div>
                      {onRemove && (
                        <button
                          type="button"
                          onClick={() => onRemove(item.id)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          aria-label={`Remove ${item.name}`}
                          data-testid={`preview-remove-${item.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer: running totals + CTA */}
      <div className="flex-shrink-0 border-t bg-background px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            Running total
          </span>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums" data-testid="preview-total">
              ${total.toLocaleString()}
            </div>
            {travelers > 1 && (
              <div className="text-[11px] text-muted-foreground tabular-nums">
                ${perPerson.toLocaleString(undefined, { maximumFractionDigits: 0 })}/person
              </div>
            )}
          </div>
        </div>
        <Button
          className="w-full bg-primary"
          size="sm"
          onClick={onGenerate}
          disabled={!canGenerate || items.length === 0 || generating}
          data-testid="button-preview-generate"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {generating ? "Building preview…" : "See full comparison"}
        </Button>
        <p className="text-[11px] text-center text-muted-foreground">
          Our AI arranges your picks into a day-by-day plan with optimized alternatives.
        </p>
      </div>
    </div>
  );
}
