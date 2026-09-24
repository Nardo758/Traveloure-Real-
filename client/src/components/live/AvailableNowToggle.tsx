/**
 * "Available now" — the earner's own switch in the console header (Locked Decision 54, ledger
 * `2026-09-24-live-chat-qa-sessions`).
 *
 * On = travelers see an "Available now" badge and can find the earner under the /experts
 * "Available now" filter and on the Live Chat tab, until the window the server grants lapses
 * (then it turns itself off). It promises no reply time. Vacation mode wins: the switch is shown
 * off and cannot be turned on while away.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AvailableNow = { availableNow: boolean; until: string | null; onVacation: boolean; windowMinutes: number };

function untilLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function AvailableNowToggle() {
  const { toast } = useToast();
  const { data } = useQuery<AvailableNow>({ queryKey: ["/api/me/available-now"], refetchInterval: 60_000 });
  const set = useMutation({
    mutationFn: async (on: boolean) => (await apiRequest("PUT", "/api/me/available-now", { on })).json() as Promise<AvailableNow>,
    onSuccess: (next) => {
      queryClient.setQueryData(["/api/me/available-now"], next);
      toast({
        title: next.availableNow ? "You're available now" : "You're no longer shown as available",
        description: next.availableNow
          ? `Travelers can see you're around until ${untilLabel(next.until)}. It turns itself off after that.`
          : undefined,
      });
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't change availability",
        description: String(err?.message ?? "").includes("409") ? "Turn off vacation mode first." : "Please try again.",
        variant: "destructive",
      }),
  });

  if (!data) return null;
  const on = data.availableNow;
  return (
    <button
      type="button"
      onClick={() => set.mutate(!on)}
      disabled={set.isPending || (data.onVacation && !on)}
      title={
        data.onVacation
          ? "You're on vacation"
          : on
            ? `Available until ${untilLabel(data.until)} — click to turn off`
            : `Show travelers you're around for the next ${data.windowMinutes} minutes`
      }
      className="flex items-center gap-1.5 h-[28px] px-2.5 rounded-full border text-[11px] font-medium transition-colors disabled:opacity-60"
      style={
        on
          ? { background: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.35)", color: "#15803D" }
          : { background: "#FFFFFF", borderColor: "#E8E8E2", color: "#7A7A72" }
      }
      aria-pressed={on}
      data-testid="toggle-available-now"
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: on ? "#22C55E" : "#AEAEA6" }}
        aria-hidden
      />
      {data.onVacation ? "On vacation" : on ? `Available now · until ${untilLabel(data.until)}` : "Go available"}
    </button>
  );
}
