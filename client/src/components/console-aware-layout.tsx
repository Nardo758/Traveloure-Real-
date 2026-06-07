import { useAuth } from "@/hooks/use-auth";
import { useActiveConsole } from "@/contexts/ActiveConsoleContext";
import { Layout } from "@/components/layout";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { EALayout } from "@/components/ea-layout";

interface ConsoleAwareLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function ConsoleAwareLayout({ children, title }: ConsoleAwareLayoutProps) {
  const { user } = useAuth();
  const { consoleRole } = useActiveConsole();

  if (!user) {
    return <Layout>{children}</Layout>;
  }

  switch (consoleRole) {
    case "expert":
      return <ExpertLayout title={title}>{children}</ExpertLayout>;
    case "provider":
      return <ProviderLayout title={title}>{children}</ProviderLayout>;
    case "ea":
      return <EALayout title={title}>{children}</EALayout>;
    default:
      return <DashboardLayout>{children}</DashboardLayout>;
  }
}
