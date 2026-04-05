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
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full bg-[#F9FAFB] dark:bg-gray-900">
        <DashboardSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[#E5E7EB] bg-white dark:bg-gray-900 sticky top-0 z-40">
            <SidebarTrigger data-testid="button-dashboard-sidebar-toggle" />
            <div className="flex items-center gap-3">
              <Link href="/notifications">
                <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                  <Bell className="w-5 h-5 text-[#6B7280]" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#FF385C] rounded-full"></span>
                </Button>
              </Link>
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
