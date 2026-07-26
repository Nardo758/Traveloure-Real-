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
 * /expert/service-listings       Provider service-listing management
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
import { ExpertSidebar } from "@/components/expert/expert-sidebar";
import { Bot } from "lucide-react";
import { BackofficeShell } from "@/components/backoffice/backoffice-shell";

interface ExpertLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function ExpertLayout({ children, title }: ExpertLayoutProps) {
  return (
    <BackofficeShell
      sidebar={<ExpertSidebar />}
      title={title}
      sidebarToggleTestId="button-expert-sidebar-toggle"
      notificationsTestId="button-expert-notifications"
      statusBadge={
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
      }
    >
      {children}
    </BackofficeShell>
  );
}
