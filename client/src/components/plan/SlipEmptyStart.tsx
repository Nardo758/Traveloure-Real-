/**
 * THE EMPTY BOARD'S START — the draft card, the two "other ways in" rows and the footnote, under
 * the anchor question on an owner's plan that holds no items yet (slip conformance, Empty board,
 * boards rev 15; ledger `2026-10-08-conformance-slip-phase0`).
 *
 * Every control here is an EXISTING rail, re-dressed. Nothing on this card is new backend.
 *   · Draft: the ONE free-draft action (`useSlipFreeDraft`, shared with the rail row). It asks for
 *     dates first when nobody chose them (canvas note s12). Coral fill, white text (ruling 2).
 *   · Browse: switches the slip to its map, where the Browse layer is the slip's own supply browse
 *     (surface spec R-b). It does not leave the plan.
 *   · Hand off: the ONE handoff chooser (`openHandoffChooser`). The fee is the server's quote,
 *     shown in the chooser before anything is held.
 *
 * §13 — the board's copy is kept where it is true and changed where it is not:
 *   · "hours and addresses checked on Google Maps" is said only while the Places spine is switched
 *     on (`PLACE_FACTS_PLACES_ENABLED`, read off `/api/health`). With it off or unknown, no claim.
 *   · "We'll ask for your dates first" is said only when the press will actually ask.
 *   · The Browse row says what the layer holds (activities, dining, stays, local hosts). The
 *     board's "Gems, experts' picks, events this week" is not what that layer shows.
 *   · "Hand it to a <city> local" names the city only when the expert door reports a local live
 *     in this plan's market. Otherwise it reads "Hand it to a local expert".
 */
import { Search, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useHealthFlags } from "@/lib/health-flags";
import { anyLocalLive } from "@/lib/item-row-menu";
import { openHandoffChooser } from "@/lib/handoff-client";
import { useSlipFreeDraft, type FreeDraftTripInput } from "./useSlipFreeDraft";

/** "Kyoto, Japan" → "Kyoto" — the same first-segment reading the map's Browse layer uses. */
export function planCityName(destination: string | null | undefined): string | null {
  const city = String(destination ?? "").split(",")[0].trim();
  return city.length > 0 ? city : null;
}

export const EMPTY_FOOTNOTE_NOTHING_CHARGED = "Nothing is booked or charged until you say so.";
export const EMPTY_FOOTNOTE_PLACES = "Facts on places come from Google Maps and show when they were checked.";
export const EMPTY_BROWSE_DETAIL = "Activities, dining, places to stay and local hosts";
export const EMPTY_HANDOFF_DETAIL = "An expert plans it with you · fee shown before you commit";

/** The draft card's sentence, built from what this press will really do (§13). */
export function emptyDraftDetail(opts: { asksDatesFirst: boolean; placesFactsOn: boolean }): string {
  const sketch = opts.placesFactsOn
    ? "sketch real places with hours and addresses checked on Google Maps"
    : "sketch real places";
  const lead = opts.asksDatesFirst ? `We'll ask for your dates first, then ${sketch}` : `We'll ${sketch}`;
  return `Free. About a minute. ${lead} — you'll swap and reorder from there.`;
}

export function SlipEmptyStart({
  tripId,
  trip,
  onBrowse,
}: {
  tripId: string;
  trip: FreeDraftTripInput;
  /** Switches the slip to its map view, where the Browse layer opens on an empty plan. */
  onBrowse: () => void;
}) {
  const draft = useSlipFreeDraft(trip, tripId);
  const flags = useHealthFlags();
  const placesFactsOn = flags?.PLACE_FACTS_PLACES_ENABLED === true;
  const city = planCityName(trip.destination);
  // The expert door's own overview (shared cache with the item rows' "Ask a local").
  const { data: help } = useQuery<{ levels?: { expertCount: number }[] }>({
    queryKey: [`/api/trips/${tripId}/expert-help`],
    retry: false,
  });
  const localLive = anyLocalLive(help);

  return (
    <div className="space-y-3.5" data-testid="slip-empty-start">
      <section
        className="space-y-3 rounded-[var(--slip-radius-card)] bg-[color:var(--slip-navy)] p-[18px] text-white"
        data-testid="slip-empty-draft-card"
      >
        <h2 className="slip-display text-[21px] font-semibold leading-[1.15] text-white">
          {city ? `Draft your days in ${city}` : "Draft your days"}
        </h2>
        <p className="text-sm leading-[1.45] text-[color:var(--slip-on-navy-muted)]" data-testid="slip-empty-draft-detail">
          {emptyDraftDetail({ asksDatesFirst: draft.asksDatesFirst, placesFactsOn })}
        </p>
        <button
          type="button"
          className="flex h-[50px] w-full items-center justify-center rounded-[var(--slip-radius-button)] bg-[color:var(--slip-primary)] text-[15px] font-semibold text-[color:var(--slip-primary-ink)] hover:brightness-95 disabled:opacity-60"
          onClick={() => draft.mutate()}
          disabled={!!draft.disabledReason || draft.isPending}
          title={draft.disabledReason ?? undefined}
          // Main-rail (ledger `2026-10-08-slip-main-rail`): with the rail gone this IS the slip's one
          // AI action on an empty plan, so it carries that action's testid; the map band's
          // `SlipDraftAiRow` is the other placement, and exactly one renders per view.
          data-testid="slip-action-draft-ai"
        >
          {draft.isPending ? "Drafting…" : "Draft it with AI · free"}
        </button>
        {draft.datesPanel}
      </section>

      <div className="space-y-2">
        <button
          type="button"
          className="flex min-h-[60px] w-full items-center gap-3.5 rounded-[14px] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] px-4 py-2 text-left hover:bg-[color:var(--slip-ground)]"
          onClick={onBrowse}
          data-testid="slip-empty-browse"
        >
          <Search className="h-[22px] w-[22px] flex-shrink-0 text-[color:var(--slip-teal)]" aria-hidden="true" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-[color:var(--slip-ink)]">
              {city ? `Browse ${city} and add stops yourself` : "Browse and add stops yourself"}
            </span>
            <span className="text-[13px] text-[color:var(--slip-muted)]">{EMPTY_BROWSE_DETAIL}</span>
          </span>
        </button>
        <button
          type="button"
          className="flex min-h-[60px] w-full items-center gap-3.5 rounded-[14px] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] px-4 py-2 text-left hover:bg-[color:var(--slip-ground)]"
          onClick={() => openHandoffChooser({})}
          data-testid="slip-empty-handoff"
        >
          <UserRound className="h-[22px] w-[22px] flex-shrink-0 text-[color:var(--slip-teal)]" aria-hidden="true" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-[color:var(--slip-ink)]">
              {localLive && city ? `Hand it to a ${city} local` : "Hand it to a local expert"}
            </span>
            <span className="text-[13px] text-[color:var(--slip-muted)]">{EMPTY_HANDOFF_DETAIL}</span>
          </span>
        </button>
      </div>

      <p className="px-1 text-xs leading-normal text-[color:var(--slip-muted)]" data-testid="slip-empty-footnote">
        {EMPTY_FOOTNOTE_NOTHING_CHARGED}
        {placesFactsOn ? ` ${EMPTY_FOOTNOTE_PLACES}` : ""}
      </p>
    </div>
  );
}
