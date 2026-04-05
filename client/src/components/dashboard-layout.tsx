import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { UserMenu } from "@/components/user-menu";

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
      <div className="flex min-h-screen w-full" style={{ background: "#FAFAF8" }}>
        <DashboardSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header
            className="flex items-center justify-between h-[52px] px-5 sticky top-0 z-40 bg-white"
            style={{ borderBottom: "1px solid #E8E8E2" }}
          >
            <SidebarTrigger
              className="h-8 w-8 rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
              style={{ border: "1px solid #E8E8E2" }}
              data-testid="button-dashboard-sidebar-toggle"
            />
            <div className="flex items-center gap-2">
              <Link href="/notifications">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-[34px] w-[34px] rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
                  style={{ border: "1px solid #E8E8E2" }}
                  data-testid="button-notifications"
                >
                  <Bell className="w-4 h-4" />
                  <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] bg-[#E85D55] rounded-full" />
                </Button>
              </Link>
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <div style={{ maxWidth: 1024, margin: "0 auto", padding: "16px 24px" }}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
