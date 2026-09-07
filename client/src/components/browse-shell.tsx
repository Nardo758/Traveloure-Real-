import { useAuth } from "@/hooks/use-auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Layout } from "@/components/layout";

/**
 * BrowseShell — L1 of the Console & AI Concierge brief (CLAUDE.md Locked
 * Decision 45 (7), ledger `2026-09-07-console-one-grammar`): the browse
 * surfaces (Discover, Experts, checkout) render INSIDE the console shell for
 * a signed-in traveler, so the sidebar no longer vanishes on three of the ten
 * tabs. A guest keeps the public chrome — `/cart` is the ruled guest fallback
 * (LD 45 (4)) and public browse is a public surface.
 *
 * ONE component makes the choice (§18 rule 1): the three routes never decide
 * their own chrome. While the session is resolving, the public chrome renders
 * — a signed-in traveler sees the sidebar appear one paint later, and a guest
 * never sees a console frame flash and vanish.
 */
export function BrowseShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (!isLoading && user) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }
  return <Layout>{children}</Layout>;
}
