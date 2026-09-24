/**
 * Phone notifications — turn push on for THIS device (Locked Decision 53, ledger `2026-09-24-web-push`).
 *
 * Every sentence is one state from `derivePhonePushState` (§18 rule 1). Which notices reach the
 * phone follows the account's existing Push switches (`NOTIFICATION_PREFERENCE_DEFAULTS` where never
 * saved); this card only decides whether this device is one of the places they go.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Loader2, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  currentPermission,
  derivePhonePushState,
  disablePhonePush,
  enablePhonePush,
  isIosDevice,
  isStandalone,
  isSubscribedHere,
  pushSupported,
} from "@/lib/web-push";

type PushConfig = { available: boolean; publicKey: string | null };

export function PhoneNotificationsCard() {
  const { toast } = useToast();
  const { data: config } = useQuery<PushConfig>({ queryKey: ["/api/push/config"] });
  const [permission, setPermission] = useState(currentPermission());
  const [subscribedHere, setSubscribedHere] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setPermission(currentPermission());
    if (!pushSupported()) {
      setSubscribedHere(false);
      return;
    }
    try {
      setSubscribedHere(await isSubscribedHere());
    } catch {
      setSubscribedHere(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state = derivePhonePushState({
    serverAvailable: config?.available,
    supported: pushSupported(),
    isIos: isIosDevice(),
    standalone: isStandalone(),
    permission,
    subscribedHere,
  });

  const turnOn = async () => {
    if (!config?.publicKey) return;
    setBusy(true);
    try {
      const result = await enablePhonePush(config.publicKey);
      if (result === "denied") toast({ title: "Notifications are blocked", description: "Allow them for this site in your browser settings." });
      else toast({ title: "Phone notifications are on" });
    } catch {
      toast({ title: "Couldn't turn on phone notifications", variant: "destructive" });
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePhonePush();
      toast({ title: "Phone notifications are off on this device" });
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      toast({
        title: body?.delivered > 0 ? "Test sent" : "Nothing was delivered",
        description: body?.delivered > 0 ? "It should arrive in a few seconds." : "Try turning notifications off and on again on this device.",
      });
    } finally {
      setBusy(false);
    }
  };

  const message: Record<typeof state, string> = {
    loading: "Checking this device…",
    unavailable: "Phone notifications aren't available yet.",
    ios_needs_install:
      "On iPhone and iPad, open Traveloure in Safari, tap Share, then Add to Home Screen. Open it from your Home Screen and turn notifications on here.",
    unsupported: "This browser can't receive notifications. Try Chrome, Edge, Firefox or Safari.",
    denied: "Notifications are blocked for this site. Allow them in your browser or phone settings, then come back.",
    off: "Get new messages, requests and bookings on this device, even when Traveloure isn't open.",
    on: "This device gets your notifications. Which ones follows your Push settings.",
  };

  return (
    <Card data-testid="card-phone-notifications">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" /> Phone notifications
        </CardTitle>
        <CardDescription>Turn this on separately on each phone or computer you use.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm" data-testid={`text-phone-push-${state}`}>
          {message[state]}
        </p>
        {state === "off" && (
          <Button onClick={turnOn} disabled={busy || !config?.publicKey} data-testid="button-enable-phone-push">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BellRing className="w-4 h-4 mr-2" />}
            Turn on for this device
          </Button>
        )}
        {state === "on" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={sendTest} disabled={busy} data-testid="button-test-phone-push">
              Send a test
            </Button>
            <Button variant="ghost" onClick={turnOff} disabled={busy} data-testid="button-disable-phone-push">
              Turn off for this device
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
