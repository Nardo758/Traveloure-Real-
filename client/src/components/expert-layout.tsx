import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ExpertSidebar } from "@/components/expert-sidebar";
import { Bell, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ExpertLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function ExpertLayout({ children, title }: ExpertLayoutProps) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full bg-gray-50">
        <ExpertSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between h-14 px-4 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-expert-sidebar-toggle" />
              {title && (
                <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-200">
                <Bot className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">AI: Active</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                data-testid="button-expert-notifications"
              >
                <Bell className="w-5 h-5 text-gray-600" />
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-[#FF385C]">
                  3
                </Badge>
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
