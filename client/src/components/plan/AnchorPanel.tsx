/**
 * `AnchorPanel` — the ONE lodging surface on the slip (surface spec v1.2 §3; step 3, ledger
 * `2026-10-03-surface-step3-anchor-panel`). It replaces the pre-draft "Where are you staying?" card
 * (`SlipAnchorQuestion`) and the post-draft `WhereToStayPanel`, both deleted.
 *
 *   EMPTY (no draft yet)  the anchor question, worded from the group manifest, marked optional, with
 *                         "Add places I'm considering" / "I've got lodging sorted" / "Skip for now".
 *                         A schedule-first Trip (M7, `fixed_item`) asks what is fixed instead.
 *   DRAFTED, options      the ranked neighbourhoods (stored per draft), each with its one-liner (R-x)
 *                         and its stays — platform-listed first, badged "Traveloure stay" (R-o). When
 *                         the top two tie on day-count, the top one says why it leads; the rest say
 *                         nothing.
 *   DRAFTED, collapsed    R-y: no option has a stay ⇒ one line, "Best area for these days: <top> ·
 *                         <one-liner> · Skip".
 *
 *   CHOOSER (the tray)    smoke 8 item 1: the tools tray's "Where to stay" chip ALWAYS opens the full
 *                         chooser — the ranking when there is one, then "Add places I'm considering"
 *                         / "I've got lodging sorted" / "Skip for now" — whatever was skipped before.
 *
 * Skip dismisses the panel for the CURRENT state only (smoke 8 item 1): the server marks the view
 * `dismissed`, the slip draws nothing, and a Skip before the draft still lets the drafted panel (or
 * its collapsed line) appear once after the draft. Every order and number is the server's
 * (`WhereToStayView`); this file restates no rule (§18 rule 1). No distance or minute is printed
 * (R242) — the tie note names the basis and says "(est.)".
 */
import { PlacePhoto } from "./PlacePhoto";
import { HAND_ADDED_STAY_LINE } from "@shared/where-to-stay";
import {
  GOOGLE_MAPS_ATTRIBUTION,
  STAY_CHANGED_LINE,
  STAY_HERE_LABEL,
  STAY_MAP_LINK_LABEL,
  STAY_PICK_SUBTITLE,
  STAY_PICK_TITLE,
  STAY_STRAIGHT_LINE_SUBTITLE,
  STAY_STRAIGHT_LINE_TITLE,
  STAY_SWAP_LEAD,
  stayCardModel,
  stayClosenessLine,
  stayMapsHref,
} from "@/lib/stay-card";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { BedDouble, ChevronRight, ExternalLink, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  PLATFORM_STAY_BADGE,
  STAY_TIE_BREAK_NOTE,
  anchorPanelMode,
  collapsedStayLine,
  type StayHotel,
  type WhereToStayView,
} from "@shared/where-to-stay";

export const ANCHOR_PANEL_OPTIONAL = "Optional";
/** The Empty board's eyebrow over the anchor question ("Start here · optional"). */
export const ANCHOR_PANEL_START_HERE = "Start here";
/**
 * The Empty board's sentence under "Where are you staying?". Both halves are what the code does:
 * the free draft is built around an open lodging set (LD 57 §M5), and with no stay the draft
 * still runs and where-to-stay is ranked afterwards (smoke 4 item 5).
 */
export const ANCHOR_PANEL_EMPTY_DETAIL =
  "Add one to three places you're considering and every day gets built around them. Not sure yet? Draft first — we'll suggest a neighborhood once your days exist.";
export const ANCHOR_PANEL_DRAFTED_TITLE = "Where to stay";
export const ANCHOR_PANEL_DRAFTED_SUBTITLE = "Optional — ranked by where your days are.";
export const ANCHOR_PANEL_ADD_PLACES = "Add places I'm considering";
export const ANCHOR_PANEL_SORTED = "I've got lodging sorted";
export const ANCHOR_PANEL_SKIP = "Skip for now";
export const ANCHOR_PANEL_CHANGE = "Change where I'm staying";
export const ANCHOR_PANEL_DECIDING = "I'm deciding — compare places";
export const ANCHOR_PANEL_HAND_ADDED = HAND_ADDED_STAY_LINE;
export const HOTELS_COMING_SOON = "Hotels coming soon";
export const NO_LOCATED_ITEMS = "Once some of your stops are on the map, we'll rank neighborhoods by them.";
export const FIXED_ITEM_QUESTION = "What's fixed on these dates?";
export const FIXED_ITEM_DETAIL = "Add what's already booked — the rounds, the match, the show. Where you stay is chosen around it.";

type Bind =
  | { kind: "stay_here"; hotel: { kind: StayHotel["kind"]; id: string } }
  | { kind: "own"; hotelName: string | null; neighborhoodSlug: string | null }
  | { kind: "skip" };

export interface AnchorPanelViewProps {
  /** `empty` before a draft exists; `drafted` once the server ranks neighbourhoods; `chooser` in the tray. */
  stage: "empty" | "drafted" | "chooser" | "change";
  /**
   * Smoke 9 S9-2 (`change` stage): the plan's lodging set (open or chosen), when it has one. A plan
   * whose stay was added by hand has none.
   */
  lodgingSet?: { id: string; status: string } | null;
  /** The compare page for `lodgingSet` ("I'm deciding — compare places"). */
  compareHref?: string | null;
  onReopen?: () => void;
  /** The manifest's anchor question (`manifestFor(group).anchorQuestion`). */
  question: string;
  /** M7: a schedule-first Trip asks what is fixed, not where to stay. */
  anchorKind: "lodging" | "fixed_item";
  /** When the occasion did not say whether it has a schedule (`TripsAnchor.fromFallback`). */
  fromFallback?: boolean;
  view?: WhereToStayView | null;
  canChoose: boolean;
  busy?: boolean;
  /** The existing comparison starter, labelled "Add places I'm considering". */
  addPlacesControl?: ReactNode;
  /** The existing day-1 add control, for a fixed-item anchor. */
  addFixedControl?: ReactNode;
  onStayHere?: (hotel: StayHotel) => void;
  onOwn?: (answer: { hotelName: string | null; neighborhoodSlug: string | null }) => void;
  onSkip?: () => void;
  bound?: { name: string } | null;
  onReanchor?: () => void;
  onDismissReanchor?: () => void;
}

const btn = "inline-flex min-h-[40px] items-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted/40";
const link = "text-sm font-semibold underline underline-offset-2";
const quiet = "text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground";

function OwnForm({
  neighborhoods,
  busy,
  onSave,
}: {
  neighborhoods: ReadonlyArray<{ slug: string; name: string }>;
  busy: boolean;
  onSave: (a: { hotelName: string | null; neighborhoodSlug: string | null }) => void;
}) {
  const [hotelName, setHotelName] = useState("");
  const [slug, setSlug] = useState("");
  return (
    <div className="space-y-2" data-testid="where-to-stay-own-form">
      <input
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        placeholder="Your hotel's name"
        value={hotelName}
        onChange={(e) => setHotelName(e.target.value)}
        data-testid="where-to-stay-own-hotel"
      />
      {neighborhoods.length ? (
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          data-testid="where-to-stay-own-neighborhood"
        >
          <option value="">…or just the neighborhood</option>
          {neighborhoods.map((n) => (
            <option key={n.slug} value={n.slug}>
              {n.name}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className={btn}
        onClick={() => onSave({ hotelName: hotelName.trim() || null, neighborhoodSlug: slug || null })}
        disabled={busy || (!hotelName.trim() && !slug)}
        data-testid="where-to-stay-own-save"
      >
        Save
      </button>
    </div>
  );
}

/**
 * S1 "one stay on the plan" (Locked Decision 64): the server's `stay` block as a board card. A
 * routed plan shows its ONE pick with "scored N of M nearby"; a free plan shows up to three stays
 * closest by straight line. "Stay here" binds through the SAME `stay_here` answer the ranked list
 * uses; the swap is the existing "Add places I'm considering" starter. The link slot is the Maps
 * fallback, with its attribution beside it, until FU-S1-2 serves the hotel's own site. Words:
 * `@/lib/stay-card`. No price, no commission (ruling 5) — the payload carries neither.
 */
export function StayPickCard({
  view,
  canChoose,
  busy,
  onStayHere,
  swapControl,
}: {
  view: WhereToStayView;
  canChoose: boolean;
  busy: boolean;
  onStayHere?: (hotel: StayHotel) => void;
  swapControl?: ReactNode;
}) {
  const model = stayCardModel(view.stay);
  if (!model) return null;
  const routed = model.tier === "routed";
  return (
    <section
      className="space-y-2 rounded-[var(--slip-radius-card,12px)] border border-[color:var(--slip-teal,#2E8B8B)] bg-[color:var(--slip-card,#fff)] p-3"
      data-testid="stay-pick-card"
      data-stay-tier={model.tier}
    >
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-teal-ink,#1F6F6F)]" data-testid="stay-pick-title">
          {routed ? STAY_PICK_TITLE : STAY_STRAIGHT_LINE_TITLE}
        </p>
        <p className="text-xs text-[color:var(--slip-muted,#5B6B7A)]" data-testid="stay-pick-subtitle">
          {routed ? STAY_PICK_SUBTITLE : STAY_STRAIGHT_LINE_SUBTITLE}
        </p>
        {model.scoredLine ? (
          <p className="text-xs text-[color:var(--slip-muted,#5B6B7A)]" data-testid="stay-pick-scored">
            {model.scoredLine}
          </p>
        ) : null}
        {model.changed ? (
          <p className="text-xs font-semibold text-[color:var(--slip-ink,#1A1A18)]" data-testid="stay-pick-changed">
            {STAY_CHANGED_LINE}
          </p>
        ) : null}
      </div>
      <ul className="space-y-2">
        {model.hotels.map((h) => (
          <li key={`${h.kind}-${h.id}`} className="flex flex-wrap items-center justify-between gap-2" data-testid={`stay-pick-hotel-${h.kind}-${h.id}`}>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-foreground">
              {h.photo ? <PlacePhoto photo={h.photo} size="thumb" testId={`stay-pick-photo-${h.id}`} /> : <BedDouble className="h-4 w-4" aria-hidden="true" />}
              <span className="font-semibold">{h.name}</span>
              {h.starRating ? <span className="text-xs text-[color:var(--slip-muted,#5B6B7A)]">· {h.starRating}★</span> : null}
              {h.kind === "platform" ? (
                <span className="rounded border border-border px-1.5 text-[11px] text-[color:var(--slip-muted,#5B6B7A)]">{PLATFORM_STAY_BADGE}</span>
              ) : null}
            </span>
            {stayClosenessLine(h.closeness) ? (
              // R394: S1's own per-day closeness, display only — the card computes nothing.
              <span className="basis-full text-xs font-semibold text-[color:var(--slip-teal-ink,#1F6F6F)]" data-testid={`stay-pick-closeness-${h.id}`}>
                {stayClosenessLine(h.closeness)}
              </span>
            ) : null}
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs">
                <a
                  href={stayMapsHref(h.name, view.city)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[32px] items-center gap-1 font-semibold underline underline-offset-2"
                  data-testid={`stay-pick-map-${h.kind}-${h.id}`}
                >
                  {STAY_MAP_LINK_LABEL} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
                <span className="text-[color:var(--slip-muted,#5B6B7A)]" data-testid={`stay-pick-map-attribution-${h.id}`}>
                  · {GOOGLE_MAPS_ATTRIBUTION}
                </span>
              </span>
              {canChoose ? (
                <button
                  type="button"
                  className="inline-flex min-h-[40px] items-center rounded-[var(--slip-radius-button,10px)] bg-[color:var(--slip-primary,#C8443D)] px-4 text-sm font-semibold text-[color:var(--slip-primary-ink,#fff)] hover:brightness-95 disabled:opacity-60"
                  onClick={() => onStayHere?.(h)}
                  disabled={busy}
                  data-testid={`stay-pick-stay-${h.kind}-${h.id}`}
                >
                  {STAY_HERE_LABEL}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {canChoose && swapControl ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs text-[color:var(--slip-muted,#5B6B7A)]" data-testid="stay-pick-swap">
          <span>{STAY_SWAP_LEAD}</span>
          {swapControl}
        </div>
      ) : null}
    </section>
  );
}

function RankedList({
  view,
  canChoose,
  busy,
  onStayHere,
}: {
  view: WhereToStayView;
  canChoose: boolean;
  busy: boolean;
  onStayHere?: (hotel: StayHotel) => void;
}) {
  return (
        <ol className="space-y-3">
          {view.neighborhoods.map((n, i) => (
            <li key={n.slug} className="space-y-1" data-testid={`where-to-stay-neighborhood-${n.slug}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="text-sm font-semibold text-foreground">{n.name}</span>
                {n.reason ? (
                  <span className="text-xs text-muted-foreground" data-testid={`where-to-stay-reason-${n.slug}`}>
                    {n.reason}
                  </span>
                ) : n.tieBreak ? (
                  <span className="text-xs text-muted-foreground" data-testid={`where-to-stay-tiebreak-${n.slug}`}>
                    {STAY_TIE_BREAK_NOTE}
                  </span>
                ) : null}
              </div>
              {n.oneLiner ? (
                <p className="pl-5 text-xs text-muted-foreground" data-testid={`where-to-stay-oneliner-${n.slug}`} data-source={n.oneLiner.source}>
                  {n.oneLiner.text}
                </p>
              ) : null}
              {n.hotels.length === 0 ? (
                <p className="pl-5 text-xs text-muted-foreground italic" data-testid={`where-to-stay-coming-soon-${n.slug}`}>
                  {HOTELS_COMING_SOON}
                </p>
              ) : (
                <ul className="pl-5 space-y-1">
                  {n.hotels.map((h) => (
                    <li key={`${h.kind}-${h.id}`} className="flex items-center justify-between gap-2 text-sm" data-testid={`where-to-stay-hotel-${h.kind}-${h.id}`}>
                      <span className="flex flex-wrap items-center gap-1 text-foreground">
                        {h.photo ? <PlacePhoto photo={h.photo} size="thumb" testId={`where-to-stay-photo-${h.id}`} /> : <MapPin className="w-3 h-3" />} {h.name}
                        {h.starRating ? <span className="text-xs text-muted-foreground">· {h.starRating}★</span> : null}
                        {h.kind === "platform" ? (
                          <span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground" data-testid={`where-to-stay-platform-badge-${h.id}`}>
                            {PLATFORM_STAY_BADGE}
                          </span>
                        ) : null}
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
  );
}

export function AnchorPanelView(props: AnchorPanelViewProps) {
  const { stage, question, anchorKind, view, canChoose, busy = false } = props;
  const [ownOpen, setOwnOpen] = useState(false);

  if (props.bound) {
    return (
      <div className="rounded-lg border border-border p-4 space-y-2" data-testid="where-to-stay-bound">
        <p className="text-sm text-foreground">
          {props.bound.name} is on your plan. Start each day from there? It's free and moves none of your plan's items.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={props.onReanchor} disabled={busy} data-testid="where-to-stay-reanchor">
            Start my days from here
          </button>
          <button
            type="button"
            className="inline-flex min-h-[40px] items-center px-3 text-sm text-muted-foreground hover:text-foreground"
            onClick={props.onDismissReanchor}
            disabled={busy}
            data-testid="where-to-stay-reanchor-skip"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  const skip = (label = ANCHOR_PANEL_SKIP) =>
    canChoose ? (
      <button type="button" className={quiet} onClick={props.onSkip} disabled={busy} data-testid="where-to-stay-skip">
        {label}
      </button>
    ) : null;

  // ── CHANGE — the tray's "Where to stay" once the plan says where it stays (smoke 9 S9-2) ────────
  // The full chooser, whether or not Skip was ever pressed: change the chosen place (reopen its
  // comparison), keep deciding (the comparison itself), or name your own (through the same set).
  if (stage === "change") {
    const set = props.lodgingSet ?? null;
    return (
      <section className="space-y-3" data-testid="anchor-panel-change" data-anchor-panel="change">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BedDouble className="w-4 h-4" /> {ANCHOR_PANEL_DRAFTED_TITLE}
        </h3>
        {canChoose ? (
          set ? (
            <div className="space-y-2">
              {ownOpen ? <OwnForm neighborhoods={view?.neighborhoods ?? []} busy={busy} onSave={(a) => props.onOwn?.(a)} /> : null}
              <div className="flex flex-wrap items-center gap-3">
                {set.status === "chosen" ? (
                  <button type="button" className={btn} onClick={props.onReopen} disabled={busy} data-testid="where-to-stay-change">
                    {ANCHOR_PANEL_CHANGE}
                  </button>
                ) : null}
                {props.compareHref ? (
                  <a className={link} href={props.compareHref} data-testid="where-to-stay-deciding">
                    {ANCHOR_PANEL_DECIDING}
                  </a>
                ) : null}
                {!ownOpen ? (
                  <button type="button" className={link} onClick={() => setOwnOpen(true)} disabled={busy} data-testid="where-to-stay-own">
                    {ANCHOR_PANEL_SORTED}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">{props.addPlacesControl ?? null}</div>
              <p className="text-xs text-muted-foreground" data-testid="where-to-stay-hand-added">
                {ANCHOR_PANEL_HAND_ADDED}
              </p>
            </div>
          )
        ) : null}
      </section>
    );
  }

  // ── CHOOSER — the tray's "Where to stay" (smoke 8 item 1): the full chooser, always ───────────
  if (stage === "chooser") {
    const ranked = !!view?.eligible && view.neighborhoods.length > 0;
    return (
      <section className="space-y-3" data-testid="anchor-panel-chooser" data-anchor-panel="chooser">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <BedDouble className="w-4 h-4" /> {ANCHOR_PANEL_DRAFTED_TITLE}
          </h3>
          <p className="text-xs text-muted-foreground" data-testid="anchor-panel-optional">
            {ranked ? ANCHOR_PANEL_DRAFTED_SUBTITLE : ANCHOR_PANEL_OPTIONAL}
          </p>
        </div>
        {view?.eligible ? <StayPickCard view={view} canChoose={canChoose} busy={busy} onStayHere={props.onStayHere} /> : null}
        {ranked ? <RankedList view={view!} canChoose={canChoose} busy={busy} onStayHere={props.onStayHere} /> : null}
        {canChoose ? (
          <div className="space-y-2 border-t border-border pt-3">
            {ownOpen ? <OwnForm neighborhoods={view?.neighborhoods ?? []} busy={busy} onSave={(a) => props.onOwn?.(a)} /> : null}
            <div className="flex flex-wrap items-center gap-3">
              {props.addPlacesControl ?? null}
              {!ownOpen ? (
                <button type="button" className={link} onClick={() => setOwnOpen(true)} disabled={busy} data-testid="where-to-stay-own">
                  {ANCHOR_PANEL_SORTED}
                </button>
              ) : null}
              {skip()}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  // ── EMPTY — before the draft: the Empty board's anchor card (slip conformance, ledger
  // `2026-10-08-conformance-slip-phase0`). Same three answers, same testids; the board's dress.
  // "Skip for now" stays as a quiet link under the two answers: the board omits it, and removing
  // it is a behaviour change waiting on a ruling (the golden-path journey presses it).
  if (stage === "empty") {
    const fixed = anchorKind === "fixed_item";
    return (
      <section
        className="space-y-3.5 rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] px-[18px] py-5"
        data-testid="slip-anchor-question"
        data-anchor-kind={anchorKind}
        data-anchor-panel="empty"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-teal-ink)]">
          {fixed ? (
            ANCHOR_PANEL_START_HERE
          ) : (
            <>
              {ANCHOR_PANEL_START_HERE} · <span data-testid="anchor-panel-optional">{ANCHOR_PANEL_OPTIONAL}</span>
            </>
          )}
        </p>
        <h2 className="slip-display text-2xl font-semibold leading-[1.15] text-[color:var(--slip-ink)]">
          {fixed ? FIXED_ITEM_QUESTION : question}
        </h2>
        <p className="text-sm leading-normal text-[color:var(--slip-muted)]" data-testid={fixed ? "anchor-panel-optional" : "anchor-panel-detail"}>
          {fixed ? FIXED_ITEM_DETAIL : ANCHOR_PANEL_EMPTY_DETAIL}
        </p>
        {props.fromFallback ? (
          <p className="text-xs text-[color:var(--slip-muted)]" data-testid="slip-anchor-fallback">
            This occasion doesn't say whether it has a fixed schedule, so the plan starts from where you stay.
          </p>
        ) : null}
        {canChoose ? (
          fixed ? (
            props.addFixedControl ?? null
          ) : (
            <div className="space-y-2.5">
              {props.addPlacesControl ?? null}
              {!ownOpen ? (
                <button
                  type="button"
                  className="flex h-[52px] w-full items-center justify-between rounded-[var(--slip-radius-button)] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-4 text-left text-[15px] font-medium text-[color:var(--slip-ink)] hover:bg-[color:var(--slip-ground)] disabled:opacity-60"
                  onClick={() => setOwnOpen(true)}
                  disabled={busy}
                  data-testid="where-to-stay-own"
                >
                  <span>{ANCHOR_PANEL_SORTED}</span>
                  <ChevronRight className="h-[18px] w-[18px] text-[color:var(--slip-navy)]" aria-hidden="true" />
                </button>
              ) : (
                <OwnForm neighborhoods={[]} busy={busy} onSave={(a) => props.onOwn?.(a)} />
              )}
              <div>{skip()}</div>
            </div>
          )
        ) : null}
      </section>
    );
  }

  if (!view?.eligible) return null;
  const mode = anchorPanelMode(view.neighborhoods);

  // ── DRAFTED, collapsed (R-y) ───────────────────────────────────────────────────────────────
  if (mode === "collapsed") {
    const top = view.neighborhoods[0];
    return (
      <section className="rounded-lg border border-border px-4 py-3" data-testid="anchor-panel-collapsed" data-anchor-panel="collapsed">
        <p className="text-sm text-foreground flex flex-wrap items-center gap-x-2">
          <BedDouble className="w-4 h-4" aria-hidden="true" />
          <span data-testid="anchor-panel-collapsed-line">{collapsedStayLine(top)}</span>
          {skip("Skip") ? <span aria-hidden="true">·</span> : null}
          {skip("Skip")}
        </p>
      </section>
    );
  }

  // ── DRAFTED, options / unranked ──────────────────────────────────────────────────────────────
  return (
    <section className="rounded-lg border border-border p-4 space-y-3" data-testid="where-to-stay-panel" data-anchor-panel={mode}>
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BedDouble className="w-4 h-4" /> {ANCHOR_PANEL_DRAFTED_TITLE}
        </h3>
        <p className="text-xs text-muted-foreground" data-testid="where-to-stay-subtitle">
          {ANCHOR_PANEL_DRAFTED_SUBTITLE}
        </p>
      </div>

      <StayPickCard view={view} canChoose={canChoose} busy={busy} onStayHere={props.onStayHere} swapControl={props.addPlacesControl} />

      {mode === "unranked" ? (
        view.unranked === "no_located_items" ? (
          <p className="text-sm text-muted-foreground" data-testid="where-to-stay-no-located-items">
            {NO_LOCATED_ITEMS}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="where-to-stay-no-neighborhoods">
            {view.city ? `We don't have neighborhoods for ${view.city} yet.` : "We don't have neighborhoods for this city yet."}
          </p>
        )
      ) : (
        <RankedList view={view} canChoose={canChoose} busy={busy} onStayHere={props.onStayHere} />
      )}

      {canChoose ? (
        <div className="space-y-2 border-t border-border pt-3">
          {ownOpen ? <OwnForm neighborhoods={view.neighborhoods} busy={busy} onSave={(a) => props.onOwn?.(a)} /> : null}
          <div className="flex flex-wrap gap-3">
            {!ownOpen ? (
              <button type="button" className={link} onClick={() => setOwnOpen(true)} disabled={busy} data-testid="where-to-stay-own">
                {ANCHOR_PANEL_SORTED}
              </button>
            ) : null}
            {skip()}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** The container: wires the three answers to `POST /api/trips/:tripId/where-to-stay` and the free re-anchor. */
export function AnchorPanel(
  props: Omit<AnchorPanelViewProps, "busy" | "bound" | "onStayHere" | "onOwn" | "onSkip" | "onReanchor" | "onDismissReanchor" | "onReopen" | "compareHref"> & { tripId: string },
) {
  const { tripId } = props;
  const { toast } = useToast();
  const [bound, setBound] = useState<{ name: string; itemId: string } | null>(null);
  const refresh = () => {
    for (const k of ["where-to-stay", "plancard", "option-sets"]) {
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/${k}`] });
    }
  };
  const bind = useMutation({
    mutationFn: async (input: { body: Bind; name: string | null }) => {
      const out = await (await apiRequest("POST", `/api/trips/${tripId}/where-to-stay`, input.body)).json();
      return { ...out, name: input.name } as { setId: string; itemId: string | null; name: string | null };
    },
    onSuccess: (out, input) => {
      if (input.body.kind === "stay_here" && out.itemId && out.name) setBound({ name: out.name, itemId: out.itemId });
      else refresh();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't save where you're staying", description: e?.message }),
  });
  // Smoke 9 S9-2: "Change where I'm staying" reopens the chosen lodging comparison (the existing
  // option-set rail); choosing another place then rewrites the same stay item in place.
  const reopen = useMutation({
    mutationFn: async (setId: string) => (await apiRequest("POST", `/api/trips/${tripId}/option-sets/${setId}/reopen`, {})).json(),
    onSuccess: () => refresh(),
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't reopen where you're staying", description: e?.message }),
  });
  // S1: a re-scored pick is shown once, then the card tells the server it was seen (the ONE read,
  // `POST /api/trips/:tripId/stay-pick/seen`; owner or managing assistant — `canChoose`).
  const seenSent = useRef<string | null>(null);
  const stay = props.view?.stay;
  const changedAt = stay && stay.tier === "routed" && stay.changed && stay.pick ? stay.computedAt ?? "changed" : null;
  useEffect(() => {
    if (!changedAt || !props.canChoose || seenSent.current === changedAt) return;
    seenSent.current = changedAt;
    void apiRequest("POST", `/api/trips/${tripId}/stay-pick/seen`, {}).catch(() => {
      seenSent.current = null;
    });
  }, [changedAt, props.canChoose, tripId]);
  const reanchor = useMutation({
    mutationFn: async (itemId: string) => (await apiRequest("POST", `/api/trips/${tripId}/anchor/promote`, { itemId })).json(),
    onSuccess: () => {
      setBound(null);
      refresh();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't start your days from there", description: e?.message }),
  });
  return (
    <AnchorPanelView
      {...props}
      busy={bind.isPending || reanchor.isPending || reopen.isPending}
      compareHref={props.lodgingSet ? `/plans/${tripId}/compare/${props.lodgingSet.id}` : null}
      onReopen={() => props.lodgingSet && reopen.mutate(props.lodgingSet.id)}
      bound={bound}
      onStayHere={(h) => bind.mutate({ body: { kind: "stay_here", hotel: { kind: h.kind, id: h.id } }, name: h.name })}
      onOwn={(a) => bind.mutate({ body: { kind: "own", ...a }, name: null })}
      onSkip={() => bind.mutate({ body: { kind: "skip" }, name: null })}
      onReanchor={() => bound && reanchor.mutate(bound.itemId)}
      onDismissReanchor={() => {
        setBound(null);
        refresh();
      }}
    />
  );
}
