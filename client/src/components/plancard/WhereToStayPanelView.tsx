/**
 * WHERE TO STAY — the panel's render (smoke test 4, item 5; ledger `2026-10-02-smoke4-draft-fixes`).
 * Presentational only: every number and order comes from the server's `WhereToStayView`, and the
 * three answers are callbacks the container wires to `POST /api/trips/:tripId/where-to-stay`.
 *
 * §13 on every absence: a city with no hotels in our own inventory shows a "Hotels coming soon" slot
 * under each neighbourhood — never a fabricated name; a city with no neighbourhood data says so and
 * still offers the two answers that need none. No distance or travel time is printed (R242): the
 * reason line is a count of the plan's own days.
 */
import { useState } from "react";
import { BedDouble, MapPin } from "lucide-react";
import type { StayHotel, WhereToStayView } from "@shared/where-to-stay";

export const WHERE_TO_STAY_TITLE = "Where to stay";
export const WHERE_TO_STAY_SUBTITLE = "Optional — ranked by where your days are.";
export const HOTELS_COMING_SOON = "Hotels coming soon";
export const NO_LOCATED_ITEMS = "Once some of your stops are on the map, we'll rank neighbourhoods by them.";

export interface WhereToStayPanelViewProps {
  view: WhereToStayView;
  /** Owner or delegate (R129's choose role). Everyone else reads the ranking and sees no buttons. */
  canChoose: boolean;
  busy?: boolean;
  onStayHere?: (hotel: StayHotel) => void;
  onOwn?: (answer: { hotelName: string | null; neighborhoodSlug: string | null }) => void;
  onSkip?: () => void;
  /** After a "Stay here": the stay's name, and the free M8 re-anchor of each day's start. */
  bound?: { name: string } | null;
  onReanchor?: () => void;
  onDismissReanchor?: () => void;
}

export function WhereToStayPanelView({
  view,
  canChoose,
  busy = false,
  onStayHere,
  onOwn,
  onSkip,
  bound,
  onReanchor,
  onDismissReanchor,
}: WhereToStayPanelViewProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const [hotelName, setHotelName] = useState("");
  const [slug, setSlug] = useState("");

  if (bound) {
    return (
      <div className="rounded-lg border border-border p-4 space-y-2" data-testid="where-to-stay-bound">
        <p className="text-sm text-foreground">
          {bound.name} is on your plan. Start each day from there? It's free and moves none of your plan's items.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-[40px] items-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted/40"
            onClick={onReanchor}
            disabled={busy}
            data-testid="where-to-stay-reanchor"
          >
            Start my days from here
          </button>
          <button
            type="button"
            className="inline-flex min-h-[40px] items-center px-3 text-sm text-muted-foreground hover:text-foreground"
            onClick={onDismissReanchor}
            disabled={busy}
            data-testid="where-to-stay-reanchor-skip"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (!view.eligible) return null;

  return (
    <section className="rounded-lg border border-border p-4 space-y-3" data-testid="where-to-stay-panel">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BedDouble className="w-4 h-4" /> {WHERE_TO_STAY_TITLE}
        </h3>
        <p className="text-xs text-muted-foreground" data-testid="where-to-stay-subtitle">{WHERE_TO_STAY_SUBTITLE}</p>
      </div>

      {view.neighborhoods.length === 0 ? (
        view.unranked === "no_located_items" ? (
          // The city HAS neighbourhoods; the plan has nothing on the map to rank them by yet (§13 —
          // never "no neighbourhoods", which would be a false statement about the city).
          <p className="text-sm text-muted-foreground" data-testid="where-to-stay-no-located-items">
            {NO_LOCATED_ITEMS}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="where-to-stay-no-neighborhoods">
            {view.city ? `We don't have neighbourhoods for ${view.city} yet.` : "We don't have neighbourhoods for this city yet."}
          </p>
        )
      ) : (
        <ol className="space-y-3">
          {view.neighborhoods.map((n, i) => (
            <li key={n.slug} className="space-y-1" data-testid={`where-to-stay-neighborhood-${n.slug}`}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="text-sm font-semibold text-foreground">{n.name}</span>
                {/* Smoke 5 item 6: a tied option has no reason — its name stands alone. */}
                {n.reason ? (
                  <span className="text-xs text-muted-foreground" data-testid={`where-to-stay-reason-${n.slug}`}>
                    {n.reason}
                  </span>
                ) : null}
              </div>
              {!view.hotelsAvailable ? (
                <p className="pl-5 text-xs text-muted-foreground italic" data-testid={`where-to-stay-coming-soon-${n.slug}`}>
                  {HOTELS_COMING_SOON}
                </p>
              ) : n.hotels.length === 0 ? (
                <p className="pl-5 text-xs text-muted-foreground" data-testid={`where-to-stay-none-${n.slug}`}>
                  None of our hotels are here yet.
                </p>
              ) : (
                <ul className="pl-5 space-y-1">
                  {n.hotels.map((h) => (
                    <li key={`${h.kind}-${h.id}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1 text-foreground">
                        <MapPin className="w-3 h-3" /> {h.name}
                        {h.starRating ? <span className="text-xs text-muted-foreground">· {h.starRating}★</span> : null}
                      </span>
                      {canChoose ? (
                        <button
                          type="button"
                          className="text-xs font-semibold underline underline-offset-2 hover:text-foreground"
                          onClick={() => onStayHere?.(h)}
                          disabled={busy}
                          data-testid={`where-to-stay-stay-${h.kind}-${h.id}`}
                        >
                          Stay here
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      {canChoose ? (
        <div className="space-y-2 border-t border-border pt-3">
          {ownOpen ? (
            <div className="space-y-2" data-testid="where-to-stay-own-form">
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Your hotel's name"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                data-testid="where-to-stay-own-hotel"
              />
              {view.neighborhoods.length ? (
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  data-testid="where-to-stay-own-neighborhood"
                >
                  <option value="">…or just the neighbourhood</option>
                  {view.neighborhoods.map((n) => (
                    <option key={n.slug} value={n.slug}>
                      {n.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                className="inline-flex min-h-[40px] items-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted/40"
                onClick={() => onOwn?.({ hotelName: hotelName.trim() || null, neighborhoodSlug: slug || null })}
                disabled={busy || (!hotelName.trim() && !slug)}
                data-testid="where-to-stay-own-save"
              >
                Save
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {!ownOpen ? (
              <button
                type="button"
                className="text-sm font-semibold underline underline-offset-2"
                onClick={() => setOwnOpen(true)}
                disabled={busy}
                data-testid="where-to-stay-own"
              >
                I've got lodging sorted
              </button>
            ) : null}
            <button
              type="button"
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={onSkip}
              disabled={busy}
              data-testid="where-to-stay-skip"
            >
              Skip — start each day at its first stop
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
