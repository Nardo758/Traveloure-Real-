import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ImageIcon, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface BackfillResult {
  message: string;
  processed: number;
  updated: number;
  failed: number;
}

export default function AdminGemPhotoBackfill() {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<BackfillResult | null>(null);

  const backfillMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/gems/backfill-photos"),
    onSuccess: async (res: any) => {
      const result: BackfillResult = await res.json();
      setLastResult(result);
      toast({
        title: "Photo backfill complete",
        description: `${result.updated} gem(s) updated, ${result.failed} failed.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Backfill failed",
        description: err.message ?? "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const handleBackfill = () => {
    setLastResult(null);
    backfillMutation.mutate();
  };

  return (
    <AdminLayout title="Gem Photo Backfill">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Hidden Gem Photo Backfill
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Fetch and assign cover photos for hidden gems that are missing an image URL.
            </p>
          </div>
          <Button
            onClick={handleBackfill}
            disabled={backfillMutation.isPending}
            data-testid="button-backfill-photos"
            className="bg-primary hover:bg-[#e03354] text-white"
          >
            {backfillMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4 mr-2" />
            )}
            {backfillMutation.isPending ? "Backfilling…" : "Backfill missing photos"}
          </Button>
        </div>

        {lastResult && (
          <Card
            className={
              lastResult.failed > 0
                ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10"
                : "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
            }
            data-testid="card-backfill-result"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {lastResult.failed > 0 ? (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                Backfill Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Badge variant="secondary" className="text-sm px-3 py-1" data-testid="badge-processed">
                  {lastResult.processed} processed
                </Badge>
                <Badge
                  className="text-sm px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                  data-testid="badge-updated"
                >
                  {lastResult.updated} updated
                </Badge>
                {lastResult.failed > 0 && (
                  <Badge
                    variant="destructive"
                    className="text-sm px-3 py-1"
                    data-testid="badge-failed"
                  >
                    {lastResult.failed} failed
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{lastResult.message}</p>
            </CardContent>
          </Card>
        )}

        {!lastResult && !backfillMutation.isPending && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <ImageIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No backfill run yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Click "Backfill missing photos" to start.
              </p>
            </CardContent>
          </Card>
        )}

        {backfillMutation.isPending && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
              <p className="text-gray-700 dark:text-gray-300 font-medium">Backfill in progress…</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Fetching photos for gems with no image. This may take a moment.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10">
          <CardContent className="py-4 px-5">
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">How it works</p>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              The backfill queries all hidden gems where <code className="font-mono text-xs">image_url</code> is
              null or empty, then uses the AI discovery service to fetch and assign a relevant photo for each one.
              Gems that already have a photo are skipped automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
