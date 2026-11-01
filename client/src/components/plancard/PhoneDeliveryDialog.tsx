// §8 phone delivery (ledger `2026-10-17-phone-delivery-calendar`; the bots' review Part C, ratified by Leon Oct 16,
// 2026): "Get your Trip Card on your phone". Shown after Finalize succeeds and from a button in the Trip Card header,
// for the trip's OWNER only (the state read is owner-gated; anyone else gets nothing). Only channels whose admin switch
// is on are drawn, and nothing at all when none is; email and push are never drawn here. Every word of the chooser is
// in shared/phone-delivery.ts. The calendar link is shown once, when it is made — the server keeps only its hash — and
// "Reset link." makes a new one and stops the old one at once.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/queryClient";
import { canPromptInstall, promptInstall, runningFromHomeScreen } from "@/lib/install-prompt";
import {
  PHONE_DELIVERY_ANDROID_STEPS,
  PHONE_DELIVERY_CALENDAR_BODY,
  PHONE_DELIVERY_CALENDAR_HEADING,
  PHONE_DELIVERY_CALENDAR_WARNING,
  PHONE_DELIVERY_HOME_BODY,
  PHONE_DELIVERY_HOME_HEADING,
  PHONE_DELIVERY_IPHONE_STEPS,
  PHONE_DELIVERY_RESET_LINK,
  PHONE_DELIVERY_TITLE,
} from "@shared/phone-delivery";

export interface PhoneDeliveryStateView {
  channels: { calendar: boolean; home_screen: boolean };
  calendar: { active: boolean; since: string | null; expiresAt: string | null; ready: boolean; reason: string | null };
  homeScreen: { optedIn: boolean; at: string | null };
}

export const phoneDeliveryKey = (tripId: string) => [`/api/trips/${tripId}/phone-delivery`];

/** True when the chooser has anything to show: at least one channel is switched on. */
export function phoneDeliveryHasChannels(state: PhoneDeliveryStateView | undefined): boolean {
  return !!state && (state.channels.calendar || state.channels.home_screen);
}

const REASONS: Record<string, string> = {
  not_final: "Finalize your Trip Card first.",
  dates_unconfirmed: "Set your dates first.",
  trip_ended: "This trip has ended.",
};

export function PhoneDeliveryDialog({
  tripId,
  open,
  onOpenChange,
}: {
  tripId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: state, isFetched } = useQuery<PhoneDeliveryStateView>({ queryKey: phoneDeliveryKey(tripId), enabled: open, retry: false });
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Nothing switched on (or not the owner): the chooser closes rather than showing an empty sheet.
  useEffect(() => {
    if (open && isFetched && !phoneDeliveryHasChannels(state)) onOpenChange(false);
  }, [open, isFetched, state, onOpenChange]);

  const mint = useMutation({
    mutationFn: async () => (await (await apiRequest("POST", `/api/trips/${tripId}/phone-delivery/calendar`)).json()) as { path: string },
    onSuccess: (data) => {
      setError(null);
      setCopied(false);
      setLink(data.path);
      qc.invalidateQueries({ queryKey: phoneDeliveryKey(tripId) });
    },
    onError: () => setError("Couldn't make the calendar link. Please try again."),
  });
  const stop = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/trips/${tripId}/phone-delivery/calendar`),
    onSuccess: () => {
      setLink(null);
      qc.invalidateQueries({ queryKey: phoneDeliveryKey(tripId) });
    },
  });
  const home = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/trips/${tripId}/phone-delivery/home-screen`, { optedIn: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: phoneDeliveryKey(tripId) }),
  });

  if (!open || !phoneDeliveryHasChannels(state) || !state) return null;
  const httpsUrl = link ? `${window.location.origin}${link}` : null;
  const webcalUrl = httpsUrl ? httpsUrl.replace(/^https?:/, "webcal:") : null;

  const addToHomeScreen = async () => {
    home.mutate();
    if (canPromptInstall()) await promptInstall();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-phone-delivery">
        <DialogHeader>
          <DialogTitle>{PHONE_DELIVERY_TITLE}</DialogTitle>
        </DialogHeader>

        {state.channels.calendar ? (
          <section className="space-y-2" data-testid="phone-delivery-calendar">
            <button
              type="button"
              className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted disabled:opacity-60"
              onClick={() => mint.mutate()}
              disabled={!state.calendar.ready || mint.isPending}
              data-testid="button-phone-calendar"
            >
              <CalendarPlus className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <span>
                <span className="block font-semibold">{PHONE_DELIVERY_CALENDAR_HEADING}</span>
                <span className="block text-sm text-muted-foreground">{PHONE_DELIVERY_CALENDAR_BODY}</span>
              </span>
            </button>
            {!state.calendar.ready && state.calendar.reason ? (
              <p className="text-sm text-muted-foreground" data-testid="text-phone-calendar-reason">{REASONS[state.calendar.reason] ?? ""}</p>
            ) : null}
            {httpsUrl && webcalUrl ? (
              <div className="space-y-2 rounded-lg bg-muted p-3" data-testid="phone-calendar-link">
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <a href={webcalUrl} data-testid="link-phone-calendar-subscribe">Open in Calendar</a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard?.writeText(httpsUrl).then(() => setCopied(true)).catch(() => undefined);
                    }}
                    data-testid="button-phone-calendar-copy"
                  >
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
              </div>
            ) : null}
            {state.calendar.active || httpsUrl ? (
              <p className="text-sm text-muted-foreground" data-testid="text-phone-calendar-warning">
                {PHONE_DELIVERY_CALENDAR_WARNING}{" "}
                <button type="button" className="underline" onClick={() => mint.mutate()} disabled={!state.calendar.ready || mint.isPending} data-testid="button-phone-calendar-reset">
                  {PHONE_DELIVERY_RESET_LINK}
                </button>{" "}
                <button type="button" className="underline" onClick={() => stop.mutate()} disabled={stop.isPending} data-testid="button-phone-calendar-stop">
                  Stop link.
                </button>
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </section>
        ) : null}

        {state.channels.home_screen && !runningFromHomeScreen() ? (
          <section className="space-y-2" data-testid="phone-delivery-home-screen">
            <button
              type="button"
              className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted"
              onClick={() => void addToHomeScreen()}
              data-testid="button-phone-home-screen"
            >
              <Smartphone className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <span>
                <span className="block font-semibold">{PHONE_DELIVERY_HOME_HEADING}</span>
                <span className="block text-sm text-muted-foreground">{PHONE_DELIVERY_HOME_BODY}</span>
              </span>
            </button>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div data-testid="phone-home-iphone-steps">
                <p className="font-medium">iPhone</p>
                <ol className="list-decimal pl-5 text-muted-foreground">
                  {PHONE_DELIVERY_IPHONE_STEPS.map((s) => <li key={s}>{s}</li>)}
                </ol>
              </div>
              <div data-testid="phone-home-android-steps">
                <p className="font-medium">Android</p>
                <ol className="list-decimal pl-5 text-muted-foreground">
                  {PHONE_DELIVERY_ANDROID_STEPS.map((s) => <li key={s}>{s}</li>)}
                </ol>
              </div>
            </div>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The Trip Card header's button: drawn only for the owner when at least one channel is on. */
export function PhoneDeliveryButton({
  tripId,
  className,
  asMenuItem = false,
  label,
  onOpen,
}: {
  tripId: string;
  className?: string;
  /** Row 194 (R2): drawn as an entry of the Trip Card header's ⋯ menu. */
  asMenuItem?: boolean;
  /** Overrides the visible label (the ⋯ menu's own label). */
  label?: string;
  /**
   * When given, the click calls this and the button renders no dialog of its own: a ⋯ menu entry
   * unmounts with the menu, so the dialog lives with the menu's owner.
   */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: state } = useQuery<PhoneDeliveryStateView>({ queryKey: phoneDeliveryKey(tripId), retry: false });
  if (!phoneDeliveryHasChannels(state)) return null;
  const openIt = () => (onOpen ? onOpen() : setOpen(true));
  if (asMenuItem) {
    return (
      <DropdownMenuItem onSelect={openIt} data-testid={`button-phone-delivery-${tripId}`}>
        <Smartphone className="w-3.5 h-3.5 mr-2" />
        {label ?? "On my phone"}
      </DropdownMenuItem>
    );
  }
  return (
    <>
      <button type="button" onClick={openIt} className={className} data-testid={`button-phone-delivery-${tripId}`}>
        <Smartphone className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{label ?? "On my phone"}</span>
      </button>
      {onOpen ? null : <PhoneDeliveryDialog tripId={tripId} open={open} onOpenChange={setOpen} />}
    </>
  );
}
