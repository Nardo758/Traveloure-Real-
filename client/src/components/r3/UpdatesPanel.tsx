/**
 * R3 U6 - the Updates panel (board V24 v4, panel 8). Mounted only while the bell's panel is open, so nothing is fetched
 * before the traveller taps the bell.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BOARD_CELL, BOARD_CTA, BOARD_INK, BOARD_LINE, BOARD_TEXT } from "@/components/r3/tokens";
import { resolveNotificationLink, type ApiNotification } from "@/lib/notification-icons";
import { apiRequest } from "@/lib/queryClient";
import { r3UpdateHref, r3UpdateSubline, type UpdatePlan } from "@/lib/r3-updates";

const PANEL_W = "w-[360px] max-w-full";

export function UpdatesPanel({ plans, onNavigate }: { plans: readonly UpdatePlan[]; onNavigate: () => void }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  // The key is the brief's; refetchOnMount makes the tap always fetch fresh (the console bell may have filled this cache).
  const { data, isLoading, isError } = useQuery<ApiNotification[]>({ queryKey: ["/api/notifications"], refetchOnMount: "always" });
  const rows = data ?? [];
  const unread = rows.filter((r) => !r.isRead).length;
  const state = isLoading ? "loading" : isError ? "error" : rows.length === 0 ? "empty" : "list";

  /** Unread rows are patched without awaiting; the panel's own invalidation runs after it may have unmounted. */
  const markRead = (n: ApiNotification) => {
    if (n.isRead) return;
    void apiRequest("PATCH", `/api/notifications/${n.id}/read`)
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }))
      .catch(() => undefined); // a row patch may stay silent
  };

  /** Addendum 1: resolve, patch, close, navigate - one method, no full page load, no Link. */
  const openRow = (n: ApiNotification, _resolverHref: string | null, href: string | null) => {
    markRead(n);
    if (!href) return; // no link: the row stays, now read
    onNavigate();
    navigate(href);
  };

  const markAll = async () => {
    try {
      await apiRequest("POST", "/api/notifications/mark-all-read");
    } catch {
      return; // failure keeps the unread state; nothing new is shown
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  };

  const now = new Date();

  return (
    <div
      className={`${PANEL_W} rounded-xl border p-3 shadow-xl`}
      style={{ backgroundColor: BOARD_CELL, borderColor: BOARD_LINE }}
      data-testid="r3-updates-panel"
      data-state={state}
      data-unread={unread}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[16px] font-semibold" style={{ color: BOARD_INK }}>
          Updates
        </span>
        {unread > 0 && state === "list" ? (
          <button
            type="button"
            onClick={markAll}
            className="text-[12px] underline underline-offset-2"
            style={{ color: BOARD_TEXT }}
            data-testid="r3-updates-mark-all"
          >
            Mark all as read
          </button>
        ) : null}
      </div>

      <div className="mt-2 border-t" style={{ borderColor: BOARD_LINE }} data-testid="r3-updates-header-rule" />

      <div className="max-h-[70vh] overflow-y-auto">
        {state === "loading" ? (
          <div className="space-y-2 py-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-4 rounded" style={{ backgroundColor: BOARD_LINE }} />
            ))}
          </div>
        ) : null}

        {state === "empty" ? (
          <p className="py-4 text-[13px] text-muted-foreground" data-testid="r3-updates-empty">
            No updates yet.
          </p>
        ) : null}

        {state === "error" ? (
          <p className="py-4 text-[13px] text-muted-foreground" data-testid="r3-updates-error">
            Updates could not load. Try again.
          </p>
        ) : null}

        {state === "list" ? (
          <ul className="divide-y" style={{ borderColor: BOARD_LINE }}>
            {rows.map((n) => {
              const link = resolveNotificationLink(n);
              const href = link ? r3UpdateHref(link.href) : null;
              const planTitle = r3UpdateSubline(n, plans, now);
              const hasPlan = !!n.data?.tripId && plans.some((p) => p.id === n.data?.tripId);
              const body = (
                <span className="flex items-start gap-2 py-2">
                  <span className="mt-1.5 flex h-1.5 w-1.5 shrink-0 items-center justify-center">
                    {!n.isRead ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BOARD_CTA }} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-[13px] ${!n.isRead ? "font-semibold" : "font-normal"}`}
                      style={{ color: BOARD_INK }}
                    >
                      {n.title}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">{planTitle}</span>
                  </span>
                </span>
              );
              return (
                <li
                  key={n.id}
                  data-testid="r3-updates-row"
                  data-unread={!n.isRead}
                  data-plan={hasPlan}
                  data-link={link?.href ?? ""}
                  data-href={href ?? ""}
                >
                  <button type="button" onClick={() => openRow(n, link?.href ?? null, href)} className="block w-full text-left">
                    {body}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
