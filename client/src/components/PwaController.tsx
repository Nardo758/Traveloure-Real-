/**
 * PwaController — Phase 3 (SMS/PWA delivery lane).
 *
 * Owns the install affordance and the push-permission prompt, both fired at the
 * **plan-ready intent moment** (never on first load). Plan-ready is detected
 * decoupled from PlanCard (a contended file): we watch the React Query cache for
 * a `…/plancard` query that resolves with `lastOptimizedAt` set. No send layer.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import {
  captureInstallPrompt,
  canInstall,
  promptInstall,
  ensurePushSubscription,
} from "@/lib/pwa";

const PUSH_PROMPTED_KEY = "traveloure_pwa_push_prompted_v1";
const INSTALL_DISMISSED_KEY = "traveloure_pwa_install_dismissed_v1";

export function PwaController() {
  const qc = useQueryClient();
  const [installable, setInstallable] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    captureInstallPrompt(() => setInstallable(true));
  }, []);

  useEffect(() => {
    const onPlanReady = () => {
      if (firedRef.current) return;
      firedRef.current = true;

      // Install affordance — only if installable and not previously dismissed.
      try {
        if (canInstall() && localStorage.getItem(INSTALL_DISMISSED_KEY) !== "1") {
          setShowInstall(true);
        }
      } catch {
        if (canInstall()) setShowInstall(true);
      }

      // Push permission — request once per browser, at this intent moment.
      try {
        if (localStorage.getItem(PUSH_PROMPTED_KEY) !== "1") {
          localStorage.setItem(PUSH_PROMPTED_KEY, "1");
          void ensurePushSubscription();
        }
      } catch {
        void ensurePushSubscription();
      }
    };

    const unsub = qc.getQueryCache().subscribe((event: any) => {
      const key = event?.query?.queryKey;
      if (!Array.isArray(key) || typeof key[0] !== "string") return;
      if (!key[0].includes("/plancard")) return;
      const data: any = event?.query?.state?.data;
      if (data && data.lastOptimizedAt) onPlanReady();
    });
    return () => unsub();
  }, [qc]);

  if (!showInstall || !installable) return null;

  return (
    <div
      className="fixed bottom-4 inset-x-4 z-50 mx-auto max-w-md rounded-xl border border-border bg-card shadow-lg p-3 flex items-center gap-3"
      data-testid="pwa-install-prompt"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">Add Traveloure to your home screen</div>
        <div className="text-xs text-muted-foreground">Open your plan in one tap and keep it handy on the trip.</div>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          await promptInstall();
          setShowInstall(false);
        }}
        data-testid="button-pwa-install"
      >
        <Download className="w-4 h-4 mr-1" /> Install
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground flex-shrink-0"
        onClick={() => {
          try { localStorage.setItem(INSTALL_DISMISSED_KEY, "1"); } catch { /* ignore */ }
          setShowInstall(false);
        }}
        data-testid="button-pwa-install-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
