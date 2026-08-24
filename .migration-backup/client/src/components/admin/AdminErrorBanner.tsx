import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * L4 fix (docs/audits/ux-walkthrough-5-roles-jul29.md): a failed admin query used to fall
 * through to whatever empty-state copy the page already had ("No payout requests found",
 * "(0)", "All services have neighborhoods assigned") — a broken money/data queue rendered
 * identically to a genuinely empty one. The shared queryFn (client/src/lib/queryClient.ts
 * `getQueryFn`) already throws on a non-ok response, so `useQuery`'s `isError` is reliable;
 * the gap was every page ignoring it. Render this whenever `isError` is true, BEFORE
 * falling back to an empty-state check, so a 500/404 can never be mistaken for "nothing here".
 */
export function AdminErrorBanner({
  label,
  onRetry,
  testId = "banner-admin-query-error",
}: {
  label: string;
  onRetry: () => void;
  testId?: string;
}) {
  return (
    <div
      className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
      data-testid={testId}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{label}</span>
      <Button variant="ghost" size="sm" className="h-auto p-0 text-red-700 underline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
