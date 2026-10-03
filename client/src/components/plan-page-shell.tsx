import { DashboardLayout } from "@/components/dashboard-layout";
import { EALayout } from "@/components/ea-layout";
import { useAuth } from "@/hooks/use-auth";

/**
 * The plan page keeps the viewer's own console. An executive assistant building a client's
 * plan stays in the EA workspace (LD 52). Everyone else keeps the traveler dashboard chrome.
 */
export function PlanPageShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <>{children}</>;
  if (user?.role === "executive_assistant") {
    return <EALayout title="Plan">{children}</EALayout>;
  }
  return <DashboardLayout>{children}</DashboardLayout>;
}
