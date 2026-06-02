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
import { Link } from "wouter";
import { UserMenu } from "@/components/user-menu";

interface ExpertLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function ExpertLayout({ children, title }: ExpertLayoutProps) {
  const style = {
    "--sidebar-width": "220px",
    "--sidebar-width-icon": "56px",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full" style={{ background: "#FAFAF8" }}>
        <ExpertSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header
            className="flex items-center justify-between h-[52px] px-5 sticky top-0 z-40 bg-white"
            style={{ borderBottom: "1px solid #E8E8E2" }}
          >
            <div className="flex items-center gap-3">
              <SidebarTrigger
                className="h-8 w-8 rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
                style={{ border: "1px solid #E8E8E2" }}
                data-testid="button-expert-sidebar-toggle"
              />
              {title && (
                <h1 className="text-[16px] font-semibold" style={{ color: "#1A1A18", letterSpacing: -0.3 }}>
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
                  data-testid="button-expert-notifications"
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
