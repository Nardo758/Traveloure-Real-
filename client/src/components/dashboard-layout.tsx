import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { Link } from "wouter";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { TraveloureLogo } from "@/components/ui/traveloure-logo";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const style = {
    "--sidebar-width": "220px",
    "--sidebar-width-icon": "56px",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      {/* console-scope (LD 45 ruling 7): the traveler console reads the ONE site grammar —
          shadcn primary resolves to coral #E85D55, not the traveler pink of the public
          surfaces. The scope class carries the tokens; the raw console hex literals that
          used to live here are gone (sidebar reads tokens). */}
      <div className="console-scope flex min-h-screen w-full" style={{ background: "var(--console-ground)" }}>
        <DashboardSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header
            className="flex items-center justify-between h-[52px] px-5 sticky top-0 z-40"
            style={{ background: "var(--console-card)", borderBottom: "1px solid var(--console-line)" }}
          >
            <div className="flex items-center gap-2">
              <SidebarTrigger
                className="h-8 w-8 rounded-lg text-[var(--console-mid)] hover:bg-[hsl(var(--muted))]"
                style={{ border: "1px solid var(--console-line)" }}
                data-testid="button-dashboard-sidebar-toggle"
              />
              <Link href="/" data-testid="link-logo" className="flex items-center hover:opacity-80 transition-opacity">
                <TraveloureLogo className="h-6" />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
