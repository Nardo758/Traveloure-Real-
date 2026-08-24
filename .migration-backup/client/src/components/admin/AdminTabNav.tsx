import { Link, useLocation } from "wouter";

/**
 * Route-linked tab bar for grouping sibling admin pages under one sidebar entry.
 * Each tab is a real route (wouter Link) — the pages stay independent, but the
 * user gets a tabbed feel and the sidebar collapses to a single entry per group.
 */
export function AdminTabNav({ tabs }: { tabs: { label: string; href: string }[] }) {
  const [location] = useLocation();
  return (
    <div className="flex items-center gap-1 border-b border-gray-200 mb-2" data-testid="admin-tab-nav">
      {tabs.map((t) => {
        const active = location === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors " +
              (active
                ? "border-[#E85D55] text-[#1A1A18]"
                : "border-transparent text-[#7A7A72] hover:text-[#1A1A18]")
            }
            data-testid={`admin-tab-${t.href.split("/").pop()}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
