/**
 * Executive-assistant invitations and links, from the invited person's side (board task #502,
 * ledger `2026-09-23-phase1-security`).
 *
 * An EA can no longer attach someone's account just by typing their email: adding a client is an
 * invitation, and this card is where the person accepts or declines it — and later removes an EA
 * they accepted. The server takes the account and its email from the session; this card sends ids
 * only. It renders nothing until the server has answered and there is something to act on.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EaLinkRow {
  id: string;
  createdAt: string | null;
  eaFirstName: string | null;
  eaLastName: string | null;
}

interface EaInvitations {
  pending: EaLinkRow[];
  accepted: EaLinkRow[];
}

const QUERY_KEY = ["/api/me/ea-invitations"];

function eaName(row: EaLinkRow): string {
  const name = [row.eaFirstName, row.eaLastName].filter(Boolean).join(" ").trim();
  return name || "An executive assistant";
}

export function EaInvitationsCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery<EaInvitations>({ queryKey: QUERY_KEY });

  const act = useMutation({
    mutationFn: async ({ method, url }: { method: "POST" | "DELETE"; url: string; done: string }) => {
      const res = await apiRequest(method, url);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: vars.done });
    },
    onError: () => {
      toast({ title: "That didn't work", description: "Please try again.", variant: "destructive" });
    },
  });

  const pending = data?.pending ?? [];
  const accepted = data?.accepted ?? [];
  if (pending.length === 0 && accepted.length === 0) return null;

  return (
    <Card className="border border-border" data-testid="card-ea-invitations">
      <CardHeader>
        <CardTitle className="text-lg text-foreground dark:text-white">Executive assistants</CardTitle>
        <CardDescription>
          An assistant you accept can see your name and profile photo and send you notifications. You
          can remove them at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3" data-testid={`row-ea-invitation-${row.id}`}>
            <span className="text-sm text-foreground">{eaName(row)} invited you to be their client.</span>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                disabled={act.isPending}
                onClick={() => act.mutate({ method: "POST", url: `/api/me/ea-invitations/${row.id}/accept`, done: "Invitation accepted" })}
                data-testid={`button-accept-ea-${row.id}`}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate({ method: "POST", url: `/api/me/ea-invitations/${row.id}/decline`, done: "Invitation declined" })}
                data-testid={`button-decline-ea-${row.id}`}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
        {accepted.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3" data-testid={`row-ea-link-${row.id}`}>
            <span className="text-sm text-foreground">{eaName(row)} is your executive assistant.</span>
            <Button
              size="sm"
              variant="outline"
              disabled={act.isPending}
              onClick={() => act.mutate({ method: "DELETE", url: `/api/me/ea-links/${row.id}`, done: "Assistant removed" })}
              data-testid={`button-remove-ea-${row.id}`}
            >
              Remove
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
