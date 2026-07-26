/**
 * HandleClaimCard — claim/change the public storefront handle (backoffice Phase 1a).
 * Embedded in expert + provider Settings. On success shows the live /p/{handle} link
 * with copy — the mockup's "Your unique booking link".
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link2, Copy, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function HandleClaimCard({ currentHandle }: { currentHandle?: string | null }) {
  const { user } = useAuth() as { user?: { handle?: string | null } };
  const existing = currentHandle ?? user?.handle ?? null;
  const [handle, setHandle] = useState(existing ?? "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const claimMutation = useMutation({
    mutationFn: async (next: string) => {
      const res = await fetch("/api/me/handle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ handle: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? `Failed (${res.status})`);
      return body as { handle: string };
    },
    onSuccess: (data) => {
      toast({ title: "Handle saved", description: `Your storefront: /p/${data.handle}` });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (e: Error) => toast({ title: "Could not save handle", description: e.message, variant: "destructive" }),
  });

  const saved = claimMutation.data?.handle ?? existing;
  const url = saved ? `${window.location.origin}/p/${saved}` : null;

  return (
    <Card data-testid="card-handle-claim">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="w-4 h-4 text-primary" />
          Your booking link
        </CardTitle>
        <CardDescription>
          One public link that lists your approved offerings and takes payment. Share it anywhere.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="flex items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
            /p/
          </div>
          <Input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="your-name"
            maxLength={30}
            data-testid="input-handle"
          />
          <Button
            onClick={() => claimMutation.mutate(handle)}
            disabled={claimMutation.isPending || handle.trim().length < 3}
            data-testid="button-save-handle"
          >
            {claimMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers, and hyphens. 3–30 characters. Your page only goes live once
          you have at least one approved offering.
        </p>
        {url && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <code className="flex-1 truncate text-xs" data-testid="text-storefront-url">{url}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  const res = await fetch("/api/short-links", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ targetType: "storefront" }),
                  });
                  if (!res.ok) throw new Error(`Failed (${res.status})`);
                  const data = await res.json() as { url: string };
                  navigator.clipboard.writeText(`${window.location.origin}${data.url}`);
                } catch {
                  // Graceful fallback to the existing /p/ URL on any error.
                  navigator.clipboard.writeText(url);
                }
                toast({ title: "Link copied" });
              }}
              data-testid="button-copy-handle-url"
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <a href={url} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost" data-testid="button-open-storefront">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
