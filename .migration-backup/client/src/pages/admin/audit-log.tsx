import React, { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { Shield, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";

interface RoleChangeLog {
  id: string;
  created_at: string;
  actor_id: string;
  actor_role: string;
  actor_first_name: string | null;
  actor_last_name: string | null;
  actor_email: string | null;
  target_user_id: string | null;
  target_first_name: string | null;
  target_last_name: string | null;
  target_email: string | null;
  metadata: {
    oldRole?: string | null;
    newRole?: string | null;
    reason?: string | null;
  } | null;
  ip_address: string | null;
}

interface AuditLogResponse {
  logs: RoleChangeLog[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 25;

function userLabel(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
  id: string
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name ? `${name} (${email ?? id})` : (email ?? id);
}

function roleBadgeVariant(role: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (!role) return "outline";
  if (role === "admin") return "destructive";
  if (role === "local_expert" || role === "travel_expert" || role === "event_planner" || role === "executive_assistant") return "default";
  if (role === "service_provider") return "secondary";
  return "outline";
}

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const [targetUserFilter, setTargetUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<{
    targetUserId: string;
    dateFrom: string;
    dateTo: string;
  }>({ targetUserId: "", dateFrom: "", dateTo: "" });

  const offset = (page - 1) * PAGE_SIZE;

  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  if (appliedFilters.targetUserId) params.set("targetUserId", appliedFilters.targetUserId);
  if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
  if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);

  const { data, isLoading, isError } = useQuery<AuditLogResponse>({
    queryKey: ["/api/admin/audit-logs/role-changes", page, appliedFilters],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit-logs/role-changes?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function applyFilters() {
    setPage(1);
    setAppliedFilters({
      targetUserId: targetUserFilter.trim(),
      dateFrom,
      dateTo,
    });
  }

  function clearFilters() {
    setTargetUserFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    setAppliedFilters({ targetUserId: "", dateFrom: "", dateTo: "" });
  }

  const hasActiveFilters =
    appliedFilters.targetUserId || appliedFilters.dateFrom || appliedFilters.dateTo;

  return (
    <AdminLayout title="Role Change Audit Log">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">Role Change Audit Log</h1>
            <p className="text-sm text-muted-foreground">
              Complete history of every user role change made by admins
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filter</CardTitle>
            <CardDescription>Narrow results by target user ID or date range</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1 min-w-[220px]">
                <Label htmlFor="targetUserId">Target User ID</Label>
                <Input
                  id="targetUserId"
                  placeholder="Paste a user ID…"
                  value={targetUserFilter}
                  onChange={(e) => setTargetUserFilter(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="dateFrom">From</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="dateTo">To</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={applyFilters} className="flex items-center gap-1">
                  <Search className="h-4 w-4" />
                  Apply
                </Button>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters} className="flex items-center gap-1">
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {isLoading ? "Loading…" : `${total.toLocaleString()} event${total === 1 ? "" : "s"}`}
              </CardTitle>
              {totalPages > 1 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="text-center py-12 text-destructive text-sm">
                Failed to load audit log. Please try again.
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No role-change events found
                {hasActiveFilters ? " for the current filters" : ""}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Timestamp</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Target User</TableHead>
                      <TableHead className="whitespace-nowrap">Old Role</TableHead>
                      <TableHead className="whitespace-nowrap">New Role</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const oldRole = log.metadata?.oldRole ?? null;
                      const newRole = log.metadata?.newRole ?? null;
                      const reason = log.metadata?.reason ?? null;
                      const ts = log.created_at
                        ? new Date(log.created_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—";

                      return (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                            {ts}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {userLabel(
                                log.actor_first_name,
                                log.actor_last_name,
                                log.actor_email,
                                log.actor_id
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{log.actor_role}</div>
                          </TableCell>
                          <TableCell>
                            {log.target_user_id ? (
                              <div className="text-sm">
                                {userLabel(
                                  log.target_first_name,
                                  log.target_last_name,
                                  log.target_email,
                                  log.target_user_id
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {oldRole ? (
                              <Badge variant={roleBadgeVariant(oldRole)} className="text-xs">
                                {oldRole}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {newRole ? (
                              <Badge variant={roleBadgeVariant(newRole)} className="text-xs">
                                {newRole}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs">
                            {reason ? (
                              <span className="text-sm">{reason}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bottom pagination */}
        {totalPages > 1 && (
          <div className="flex justify-end items-center gap-2 text-sm text-muted-foreground">
            Page {page} of {totalPages}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
