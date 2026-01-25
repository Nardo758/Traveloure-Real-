import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  Flag,
  Eye,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Receipt,
  History,
  BarChart3,
  Shield,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ContentRegistry {
  id: string;
  trackingNumber: string;
  contentType: string;
  contentId: string;
  ownerId: string | null;
  status: string;
  title: string | null;
  description: string | null;
  viewCount: number;
  engagementScore: number;
  flagReason: string | null;
  flaggedAt: string | null;
  moderatorNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContentSummary {
  totalContent: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  flaggedCount: number;
  recentContent: ContentRegistry[];
}

interface ContentFlag {
  id: string;
  trackingNumber: string;
  reporterId: string | null;
  flagType: string;
  severity: string;
  description: string | null;
  status: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  pending_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  published: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  flagged: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  under_review: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  suspended: "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-200",
  archived: "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200",
  deleted: "bg-gray-300 text-gray-600 dark:bg-gray-500 dark:text-gray-300",
};

const contentTypeLabels: Record<string, string> = {
  trip: "Trip",
  itinerary: "Itinerary",
  service: "Service",
  review: "Review",
  chat_message: "Chat Message",
  expert_profile: "Expert Profile",
  provider_profile: "Provider Profile",
  template: "Template",
  booking: "Booking",
  vendor: "Vendor",
  experience: "Experience",
  custom_venue: "Custom Venue",
  contract: "Contract",
  media: "Media",
  other: "Other",
};

export default function ContentTracking() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedContent, setSelectedContent] = useState<ContentRegistry | null>(null);
  const [moderationDialogOpen, setModerationDialogOpen] = useState(false);
  const [moderationAction, setModerationAction] = useState<"approve" | "suspend" | "delete">("approve");
  const [moderationNotes, setModerationNotes] = useState("");

  const { data: summary, isLoading: summaryLoading } = useQuery<ContentSummary>({
    queryKey: ["/api/admin/content/summary"],
  });

  const { data: content, isLoading: contentLoading } = useQuery<ContentRegistry[]>({
    queryKey: ["/api/admin/content/registry", statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (typeFilter !== "all") params.append("contentType", typeFilter);
      const response = await fetch(`/api/admin/content/registry?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch content");
      return response.json();
    },
  });

  const { data: pendingFlags } = useQuery<ContentFlag[]>({
    queryKey: ["/api/admin/content/flags/pending"],
  });

  const moderateMutation = useMutation({
    mutationFn: async ({ trackingNumber, action, notes }: { trackingNumber: string; action: string; notes: string }) => {
      return apiRequest(`/api/admin/content/${trackingNumber}/moderate`, {
        method: "POST",
        body: JSON.stringify({ action, notes }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({ title: "Content moderated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/content"] });
      setModerationDialogOpen(false);
      setSelectedContent(null);
      setModerationNotes("");
    },
    onError: () => {
      toast({ title: "Failed to moderate content", variant: "destructive" });
    },
  });

  const handleModerate = () => {
    if (!selectedContent) return;
    moderateMutation.mutate({
      trackingNumber: selectedContent.trackingNumber,
      action: moderationAction,
      notes: moderationNotes,
    });
  };

  const filteredContent = content?.filter((c) =>
    searchQuery === "" ||
    c.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (summaryLoading) {
    return (
      <AdminLayout title="Content Tracking">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </AdminLayout>
    );
  }

  const statsData = [
    { label: "Total Content", value: summary?.totalContent || 0, icon: FileText, color: "text-blue-600" },
    { label: "Published", value: summary?.byStatus?.published || 0, icon: CheckCircle, color: "text-green-600" },
    { label: "Flagged", value: summary?.flaggedCount || 0, icon: Flag, color: "text-red-600" },
    { label: "Pending Review", value: summary?.byStatus?.pending_review || 0, icon: Clock, color: "text-amber-600" },
  ];

  return (
    <AdminLayout title="Content Tracking">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsData.map((stat) => (
            <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="registry" className="space-y-4">
          <TabsList>
            <TabsTrigger value="registry" data-testid="tab-registry">
              <FileText className="w-4 h-4 mr-2" />
              Content Registry
            </TabsTrigger>
            <TabsTrigger value="moderation" data-testid="tab-moderation">
              <Shield className="w-4 h-4 mr-2" />
              Moderation Queue
              {(pendingFlags?.length || 0) > 0 && (
                <Badge variant="destructive" className="ml-2">{pendingFlags?.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">
              <Receipt className="w-4 h-4 mr-2" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="registry" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Content Registry
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by tracking number or title..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-testid="input-search-content"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="flagged">Flagged</SelectItem>
                      <SelectItem value="pending_review">Pending Review</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                      <SelectValue placeholder="Content Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {Object.entries(contentTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {contentLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tracking #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Views</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContent?.map((item) => (
                        <TableRow key={item.id} data-testid={`row-content-${item.trackingNumber}`}>
                          <TableCell className="font-mono text-sm">{item.trackingNumber}</TableCell>
                          <TableCell>{contentTypeLabels[item.contentType] || item.contentType}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.title || "-"}</TableCell>
                          <TableCell>
                            <Badge className={statusColors[item.status] || ""}>
                              {item.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>{item.viewCount}</TableCell>
                          <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedContent(item);
                                  setModerationDialogOpen(true);
                                }}
                                data-testid={`button-moderate-${item.trackingNumber}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!filteredContent || filteredContent.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No content found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="moderation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-600" />
                  Moderation Queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingFlags && pendingFlags.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tracking #</TableHead>
                        <TableHead>Flag Type</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Reported</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingFlags.map((flag) => (
                        <TableRow key={flag.id} data-testid={`row-flag-${flag.id}`}>
                          <TableCell className="font-mono text-sm">{flag.trackingNumber}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{flag.flagType}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                flag.severity === "critical" ? "bg-red-600 text-white" :
                                flag.severity === "high" ? "bg-orange-600 text-white" :
                                flag.severity === "medium" ? "bg-yellow-600 text-white" :
                                "bg-gray-600 text-white"
                              }
                            >
                              {flag.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate">{flag.description || "-"}</TableCell>
                          <TableCell>{new Date(flag.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" data-testid={`button-review-flag-${flag.id}`}>
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-600" />
                    <p>No pending flags. All clear!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  Content Invoices
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Invoice management coming soon</p>
                  <p className="text-sm">Link invoices to content tracking numbers</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Content by Type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {summary?.byType && Object.entries(summary.byType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm">{contentTypeLabels[type] || type}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                  {(!summary?.byType || Object.keys(summary.byType).length === 0) && (
                    <p className="text-sm text-muted-foreground">No content data available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Content by Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {summary?.byStatus && Object.entries(summary.byStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <Badge className={statusColors[status] || ""}>{status.replace("_", " ")}</Badge>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                  {(!summary?.byStatus || Object.keys(summary.byStatus).length === 0) && (
                    <p className="text-sm text-muted-foreground">No content data available</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={moderationDialogOpen} onOpenChange={setModerationDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Moderate Content</DialogTitle>
              <DialogDescription>
                Review and take action on content: {selectedContent?.trackingNumber}
              </DialogDescription>
            </DialogHeader>

            {selectedContent && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <p className="font-medium">{contentTypeLabels[selectedContent.contentType]}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <Badge className={statusColors[selectedContent.status]}>{selectedContent.status}</Badge>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Title:</span>
                    <p className="font-medium">{selectedContent.title || "-"}</p>
                  </div>
                  {selectedContent.flagReason && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Flag Reason:</span>
                      <p className="text-red-600">{selectedContent.flagReason}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Action</label>
                  <Select value={moderationAction} onValueChange={(v) => setModerationAction(v as any)}>
                    <SelectTrigger data-testid="select-moderation-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approve">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          Approve
                        </div>
                      </SelectItem>
                      <SelectItem value="suspend">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-orange-600" />
                          Suspend
                        </div>
                      </SelectItem>
                      <SelectItem value="delete">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-600" />
                          Delete
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea
                    placeholder="Add moderation notes..."
                    value={moderationNotes}
                    onChange={(e) => setModerationNotes(e.target.value)}
                    data-testid="textarea-moderation-notes"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setModerationDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleModerate}
                disabled={moderateMutation.isPending}
                data-testid="button-submit-moderation"
              >
                {moderateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
