// Provenance spine Move 3 (ledger 2026-08-23-provenance-move3): the admin content-history view.
//
// The version history for a TRV-tracked content row has been written on every create/update since
// registerContent shipped (content_versions), but nothing ever READ it — GET
// /api/admin/content/:trackingNumber returns a `versions` array that no client consumed. This dialog
// is that reader: it surfaces the append-only change timeline for one content row. Purely additive —
// no schema or write-path change; the data was already accumulating.
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

interface ContentVersionRow {
  id: string;
  version: number;
  changeType: string; // created | updated | status_change | moderation
  changedBy: string | null;
  changeReason: string | null;
  previousData: unknown;
  newData: unknown;
  createdAt: string;
}

interface ContentDetailResponse {
  content: { trackingNumber: string; title?: string | null };
  versions: ContentVersionRow[];
}

const CHANGE_TYPE_STYLE: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  status_change: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  moderation: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

/** The fields that actually changed between two version snapshots — a compact, honest diff so the
 *  admin sees WHAT moved without a raw jsonb dump. Empty ⇒ we render nothing (never a fake "no
 *  changes" claim on a v1 create, which legitimately has no previous). */
function changedKeys(prev: unknown, next: unknown): string[] {
  if (!next || typeof next !== "object") return [];
  const p = (prev && typeof prev === "object" ? prev : {}) as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  const keys: string[] = [];
  for (const k of Object.keys(n)) {
    if (JSON.stringify(p[k]) !== JSON.stringify(n[k])) keys.push(k);
  }
  return keys;
}

export function ContentHistoryDialog({
  trackingNumber,
  open,
  onOpenChange,
}: {
  trackingNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError } = useQuery<ContentDetailResponse>({
    queryKey: [`/api/admin/content/${trackingNumber}`],
    // Only fetch once the dialog is open for a real tracking number.
    enabled: open && !!trackingNumber,
  });

  const versions = data?.versions ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="dialog-content-history">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" /> Change history
          </DialogTitle>
          <DialogDescription>
            {trackingNumber ? (
              <span className="font-mono text-xs">{trackingNumber}</span>
            ) : null}
            {data?.content?.title ? <span className="ml-2">· {data.content.title}</span> : null}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Loading history…</p>}
        {isError && (
          <p className="text-sm text-destructive py-6 text-center">Couldn't load history. Please try again.</p>
        )}
        {!isLoading && !isError && versions.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-history">
            No recorded changes yet.
          </p>
        )}

        {!isLoading && versions.length > 0 && (
          <ol className="relative border-l border-border pl-4 space-y-4 py-2" data-testid="list-content-versions">
            {versions.map((v) => {
              const keys = v.changeType === "created" ? [] : changedKeys(v.previousData, v.newData);
              return (
                <li key={v.id} className="relative" data-testid={`content-version-${v.version}`}>
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold">v{v.version}</span>
                    <Badge variant="outline" className={`text-[10px] ${CHANGE_TYPE_STYLE[v.changeType] || ""}`}>
                      {v.changeType.replace("_", " ")}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {/* Actor: real id only, never a placeholder (§13). */}
                  {v.changedBy && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">by <span className="font-mono">{v.changedBy}</span></p>
                  )}
                  {v.changeReason && <p className="text-xs mt-1">{v.changeReason}</p>}
                  {keys.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Changed: <span className="font-mono">{keys.join(", ")}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
