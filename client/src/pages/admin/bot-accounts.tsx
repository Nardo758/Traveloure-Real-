/**
 * /admin/bot-accounts — BOT-1 Phase 1 (ledger `2026-10-15-bot1-phase1`). Create a bot with the endpoints it may
 * call; its token is shown ONCE here and never again (only its hash is stored). Revoke stops it at once — revoking
 * and turning off BOT_API_ENABLED are the two kill switches.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BOT_SCOPES, type BotScope } from "@shared/bot-proposals";

interface BotRow {
  id: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

export default function AdminBotAccounts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<BotRow[]>({ queryKey: ["/api/admin/bot-accounts"] });
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<BotScope[]>([]);
  const [token, setToken] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/bot-accounts", { name: name.trim(), scopes })).json(),
    onSuccess: (out: { token: string }) => {
      setToken(out.token);
      setName("");
      setScopes([]);
      qc.invalidateQueries({ queryKey: ["/api/admin/bot-accounts"] });
    },
    onError: (e: any) => toast({ title: "Bot not created", description: String(e?.message ?? "Something went wrong."), variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/bot-accounts/${id}/revoke`)).json(),
    onSuccess: () => {
      toast({ title: "Revoked", description: "That token stops working now." });
      qc.invalidateQueries({ queryKey: ["/api/admin/bot-accounts"] });
    },
    onError: (e: any) => toast({ title: "Not revoked", description: String(e?.message ?? "Something went wrong."), variant: "destructive" }),
  });

  return (
    <AdminLayout title="Bot accounts">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>New bot</CardTitle>
            <CardDescription>Bots read aggregates and file proposals. Pick only the endpoints this bot needs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="bot-name">Name</Label>
              <Input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-testid="bot-name" />
            </div>
            <div className="flex flex-wrap gap-4">
              {BOT_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={scopes.includes(s)}
                    onCheckedChange={(on) => setScopes((cur) => (on ? Array.from(new Set([...cur, s])) : cur.filter((x) => x !== s)))}
                    data-testid={`bot-scope-${s}`}
                  />
                  {s}
                </label>
              ))}
            </div>
            <Button onClick={() => create.mutate()} disabled={!name.trim() || !scopes.length || create.isPending} data-testid="bot-create">
              Create bot
            </Button>
            {token ? (
              <div className="rounded border p-3 text-sm" data-testid="bot-token-once">
                <p className="font-medium">Copy this token now. It will not be shown again.</p>
                <p className="mt-1 break-all font-mono">{token}</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setToken(null)}>
                  I have copied it
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {isError ? <p className="text-sm text-destructive">The bots could not be read.</p> : null}
            {data && !data.length ? <p className="text-sm text-muted-foreground">No bots yet.</p> : null}
            {data?.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2" data-testid={`bot-row-${b.id}`}>
                <div>
                  <p className="font-medium">
                    {b.name} {b.revokedAt ? <Badge variant="outline">revoked</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.scopes.join(", ")} · last used {day(b.lastUsedAt)} · created {day(b.createdAt)}
                    {b.expiresAt ? ` · expires ${day(b.expiresAt)}` : ""}
                  </p>
                </div>
                {!b.revokedAt ? (
                  <Button size="sm" variant="outline" onClick={() => revoke.mutate(b.id)} disabled={revoke.isPending} data-testid={`bot-revoke-${b.id}`}>
                    Revoke
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
