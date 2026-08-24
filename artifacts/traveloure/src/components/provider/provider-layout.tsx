import { ProviderSidebar } from "./provider-sidebar";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BackofficeShell } from "@/components/backoffice/backoffice-shell";

/**
 * FP-4 (ledger row 89) — the provider console's ONE content-width container.
 *
 * The complaint: on a wide monitor the console content ran the full width of the shell
 * (measured 1700px of content at a 1920 viewport on Catalog / Workstation / Money), so a
 * single-line text input in Settings or the ServiceForm stretched most of the screen.
 * Before this, each page rolled its own wrapper and they disagreed — most had NO cap at
 * all, Calendar capped at `max-w-6xl`, Inbox/Customers/Settings at `max-w-4xl` (Settings'
 * without `mx-auto`, so it hugged the left edge and left a lopsided gutter).
 *
 * The container mounts HERE, once, rather than in ~16 page files, and the pages that
 * carried their own conflicting cap were normalized onto it (no stacked containers).
 *
 * WHY IT CANNOT AFFECT PHONES — by construction, not by testing: the wrapper is
 * `w-full max-w-6xl`, i.e. fluid up to 1152px and capped only past it. The content region
 * is the viewport minus the 220px desktop sidebar (and the whole viewport below the
 * sidebar's 768px mobile breakpoint), so at 390 / 768 / 1280 the region is 390 / 548 /
 * 1060 px — all under the cap, which therefore has no effect at any of them. Horizontal
 * PADDING is deliberately left on the pages (`p-6`) and unchanged, because a responsive
 * `px-4 sm:px-6` here would change phone layout, which this lane must not do.
 *
 * `width="full"` is the deliberate full-bleed opt-out — see its call sites.
 */
const CONTENT_CONTAINER = "w-full max-w-6xl mx-auto";

interface ProviderLayoutProps {
  children: React.ReactNode;
  title?: string;
  /**
   * "contained" (default) centers the page inside CONTENT_CONTAINER. "full" is the
   * full-bleed escape for surfaces that legitimately own the whole shell width — the
   * Catalog MAP view's canvas, and /chat's viewport-anchored two-pane frame.
   */
  width?: "contained" | "full";
}

export function ProviderLayout({ children, title, width = "contained" }: ProviderLayoutProps) {
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
      {width === "full" ? (
        children
      ) : (
        <div className={CONTENT_CONTAINER} data-testid="provider-content-container">
          {children}
        </div>
      )}
    </BackofficeShell>
  );
}
