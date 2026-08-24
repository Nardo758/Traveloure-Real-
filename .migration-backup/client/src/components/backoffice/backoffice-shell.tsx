import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { UserMenu } from "@/components/user-menu";
import { LanguageMenu } from "@/components/language-menu";
import { useAuth } from "@/hooks/use-auth";

/**
 * BackofficeShell — the single console shell shared by the provider and expert
 * consoles (Wave N2, docs/backoffice/EXECUTION_ROADMAP.md). Prior to this both
 * ProviderLayout and ExpertLayout duplicated identical chrome (SidebarProvider
 * sizing, header bar, sidebar-toggle button, notifications button, UserMenu,
 * main scroll container) with only the header's role-specific status badge and
 * a handful of data-testids actually differing. This component is that shared
 * structure; the per-role Layout components now render through it, passing
 * their own sidebar and status badge as slots. No route or page-file changes —
 * both Layout components keep their existing name/props/testids.
 */
interface BackofficeShellProps {
  /** The role-specific sidebar (e.g. <ProviderSidebar /> / <ExpertSidebar />). */
  sidebar: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  /** Role-specific header status pill (e.g. rating badge / AI-active badge). */
  statusBadge?: React.ReactNode;
  sidebarToggleTestId?: string;
  notificationsTestId?: string;
  /**
   * Role-specific target for the header bell. The traveler-shell default
   * ("/notifications" → "/inbox?tab=updates") is a traveler-console page and
   * wrong-sidebars an expert/provider/EA session — each console must pass its
   * own Inbox-module home (e.g. "/expert/inbox", "/provider/inbox").
   */
  notificationsHref: string;
}

/**
 * Ledger 90 (FP-5, N1) — the ONE rule that decides whether the bell shows its dot.
 *
 * Exported (and unit-pinned by client/src/lib/__tests__/backoffice-unread-dot.test.ts) because the
 * defect it replaces was a hardcoded `<span>` with no condition at all: permanently lit for every
 * provider, expert and EA, on every page, including a brand-new account with nothing at all.
 *
 * Both refusals are load-bearing and neither may be relaxed to "truthy":
 *   • `count === 0` ⇒ NO dot — the whole point; an indicator that is always on carries no signal.
 *   • `undefined`   ⇒ NO dot — a query that has not answered (loading, 401, network error) is not
 *                     evidence of an alert. Failing OPEN here would silently restore the defect
 *                     for every logged-out or offline render.
 */
export function shouldShowUnreadDot(unread: { count?: number } | null | undefined): boolean {
  const count = unread?.count;
  return typeof count === "number" && count > 0;
}

export function BackofficeShell({
  sidebar,
  children,
  title,
  statusBadge,
  sidebarToggleTestId = "button-backoffice-sidebar-toggle",
  notificationsTestId = "button-backoffice-notifications",
  notificationsHref,
}: BackofficeShellProps) {
  const style = {
    "--sidebar-width": "220px",
    "--sidebar-width-icon": "56px",
  };

  // Ledger 90 (FP-5, N1). The red dot on this bell was a hardcoded `<span>` with no count, no
  // query and no condition — permanently lit for every provider, expert and EA on every page,
  // including a brand-new account with nothing at all. It therefore carried ZERO information and
  // could never signal a real event (§13: never a fake indicator).
  //
  // A REAL source exists and is already the console's own: `GET /api/notifications/unread-count`
  // — the same endpoint the traveler bell (notification-bell.tsx) and the traveler sidebar badge
  // (dashboard-sidebar.tsx) read, user-scoped server-side. The dot is now that count > 0 and
  // nothing else: zero unread ⇒ NO dot, a failed/unresolved fetch ⇒ NO dot (a request that did
  // not answer is not evidence of an alert). Same 30s cadence as the traveler surfaces so the
  // two bells cannot disagree about the same user.
  const { user } = useAuth();
  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const hasUnread = shouldShowUnreadDot(unread);

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      {/* console-scope: the earner back office runs the warm console palette (see index.css) */}
      <div className="console-scope flex min-h-screen w-full" style={{ background: "#FAFAF8" }}>
        {sidebar}
        <div className="flex flex-col flex-1 min-w-0">
          <header
            className="flex items-center justify-between h-[52px] px-5 sticky top-0 z-40 bg-white"
            style={{ borderBottom: "1px solid #E8E8E2" }}
          >
            <div className="flex items-center gap-3">
              <SidebarTrigger
                className="h-8 w-8 rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
                style={{ border: "1px solid #E8E8E2" }}
                data-testid={sidebarToggleTestId}
              />
              {title && (
                <h1
                  className="text-[16px] font-semibold"
                  style={{ color: "#1A1A18", letterSpacing: -0.3 }}
                  data-testid="text-page-title"
                >
                  {title}
                </h1>
              )}
            </div>
            <div className="flex items-center gap-2">
              {statusBadge}
              {/* Ruling 60 Phase A: the 🌐 quick-switch, mounted on the SHARED console shell so
                  the provider, expert and EA consoles get the one selector rather than three. */}
              <LanguageMenu variant="console" />
              <Link href={notificationsHref}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-[34px] w-[34px] rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
                  style={{ border: "1px solid #E8E8E2" }}
                  data-testid={notificationsTestId}
                >
                  <Bell className="w-4 h-4" />
                  {hasUnread && (
                    <span
                      className="absolute top-1.5 right-1.5 w-[7px] h-[7px] bg-[#E85D55] rounded-full"
                      data-testid="indicator-backoffice-unread"
                    />
                  )}
                </Button>
              </Link>
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
