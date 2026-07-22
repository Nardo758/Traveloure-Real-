import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  UserCheck,
  Star,
  MapPin,
  Calendar,
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  Loader2,
  Brain,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ExpertApplication {
  id: string;
  userId: string;
  expertType?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  city?: string;
  country?: string;
  yearsInCity?: string;
  specialties?: string[];
  destinations?: string[];
  languages?: string[];
  bio?: string;
  status: string;
  rejectionMessage?: string | null;
  // EXP-OVR.P3: admin-editable per-expert commission override (expert-share %).
  // null = use category default. Honors §6.9 beta-recruitment terms.
  commissionOverrideExpertSharePercent?: string | null;
  createdAt: string;
  // Local Expert fields
  neighborhoods?: string[];
  localityProof?: string;
  knowledgeProofAnswers?: Array<{ question: string; answer: string }>;
  knowledgeScore?: {
    overall: number | null;
    verdict: "strong" | "adequate" | "weak" | "unscored";
    perAnswer?: Array<{ dimensions: Record<string, number>; score: number; feedback: string }>;
    note?: string;
  } | null;
  localSpecialties?: string[];
}

function RejectionReasonEditor({
  appId,
  currentMessage,
  onSaved,
  isSaving,
}: {
  appId: string;
  currentMessage?: string | null;
  onSaved: (id: string, message: string) => void;
  isSaving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentMessage ?? "");

  if (!editing) {
    return (
      <div className="flex items-start gap-2" data-testid={`rejection-reason-display-${appId}`}>
        <p className="text-sm text-gray-700 flex-1 italic">
          {currentMessage || <span className="text-gray-400">No reason recorded</span>}
        </p>
        <button
          type="button"
          onClick={() => { setDraft(currentMessage ?? ""); setEditing(true); }}
          className="shrink-0 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
          title="Edit rejection reason"
          data-testid={`button-edit-rejection-${appId}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid={`rejection-reason-editor-${appId}`}>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        className="text-sm resize-none"
        placeholder="Enter rejection reason…"
        data-testid={`textarea-rejection-${appId}`}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { onSaved(appId, draft); setEditing(false); }}
          disabled={isSaving || !draft.trim()}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-red-600 text-white disabled:bg-gray-300 disabled:text-gray-400"
          data-testid={`button-save-rejection-${appId}`}
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          data-testid={`button-cancel-rejection-${appId}`}
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

// EXP-OVR.P3: inline editor for the per-expert commission override.
// Empty input = clear override (uses category default). Value is the expert's
// share % (e.g. 80 = expert keeps 80%, platform takes 20%).
function CommissionOverrideEditor({
  userId,
  currentValue,
  onSave,
  isSaving,
}: {
  userId: string;
  currentValue: string | null;
  onSave: (value: number | null) => void;
  isSaving: boolean;
}) {
  const initial = currentValue === null || currentValue === undefined ? "" : String(parseFloat(currentValue));
  const [draft, setDraft] = useState(initial);
  const trimmed = draft.trim();
  const parsed = trimmed === "" ? null : Number(trimmed);
  const valid = trimmed === "" || (Number.isFinite(parsed!) && parsed! >= 0 && parsed! <= 100);
  const dirty = trimmed !== initial;
  const handleSave = () => {
    if (!valid) return;
    onSave(parsed);
  };
  const handleClear = () => {
    setDraft("");
    onSave(null);
  };
  return (
    <div className="flex items-center gap-1.5" data-testid={`override-editor-${userId}`}>
      <input
        type="number"
        min={0}
        max={100}
        step={0.01}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="—"
        className={`w-16 h-7 px-2 text-xs border rounded ${valid ? "border-gray-300" : "border-red-500"}`}
        data-testid={`input-override-${userId}`}
      />
      <span className="text-xs text-gray-400">% expert</span>
      <button
        type="button"
        onClick={handleSave}
        disabled={!valid || !dirty || isSaving}
        className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-400"
        data-testid={`button-save-override-${userId}`}
      >
        Save
      </button>
      {currentValue !== null && currentValue !== undefined && (
        <button
          type="button"
          onClick={handleClear}
          disabled={isSaving}
          className="text-xs px-1.5 py-1 rounded text-gray-500 hover:text-red-600"
          data-testid={`button-clear-override-${userId}`}
          title="Clear override (use category default)"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function AdminExperts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"applications" | "active" | "rejected">("applications");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: applications = [], isLoading } = useQuery<ExpertApplication[]>({
    queryKey: ["/api/admin/expert-applications"],
  });

  const { data: nuggetCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/admin/local-experts/nugget-counts"],
  });

  const pendingApps = applications.filter(a => a.status === "pending");
  const approvedApps = applications.filter(a => a.status === "approved");
  const rejectedApps = applications.filter(a => a.status === "rejected");

  // EXP-OVR.P3: per-expert commission override mutation. Honors §6.9
  // beta-recruitment terms ("reduced commissions (20% vs 25%)").
  const overrideMutation = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: number | null }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/commission-override`, {
        commissionOverrideExpertSharePercent: value,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expert-applications"] });
      toast({ title: "Commission override saved" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Save failed", description: error?.message ?? "Try again." });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, rejectionMessage }: { id: string; status: string; rejectionMessage?: string }) => {
      return apiRequest("PATCH", `/api/admin/expert-applications/${id}/status`, { status, rejectionMessage });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expert-applications"] });
      toast({
        title: variables.status === "approved" ? "Expert Approved" : "Application Rejected",
        description: variables.status === "approved"
          ? "The expert has been approved and can now accept clients."
          : "The application has been rejected.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Action failed",
        description: error.message || "Failed to update application status.",
        variant: "destructive",
      });
    },
  });

  const updateRejectionMutation = useMutation({
    mutationFn: async ({ id, rejectionMessage }: { id: string; rejectionMessage: string }) => {
      return apiRequest("PATCH", `/api/admin/expert-applications/${id}/rejection-reason`, { rejectionMessage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expert-applications"] });
      toast({ title: "Rejection reason updated", description: "The applicant will see the updated message." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Save failed", description: error?.message ?? "Try again." });
    },
  });

  const filteredPending = pendingApps.filter(app => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${app.firstName || ""} ${app.lastName || ""}`.toLowerCase();
    return name.includes(q) || (app.email || "").toLowerCase().includes(q) || (app.city || "").toLowerCase().includes(q);
  });

  const filteredApproved = approvedApps.filter(app => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${app.firstName || ""} ${app.lastName || ""}`.toLowerCase();
    return name.includes(q) || (app.email || "").toLowerCase().includes(q);
  });

  const filteredRejected = rejectedApps.filter(app => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${app.firstName || ""} ${app.lastName || ""}`.toLowerCase();
    return name.includes(q) || (app.email || "").toLowerCase().includes(q) || (app.city || "").toLowerCase().includes(q);
  });

  if (isLoading) {
    return (
      <AdminLayout title="Expert Management">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Expert Management">
      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{applications.length}</p>
              <p className="text-sm text-gray-500">Total Applications</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{approvedApps.length}</p>
              <p className="text-sm text-gray-500">Approved</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-pending">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{pendingApps.length}</p>
              <p className="text-sm text-gray-500">Pending Approval</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-rejected">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{applications.filter(a => a.status === "rejected").length}</p>
              <p className="text-sm text-gray-500">Rejected</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={activeTab === "applications" ? "default" : "outline"}
            onClick={() => setActiveTab("applications")}
            data-testid="button-tab-applications"
          >
            <Clock className="w-4 h-4 mr-2" /> Pending Applications ({pendingApps.length})
          </Button>
          <Button
            variant={activeTab === "active" ? "default" : "outline"}
            onClick={() => setActiveTab("active")}
            data-testid="button-tab-active"
          >
            <UserCheck className="w-4 h-4 mr-2" /> Approved Experts ({approvedApps.length})
          </Button>
          <Button
            variant={activeTab === "rejected" ? "default" : "outline"}
            onClick={() => setActiveTab("rejected")}
            data-testid="button-tab-rejected"
          >
            <XCircle className="w-4 h-4 mr-2" /> Rejected ({rejectedApps.length})
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search experts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-experts"
              />
            </div>
          </CardContent>
        </Card>

        {activeTab === "applications" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                Pending Applications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredPending.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No pending applications</p>
              ) : (
                filteredPending.map((app) => (
                  <div
                    key={app.id}
                    className="p-4 border border-gray-200 rounded-lg space-y-3"
                    data-testid={`card-application-${app.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-purple-100 text-purple-700">
                            {`${(app.firstName || "?")[0]}${(app.lastName || "?")[0]}`}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold text-gray-900">{app.firstName} {app.lastName}</h3>
                          <p className="text-sm text-gray-500">{app.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(app.createdAt).toLocaleDateString()}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Location</p>
                        <p className="font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {app.city || "N/A"}, {app.country || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Experience</p>
                        <p className="font-medium">{app.yearsInCity || "N/A"} years</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Destinations</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(app.destinations || []).slice(0, 2).map((d, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{d}</Badge>
                          ))}
                          {(app.destinations || []).length > 2 && (
                            <Badge variant="outline" className="text-xs">+{app.destinations!.length - 2}</Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-gray-500">Specialties</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(app.specialties || []).slice(0, 2).map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                          {(app.specialties || []).length > 2 && (
                            <Badge variant="outline" className="text-xs">+{app.specialties!.length - 2}</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {app.expertType === "local_expert" && app.localityProof && (
                      <div className="text-sm">
                        <span className="text-gray-500 font-medium">How they're local: </span>
                        <Badge variant="secondary" className="text-xs ml-1">
                          {{ born_raised: "Born & raised", long_term_10yr: "Long-term resident (10+ yrs)", resident_5yr: "Resident (5+ yrs)", current_resident: "Current resident" }[app.localityProof] ?? app.localityProof}
                        </Badge>
                      </div>
                    )}

                    {app.expertType === "local_expert" && (app.neighborhoods ?? []).length > 0 && (
                      <div className="text-sm">
                        <span className="text-gray-500 font-medium">Neighbourhoods: </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(app.neighborhoods ?? []).map((n, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{n}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Kyoto Knowledge-Bar expertise score (ADVISORY — decision support, not an auto-gate). */}
                    {app.expertType === "local_expert" && app.knowledgeScore && (() => {
                      const ks = app.knowledgeScore!;
                      const DIM_LABEL: Record<string, string> = { weighted: "Weighted", current_local: "Current/local", negative: "Steer-away", personalization: "For-whom" };
                      const badge = ks.verdict === "strong" ? "bg-green-100 text-green-800 border-green-200"
                        : ks.verdict === "adequate" ? "bg-amber-100 text-amber-800 border-amber-200"
                        : ks.verdict === "weak" ? "bg-red-100 text-red-800 border-red-200"
                        : "bg-gray-100 text-gray-600 border-gray-200";
                      return (
                        <div className="text-sm space-y-1.5 rounded border border-gray-200 bg-gray-50 p-2.5" data-testid={`knowledge-score-${app.id}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 font-medium">Expertise score</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${badge}`}>
                              {ks.overall != null ? `${ks.overall}/100 · ${ks.verdict}` : "not scored"}
                            </span>
                            <span className="text-[10px] text-gray-400">advisory — you decide</span>
                          </div>
                          {ks.overall == null && ks.note && (
                            <p className="text-xs text-gray-500 italic">{ks.note}</p>
                          )}
                          {(ks.perAnswer ?? []).map((pa, i) => (
                            <div key={i} className="text-xs text-gray-600">
                              <span className="font-medium">A{i + 1} · {pa.score}/12</span>
                              {" — "}
                              {Object.entries(pa.dimensions ?? {}).map(([k, v]) => `${DIM_LABEL[k] ?? k} ${v}`).join(" · ")}
                              {pa.feedback && <span className="block text-gray-500 italic">{pa.feedback}</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {app.expertType === "local_expert" && (app.knowledgeProofAnswers ?? []).length > 0 && (
                      <div className="text-sm space-y-2">
                        <span className="text-gray-500 font-medium block">Knowledge Proof:</span>
                        {(app.knowledgeProofAnswers ?? []).map((qa, i) => (
                          qa.answer?.trim() && (
                            <div key={i} className="p-2 bg-amber-50 border border-amber-100 rounded text-xs">
                              <p className="font-medium text-amber-800 mb-0.5">Q{i + 1}: {qa.question?.slice(0, 70)}…</p>
                              <p className="text-gray-700 italic">"{qa.answer.trim().slice(0, 200)}{qa.answer.trim().length > 200 ? "…" : ""}"</p>
                            </div>
                          )
                        ))}
                      </div>
                    )}

                    {app.expertType !== "local_expert" && app.bio && (
                      <p className="text-sm text-gray-600 italic">"{app.bio.slice(0, 150)}{app.bio.length > 150 ? "..." : ""}"</p>
                    )}

                    <div className="space-y-2 pt-2">
                      {/* Identity verification status badge */}
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const idStatus = (app as any).identityVerificationStatus ?? "pending";
                          if (idStatus === "verified") return <Badge className="bg-green-100 text-green-700 text-xs">✓ ID Verified</Badge>;
                          if (idStatus === "processing") return <Badge className="bg-blue-100 text-blue-700 text-xs">⏳ ID Processing</Badge>;
                          if (idStatus === "failed") return <Badge className="bg-red-100 text-red-700 text-xs">✗ ID Failed</Badge>;
                          return <Badge variant="outline" className="text-gray-500 text-xs">ID Not Submitted</Badge>;
                        })()}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const idStatus = (app as any).identityVerificationStatus;
                            let overrideNote: string | undefined;
                            if (idStatus !== "verified") {
                              const note = window.prompt(
                                `Identity verification is incomplete (status: ${idStatus || "not started"}).\n\nEnter an override reason to approve anyway (required):`,
                                ""
                              );
                              if (note === null) return;
                              if (!note.trim()) {
                                alert("An override reason is required when approving without completed verification.");
                                return;
                              }
                              overrideNote = `[Admin override] ${note.trim()}`;
                            }
                            updateStatusMutation.mutate({ id: app.id, status: "approved", rejectionMessage: overrideNote });
                          }}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-approve-${app.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ id: app.id, status: "rejected", rejectionMessage: "Does not meet requirements at this time." })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-reject-${app.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-green-600" />
                Approved Experts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredApproved.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No approved experts yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Expert</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Location</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Destinations</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Knowledge Nuggets</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Commission Override</th>
                        <th className="text-left py-3 px-2 text-sm font-medium text-gray-500">Approved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApproved.map((expert) => {
                        const nuggetCount = nuggetCounts[expert.userId] ?? 0;
                        const isLocal = expert.expertType === "local_expert";
                        return (
                        <tr key={expert.id} className="border-b border-gray-100 last:border-0" data-testid={`row-expert-${expert.id}`}>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-green-100 text-green-700 text-xs">
                                  {`${(expert.firstName || "?")[0]}${(expert.lastName || "?")[0]}`}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex items-center gap-1">
                                  <p className="font-medium text-gray-900">{expert.firstName} {expert.lastName}</p>
                                  <CheckCircle className="w-4 h-4 text-blue-500" />
                                </div>
                                <p className="text-xs text-gray-500">{expert.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-gray-600">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {expert.city || "N/A"}, {expert.country || "N/A"}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex flex-wrap gap-1">
                              {(expert.destinations || []).slice(0, 2).map((d, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{d}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-2" data-testid={`cell-nuggets-${expert.id}`}>
                            {isLocal ? (
                              <span className="flex items-center gap-1.5 text-sm">
                                <Brain className="w-3.5 h-3.5 text-purple-500" />
                                <span className={nuggetCount > 0 ? "font-semibold text-purple-700" : "text-gray-400"}>
                                  {nuggetCount}
                                </span>
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 px-2" data-testid={`cell-override-${expert.id}`}>
                            <CommissionOverrideEditor
                              userId={expert.userId}
                              currentValue={expert.commissionOverrideExpertSharePercent ?? null}
                              onSave={(v) => overrideMutation.mutate({ userId: expert.userId, value: v })}
                              isSaving={overrideMutation.isPending}
                            />
                          </td>
                          <td className="py-3 px-2 text-sm text-gray-500">
                            {new Date(expert.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "rejected" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                Rejected Applications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredRejected.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No rejected applications</p>
              ) : (
                filteredRejected.map((app) => (
                  <div
                    key={app.id}
                    className="p-4 border border-red-100 bg-red-50 rounded-lg space-y-3"
                    data-testid={`card-rejected-${app.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-red-100 text-red-700 text-sm">
                            {`${(app.firstName || "?")[0]}${(app.lastName || "?")[0]}`}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold text-gray-900">{app.firstName} {app.lastName}</h3>
                          <p className="text-sm text-gray-500">{app.email}</p>
                          {(app.city || app.country) && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" /> {[app.city, app.country].filter(Boolean).join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(app.createdAt).toLocaleDateString()}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Rejection Reason</p>
                      <RejectionReasonEditor
                        appId={app.id}
                        currentMessage={app.rejectionMessage}
                        onSaved={(id, msg) => updateRejectionMutation.mutate({ id, rejectionMessage: msg })}
                        isSaving={updateRejectionMutation.isPending}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
