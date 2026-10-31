/**
 * Row 303b: the Discover tile detail panel. A bottom sheet on mobile, a right-side panel on desktop
 * (the same breakpoint the details sheet already uses).
 *
 * Order: credited photos, then What it is, Where, When, Cost, Expert tips, then the tile's own
 * action. Each fact shows its source (linked) and its checked-on date; a section with no sourced
 * fact is not drawn; a photo without a credit is not drawn; a partner item shows no price.
 *
 * Section headings come from the read (row 303a's approved map). The other words are
 * `TILE_DETAIL_COPY`, HELD.
 */
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktopPanel } from "@/components/city-feed-card";
import { TILE_DETAIL_COPY } from "@/lib/tile-detail-copy";
import {
  formatCheckedOn,
  panelPhotosForDisplay,
  panelSectionsForDisplay,
  type TilePanelAction,
} from "@/lib/tile-detail";
import { useTileDetail } from "@/lib/use-tile-detail";
import type { TileDetailPanel as TileDetailPanelData } from "@shared/tile-detail-panel";

const FRAUNCES = "'Fraunces', Georgia, serif";
const EARN_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export type TileDetailStatus = "loading" | "error" | "ready";

/** The panel's content. Rendered alone in tests (no portal). */
export function TileDetailPanelBody({
  tileId,
  panel,
  status,
  actions,
  onAction,
}: {
  tileId: string;
  panel: TileDetailPanelData | null | undefined;
  status: TileDetailStatus;
  actions: TilePanelAction[];
  /** Runs before an action's own handler (the shell closes the panel here). */
  onAction?: () => void;
}) {
  const photos = status === "ready" ? panelPhotosForDisplay(panel) : [];
  const sections = status === "ready" ? panelSectionsForDisplay(panel) : [];
  const nothing = status === "ready" && photos.length === 0 && sections.length === 0;

  return (
    <div className="flex flex-col gap-5" data-testid={`tile-detail-body-${tileId}`}>
      {status === "loading" && (
        <p className="text-sm" style={{ color: "var(--earn-muted)" }} data-testid="tile-detail-loading">
          {TILE_DETAIL_COPY.loading}
        </p>
      )}
      {status === "error" && (
        <p className="text-sm" style={{ color: "var(--earn-muted)" }} data-testid="tile-detail-error">
          {TILE_DETAIL_COPY.readFailed}
        </p>
      )}

      {photos.length > 0 && (
        <div className="flex flex-col gap-3" data-testid="tile-detail-photos">
          {photos.map((photo, i) => (
            <figure key={`${photo.imageUrl}-${i}`} className="m-0" data-testid={`tile-detail-photo-${i}`}>
              <img
                src={photo.imageUrl}
                alt=""
                loading="lazy"
                className="w-full rounded-lg object-cover max-h-64"
              />
              <figcaption className="mt-1 text-[11px]" style={{ color: "var(--earn-muted)" }}>
                <a
                  href={photo.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline"
                  data-testid={`tile-detail-photo-credit-${i}`}
                >
                  {photo.credit}
                </a>
                {photo.licenseUrl && (
                  <>
                    {" · "}
                    <a
                      href={photo.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline"
                      data-testid={`tile-detail-photo-license-${i}`}
                    >
                      {TILE_DETAIL_COPY.photoLicense}
                    </a>
                  </>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {sections.map((s) => (
        <section key={s.section} data-testid={`tile-detail-section-${s.section}`}>
          <h3
            className="text-[15px] font-semibold mb-1.5"
            style={{ color: "var(--earn-navy)", fontFamily: FRAUNCES }}
          >
            {s.heading}
          </h3>
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {s.facts.map((fact, i) => (
              <li key={`${s.section}-${i}`} data-testid={`tile-detail-fact-${s.section}-${i}`}>
                <p className="text-sm m-0">{fact.value}</p>
                <p className="text-[11px] m-0 mt-0.5" style={{ color: "var(--earn-muted)", fontFamily: EARN_MONO }}>
                  <a
                    href={fact.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="underline"
                    data-testid={`tile-detail-fact-source-${s.section}-${i}`}
                  >
                    {fact.source}
                  </a>
                  {" · "}
                  <span data-testid={`tile-detail-fact-checked-${s.section}-${i}`}>
                    {TILE_DETAIL_COPY.checkedOn} {formatCheckedOn(fact.checkedOn)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {nothing && (
        <p className="text-sm" style={{ color: "var(--earn-muted)" }} data-testid="tile-detail-nothing-checked">
          {TILE_DETAIL_COPY.nothingChecked}
        </p>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1" data-testid="tile-detail-actions">
          {actions.map((action, i) => (
            <Button
              key={`${action.label}-${i}`}
              type="button"
              onClick={() => {
                onAction?.();
                action.run();
              }}
              data-testid={`tile-detail-action-${i}`}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The sheet (mobile) / side panel (desktop) around the body. */
export function TileDetailPanel({
  open,
  onOpenChange,
  tileId,
  title,
  actions,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tileId: string | null;
  title: string | null;
  actions: TilePanelAction[];
  /** The element focus returns to on close: the tile, or the control inside it that opened the panel. */
  returnFocusTo: HTMLElement | null;
}) {
  const isDesktopPanel = useIsDesktopPanel();
  const query = useTileDetail(tileId, open);
  const status: TileDetailStatus = query.isError ? "error" : query.data ? "ready" : "loading";
  // An action the panel ran (an add dialog, a navigation) owns focus next; focus returns to the
  // tile only when the panel is simply closed (Esc, the close button, a click outside).
  const actionRan = useRef(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktopPanel ? "right" : "bottom"}
        className={
          isDesktopPanel
            ? "h-full w-full sm:max-w-[480px] overflow-y-auto px-5 pb-8"
            : "h-[85vh] overflow-y-auto rounded-t-2xl px-5 pb-8"
        }
        data-testid="tile-detail-panel"
        onOpenAutoFocus={() => {
          actionRan.current = false;
        }}
        onCloseAutoFocus={(e) => {
          if (actionRan.current) {
            e.preventDefault();
            return;
          }
          if (returnFocusTo && returnFocusTo.isConnected) {
            e.preventDefault();
            returnFocusTo.focus();
          }
        }}
      >
        <SheetHeader className="mb-2">
          <SheetTitle className="text-left text-[17px] leading-snug pr-8" data-testid="tile-detail-title">
            {title ?? TILE_DETAIL_COPY.untitled}
          </SheetTitle>
          <SheetDescription className="sr-only">{TILE_DETAIL_COPY.description}</SheetDescription>
        </SheetHeader>
        {tileId && (
          <TileDetailPanelBody
            tileId={tileId}
            panel={query.data}
            status={status}
            actions={actions}
            onAction={() => {
              actionRan.current = true;
              onOpenChange(false);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
