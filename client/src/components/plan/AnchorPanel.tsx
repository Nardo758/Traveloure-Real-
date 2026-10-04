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
import { HAND_ADDED_STAY_LINE } from "@shared/where-to-stay";
import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { BedDouble, MapPin } from "lucide-react";
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
export const ANCHOR_PANEL_DRAFTED_TITLE = "Where to stay";
export const ANCHOR_PANEL_DRAFTED_SUBTITLE = "Optional — ranked by where your days are.";
export const ANCHOR_PANEL_ADD_PLACES = "Add places I'm considering";
export const ANCHOR_PANEL_SORTED = "I've got lodging sorted";
export const ANCHOR_PANEL_SKIP = "Skip for now";
export const ANCHOR_PANEL_CHANGE = "Change where I'm staying";
export const ANCHOR_PANEL_DECIDING = "I'm deciding — compare places";
export const ANCHOR_PANEL_HAND_ADDED = HAND_ADDED_STAY_LINE;
export const HOTELS_COMING_SOON = "Hotels coming soon";
export const NO_LOCATED_ITEMS = "Once some of your stops are on the map, we'll rank neighbourhoods by them.";
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
          <option value="">…or just the neighbourhood</option>
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
                        <MapPin className="w-3 h-3" /> {h.name}
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

  // ── EMPTY — before the draft ────────────────────────────────────────────────────────────────
  if (stage === "empty") {
    const fixed = anchorKind === "fixed_item";
    return (
      <section
        className="rounded-lg border border-border p-4 space-y-3"
        data-testid="slip-anchor-question"
        data-anchor-kind={anchorKind}
        data-anchor-panel="empty"
      >
        <div>
          <h2 className="text-xl font-semibold text-foreground">{fixed ? FIXED_ITEM_QUESTION : question}</h2>
          <p className="text-xs text-muted-foreground" data-testid="anchor-panel-optional">
            {fixed ? FIXED_ITEM_DETAIL : ANCHOR_PANEL_OPTIONAL}
          </p>
        </div>
        {props.fromFallback ? (
          <p className="text-xs text-muted-foreground" data-testid="slip-anchor-fallback">
            This occasion doesn't say whether it has a fixed schedule, so the plan starts from where you stay.
          </p>
        ) : null}
        {canChoose ? (
          fixed ? (
            props.addFixedControl ?? null
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                {props.addPlacesControl ?? null}
                {!ownOpen ? (
                  <button type="button" className={link} onClick={() => setOwnOpen(true)} disabled={busy} data-testid="where-to-stay-own">
                    {ANCHOR_PANEL_SORTED}
                  </button>
                ) : null}
                {skip()}
              </div>
              {ownOpen ? <OwnForm neighborhoods={[]} busy={busy} onSave={(a) => props.onOwn?.(a)} /> : null}
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

      {mode === "unranked" ? (
        view.unranked === "no_located_items" ? (
          <p className="text-sm text-muted-foreground" data-testid="where-to-stay-no-located-items">
            {NO_LOCATED_ITEMS}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="where-to-stay-no-neighborhoods">
            {view.city ? `We don't have neighbourhoods for ${view.city} yet.` : "We don't have neighbourhoods for this city yet."}
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
