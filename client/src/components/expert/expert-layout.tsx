/*
 * Expert Workspace — Route Map
 * ─────────────────────────────────────────────────────────────────
 * /expert/dashboard              Main expert landing page
 * /expert/clients                Grouped client list (from assigned trips)
 * /expert/clients/:id            Individual client detail view
 * /expert/assigned-trips         Full list of all assigned trips
 * /expert/workspace/:tripId      Per-trip workspace: suggestions, AI, chat links
 * /expert/messages               → redirects to /chat (consolidated messaging)
 * /expert/messages/:clientId     Workspace entry from a client message thread
 * /expert/bookings               Booking management
 * /expert/services               Expert service listings
 * /expert/services/new           Create service (form)
 * /expert/services/:id/edit      Edit service (form)
 * /expert/services/templates     Service template library
 * /expert/service-wizard         Guided service creation wizard
 * /expert/custom-services        Custom service management
 * /expert/earnings               Earnings + Stripe Connect payout
 * /expert/performance            Performance metrics
 * /expert/revenue-optimization   Revenue optimization dashboard
 * /expert/leaderboard            Expert leaderboard
 * /expert/analytics              Business analytics
 * /expert/templates              Message/response templates
 * /expert/content-studio         Content creation studio
 * /expert/content-studio/:type   Specific content type creator
 * /expert/ai-assistant           Expert AI assistant
 * /expert/profile                Expert profile settings
 * /expert/settings               Account settings
 * /expert/contract-categories    Contract category management
 * /expert/booking-partners       Booking partner integrations
 * ─────────────────────────────────────────────────────────────────
 * All /expert/* routes require ProtectedRoute requiredRole="expert"
 */
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ExpertSidebar } from "@/components/expert/expert-sidebar";
import { Bell, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/user-menu";

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
      <div className="flex h-screen w-full bg-[#FAFAF8]">
        <ExpertSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between h-14 px-4 border-b border-[#E8E8E2] bg-white">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-expert-sidebar-toggle" />
              {title && (
                <h1 className="text-lg font-semibold text-[#1A1A18]">{title}</h1>
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
              <UserMenu />
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
