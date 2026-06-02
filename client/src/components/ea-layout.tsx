import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { EASidebar } from "./ea-sidebar";
import { Bell, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { UserMenu } from "@/components/user-menu";

interface EALayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function EALayout({ children, title }: EALayoutProps) {
  const style = {
    "--sidebar-width": "220px",
    "--sidebar-width-icon": "56px",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full" style={{ background: "#FAFAF8" }}>
        <EASidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header
            className="flex items-center justify-between h-[52px] px-5 sticky top-0 z-40 bg-white"
            style={{ borderBottom: "1px solid #E8E8E2" }}
          >
            <div className="flex items-center gap-3">
              <SidebarTrigger
                className="h-8 w-8 rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
                style={{ border: "1px solid #E8E8E2" }}
                data-testid="button-ea-sidebar-toggle"
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
              <div
                className="hidden sm:flex items-center gap-1.5 h-[28px] px-2.5 rounded-full"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
                data-testid="badge-ai-status"
              >
                <Bot className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />
                <span className="text-[11px] font-medium" style={{ color: "#15803D" }}>
                  AI: Active
                </span>
              </div>
              <Link href="/notifications">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-[34px] w-[34px] rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
                  style={{ border: "1px solid #E8E8E2" }}
                  data-testid="button-ea-notifications"
                >
                  <Bell className="w-4 h-4" />
                  <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] bg-[#E85D55] rounded-full" />
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
