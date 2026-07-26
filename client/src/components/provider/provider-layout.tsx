import { ProviderSidebar } from "./provider-sidebar";
import { Star } from "lucide-react";
import { BackofficeShell } from "@/components/backoffice/backoffice-shell";

interface ProviderLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function ProviderLayout({ children, title }: ProviderLayoutProps) {
  return (
    <BackofficeShell
      sidebar={<ProviderSidebar />}
      title={title}
      sidebarToggleTestId="button-provider-sidebar-toggle"
      notificationsTestId="button-provider-notifications"
      statusBadge={
        <div
          className="hidden sm:flex items-center gap-1.5 h-[28px] px-2.5 rounded-full"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
          data-testid="badge-rating"
        >
          <Star className="w-3.5 h-3.5 fill-[#F59E0B]" style={{ color: "#F59E0B" }} />
          <span className="text-[11px] font-medium" style={{ color: "#B45309" }}>
            New
          </span>
        </div>
      }
    >
      {children}
    </BackofficeShell>
  );
}
