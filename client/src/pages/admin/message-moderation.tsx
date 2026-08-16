/**
 * Admin message moderation queue — lists pending/reviewed abuse reports from
 * message_reports, lets admins mark them reviewed/actioned/dismissed, and view
 * the reported message text inline.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ShieldAlert, CheckCircle, XCircle, Eye, User } from "lucide-react";

interface ModerationReport {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  messageId: string | null;
  messageText: string | null;
  reportType: string;
  reason: string;
  details: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  reviewed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  actioned: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  dismissed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  inappropriate: "Inappropriate content",
  other: "Other",
};

export default function AdminMessageModeration() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const { data: reports = [], isLoading } = useQuery<ModerationReport[]>({
    queryKey: ["/api/admin/message-reports", statusFilter],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/message-reports?status=${statusFilter}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load reports");
      return res.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: string; status: string; adminNote?: string }) =>
      apiRequest("PATCH", `/api/admin/message-reports/${id}`, { status, adminNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-reports"] });
    },
  });

  const handleAction = (id: string, status: string) => {
    updateStatusMutation.mutate({ id, status, adminNote: adminNotes[id] });
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
              Message Moderation
            </h1>
            <p className="text-sm text-muted-foreground">
              Review abuse reports filed by users against messages and senders.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="actioned">Actioned</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {reports.length} report{reports.length !== 1 ? "s" : ""}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <Card className="border-2 border-dashed border-border">
            <CardContent className="p-10 text-center" data-testid="empty-moderation-queue">
              <CheckCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-1">No {statusFilter} reports</h3>
              <p className="text-sm text-muted-foreground">
                Nothing to action here. Try a different status filter.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <Card key={report.id} data-testid={`report-card-${report.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={`text-xs font-medium ${STATUS_COLORS[report.status] ?? ""}`}
                          data-testid={`badge-status-${report.id}`}
                        >
                          {report.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {report.reportType === "message" ? "Message report" : "User report"}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {REASON_LABELS[report.reason] ?? report.reason}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Reported{" "}
                        {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <CardTitle className="text-base">Report #{report.id.slice(-8)}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Parties */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">Reporter:</span>
                      <span className="font-medium truncate">{report.reporterName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-destructive flex-shrink-0" />
                      <span className="text-muted-foreground">Reported user:</span>
                      <span className="font-medium truncate">{report.reportedUserName}</span>
                    </div>
                  </div>

                  {/* Reported message text */}
                  {report.messageText && (
                    <div className="rounded-md bg-muted/50 border border-border p-3">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Reported message
                      </p>
                      <p className="text-sm text-foreground break-words">{report.messageText}</p>
                    </div>
                  )}

                  {/* Reporter's additional details */}
                  {report.details && (
                    <div className="text-sm">
                      <span className="text-muted-foreground font-medium">Details: </span>
                      <span>{report.details}</span>
                    </div>
                  )}

                  {/* Admin note + action buttons */}
                  {report.status === "pending" && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <Textarea
                        placeholder="Optional admin note (saved with the action)…"
                        value={adminNotes[report.id] ?? ""}
                        onChange={(e) =>
                          setAdminNotes((prev) => ({ ...prev, [report.id]: e.target.value }))
                        }
                        className="text-sm min-h-[60px]"
                        data-testid={`textarea-admin-note-${report.id}`}
                      />
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleAction(report.id, "reviewed")}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-reviewed-${report.id}`}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1.5" /> Mark reviewed
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAction(report.id, "actioned")}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-actioned-${report.id}`}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1.5" /> Action taken
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(report.id, "dismissed")}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-dismissed-${report.id}`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Dismiss
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Show saved admin note for already-processed reports */}
                  {report.adminNote && report.status !== "pending" && (
                    <div className="text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground font-medium">Admin note: </span>
                      <span>{report.adminNote}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
