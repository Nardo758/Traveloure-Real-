import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { UserMenu } from "@/components/user-menu";

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
}

export function BackofficeShell({
  sidebar,
  children,
  title,
  statusBadge,
  sidebarToggleTestId = "button-backoffice-sidebar-toggle",
  notificationsTestId = "button-backoffice-notifications",
}: BackofficeShellProps) {
  const style = {
    "--sidebar-width": "220px",
    "--sidebar-width-icon": "56px",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full" style={{ background: "#FAFAF8" }}>
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
              <Link href="/notifications">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-[34px] w-[34px] rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
                  style={{ border: "1px solid #E8E8E2" }}
                  data-testid={notificationsTestId}
                >
                  <Bell className="w-4 h-4" />
                  <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] bg-[#E85D55] rounded-full" />
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
