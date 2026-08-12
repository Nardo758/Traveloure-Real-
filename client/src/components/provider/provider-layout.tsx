import { ProviderSidebar } from "./provider-sidebar";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BackofficeShell } from "@/components/backoffice/backoffice-shell";

interface ProviderLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function ProviderLayout({ children, title }: ProviderLayoutProps) {
  const { t } = useTranslation("provider");

  // Ruling 60 Phase A: the console page headers translate HERE rather than at each of the ~16
  // call sites. Every page passes its title as an English literal (`<ProviderLayout
  // title="Catalog">`); that literal is looked up under `pageTitle.<English>` with itself as the
  // defaultValue. Two consequences that make this the right seam: no page file changes (so no
  // risk of a half-migrated console), and a title with no entry yet — a new page, or one of the
  // surfaces this phase deliberately defers — renders its English string rather than a raw key.
  const translatedTitle = title ? t(`pageTitle.${title}`, title) : title;

  return (
    <BackofficeShell
      sidebar={<ProviderSidebar />}
      title={translatedTitle}
      sidebarToggleTestId="button-provider-sidebar-toggle"
      notificationsTestId="button-provider-notifications"
      notificationsHref="/provider/inbox"
      statusBadge={
        <div
          className="hidden sm:flex items-center gap-1.5 h-[28px] px-2.5 rounded-full"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
          data-testid="badge-rating"
        >
          <Star className="w-3.5 h-3.5 fill-[#F59E0B]" style={{ color: "#F59E0B" }} />
          <span className="text-[11px] font-medium" style={{ color: "#B45309" }}>
            {t("shell.ratingNew")}
          </span>
        </div>
      }
    >
      {children}
    </BackofficeShell>
  );
}
