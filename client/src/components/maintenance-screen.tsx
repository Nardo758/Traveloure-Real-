import { useEffect, useState } from "react";
import { Wrench, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAINTENANCE_EVENT,
  getMaintenanceMessage,
  isMaintenanceActive,
} from "@/lib/maintenance";

/**
 * Full-screen "We'll be right back" view shown when any API call returns
 * 503 { maintenance: true } (the /admin/system maintenance-mode gate).
 * Mounted once at the app root; replaces the router while active.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(isMaintenanceActive());

  useEffect(() => {
    const onMaintenance = () => setActive(true);
    window.addEventListener(MAINTENANCE_EVENT, onMaintenance);
    return () => window.removeEventListener(MAINTENANCE_EVENT, onMaintenance);
  }, []);

  if (!active) return <>{children}</>;

  const message =
    getMaintenanceMessage() ||
    "The platform is temporarily down for maintenance. Please try again shortly.";

  return (
    <div
      className="fixed inset-0 z-[9999] flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center"
      data-testid="maintenance-screen"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Wrench className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
        We'll be right back
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground" data-testid="text-maintenance-message">
        {message}
      </p>
      <Button
        className="mt-8"
        onClick={() => window.location.reload()}
        data-testid="button-maintenance-retry"
      >
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
        Try again
      </Button>
      <p className="mt-10 text-sm font-medium text-muted-foreground/70">Traveloure</p>
    </div>
  );
}
