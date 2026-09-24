/**
 * Earner email notifications — the switches the server actually honours (ledger
 * `2026-09-24-earner-email-notifications`).
 *
 * Every switch here has a live reader (§13: a control comes back with its consumer, never before —
 * the provider settings page removed six inert notification switches for exactly that reason):
 *   - "Email me about new bookings" → `users.email_booking_alerts`, read by every booking-alert send.
 *   - "Messages from travelers" → `newMessage · email`, read by the ONE activity-email sender.
 *   - "Requests, invites, quotes, cancellations and reviews" → `bookingRequest · email`, same sender.
 * Saved through the existing `PATCH /api/me/preferences`, whose locked writer merges these keys and
 * leaves everything else on the account untouched.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { NOTIFICATION_PREFERENCE_DEFAULTS } from "@shared/notification-preferences";

type Saved = {
  notifications?: Record<string, { email?: boolean; push?: boolean }>;
  emailBookingAlerts?: boolean;
};

export function EarnerEmailNotificationsCard() {
  const { toast } = useToast();
  const { data } = useQuery<Saved>({ queryKey: ["/api/me/preferences"] });
  const [bookingAlerts, setBookingAlerts] = useState(true);
  const [messages, setMessages] = useState(NOTIFICATION_PREFERENCE_DEFAULTS.newMessage.email);
  const [activity, setActivity] = useState(NOTIFICATION_PREFERENCE_DEFAULTS.bookingRequest.email);
  const hydrated = useRef(false);
  useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    if (data.emailBookingAlerts !== undefined) setBookingAlerts(data.emailBookingAlerts);
    const m = data.notifications?.newMessage?.email;
    if (m !== undefined) setMessages(m);
    const a = data.notifications?.bookingRequest?.email;
    if (a !== undefined) setActivity(a);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      // Only the email channel is sent; the stored push value for each key is kept by carrying the
      // saved one through unchanged (the writer merges per key).
      const keep = (k: "newMessage" | "bookingRequest") =>
        data?.notifications?.[k]?.push ?? NOTIFICATION_PREFERENCE_DEFAULTS[k].push;
      const res = await apiRequest("PATCH", "/api/me/preferences", {
        emailBookingAlerts: bookingAlerts,
        notifications: {
          newMessage: { email: messages, push: keep("newMessage") },
          bookingRequest: { email: activity, push: keep("bookingRequest") },
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/preferences"] });
      toast({ title: "Saved", description: "Your email notifications are saved." });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const row = (label: string, help: string, checked: boolean, onChange: (v: boolean) => void, testid: string) => (
    <div className="flex items-center justify-between gap-4 pb-4 border-b last:border-0 last:pb-0">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground mt-1">{help}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testid} />
    </div>
  );

  return (
    <Card data-testid="card-earner-email-notifications">
      <CardHeader>
        <CardTitle>Email notifications</CardTitle>
        <CardDescription>Everything still shows in your Inbox; these control what also reaches your email.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {row("New bookings", "An email when a booking arrives.", bookingAlerts, setBookingAlerts, "toggle-earner-email-bookings")}
        {row("Messages from travelers", "At most one email per traveler per hour.", messages, setMessages, "toggle-earner-email-messages")}
        {row(
          "Requests and activity",
          "Trip invitations, quote requests, cancellations and new reviews.",
          activity,
          setActivity,
          "toggle-earner-email-activity",
        )}
        <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-earner-email">
          {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
