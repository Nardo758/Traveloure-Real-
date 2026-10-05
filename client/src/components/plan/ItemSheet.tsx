/**
 * `ItemSheet` — the ONE "more info" surface for a stop (surface spec v1.3.4 R-ap, §3; step 6 — ledger
 * `2026-10-04-step6-trip-card`). Opened by tapping the stop's photo, its title, or ⋯ → Details, on the
 * slip (edit) and on the Trip Card (read). It shows: the photo with its attribution (R-aq), every fact
 * with its source and checked date, the expert's note, "Ask a local about this", Navigate, and the
 * row's own booking action when a path exists. There is no separate place page from the slip.
 * It changes nothing itself: every action is the caller's existing rail.
 */
import type { ReactNode } from "react";
import { Navigation } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExpertNote } from "./ExpertNote";
import { PlacePhoto } from "./PlacePhoto";
import { sheetFactLines } from "@/lib/place-facts";
import type { FactView } from "@shared/content-facts";
import type { PhotoView } from "@shared/place-photos";

export interface ItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: { id: string; name: string; time?: string | null; location?: string | null };
  facts?: readonly FactView[];
  timeZone?: string | null;
  photo?: PhotoView | null;
  expertNote?: { note: string; author: string | null } | null;
  /** "Ask a local about this" — the row's own R-m door (records interest with no local live). */
  onAskLocal?: (() => void) | null;
  askLocalLabel?: string;
  /** R321 (S11-5): the question panel, drawn under the actions while open (the card records interest here). */
  askLocalPanel?: ReactNode;
  navigateHref?: string | null;
  /** The row's existing booking action, when a path exists ("Book this for me" lands in step 7). */
  bookingAction?: ReactNode;
  bookingLine?: string | null;
}

export function ItemSheet(props: ItemSheetProps) {
  const { item: a } = props;
  const lines = sheetFactLines(props.facts, props.timeZone ?? null);
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:max-w-lg sm:mx-auto" data-testid={`item-sheet-${a.id}`}>
        <SheetHeader>
          <SheetTitle data-testid={`item-sheet-title-${a.id}`}>{a.name}</SheetTitle>
          <SheetDescription>{[a.time, a.location].filter(Boolean).join(" · ") || "Details"}</SheetDescription>
        </SheetHeader>
        <div className="mt-3 space-y-3">
          <PlacePhoto photo={props.photo} testId={`item-sheet-photo-${a.id}`} />
          {lines.length ? (
            <dl className="space-y-2" data-testid={`item-sheet-facts-${a.id}`}>
              {lines.map((l, i) => (
                <div key={`${l.label}-${i}`} className="text-sm">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{l.label}</dt>
                  <dd className="text-foreground">{l.text}</dd>
                  <dd className="text-xs text-muted-foreground" data-testid={`item-sheet-fact-source-${a.id}-${i}`}>
                    {l.sourceUrl ? (
                      <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {l.source}
                      </a>
                    ) : (
                      l.source
                    )}
                    {l.stale ? " (may have changed)" : ""}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid={`item-sheet-no-facts-${a.id}`}>
              We haven't checked this stop's details yet.
            </p>
          )}
          {props.expertNote ? <ExpertNote note={props.expertNote.note} author={props.expertNote.author} /> : null}
          {props.bookingLine ? <p className="text-xs text-muted-foreground">{props.bookingLine}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {props.navigateHref ? (
              <Button asChild size="sm" variant="outline">
                <a href={props.navigateHref} target="_blank" rel="noopener noreferrer" data-testid={`item-sheet-navigate-${a.id}`}>
                  <Navigation className="w-3.5 h-3.5 mr-1" />
                  Navigate
                </a>
              </Button>
            ) : null}
            {props.onAskLocal ? (
              <Button size="sm" variant="outline" onClick={props.onAskLocal} data-testid={`item-sheet-ask-local-${a.id}`}>
                {props.askLocalLabel ?? "Ask a local about this"}
              </Button>
            ) : null}
            {props.bookingAction ?? null}
          </div>
          {props.askLocalPanel ?? null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
