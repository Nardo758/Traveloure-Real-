/**
 * Ops gap 12 (ledger `2026-10-22-audit-log-all-actions`): the "All actions" tab of /admin/audit-log — its words (FOUNDER
 * WORDING REVIEW on the PR) and the one query it sends to `GET /api/admin/audit-logs/all`. Pure.
 */
export const AUDIT_LOG_COPY = {
  pageTitle: "Audit log",
  pageSubtitle: "Every action admins and staff have taken, newest first",
  tabAll: "All actions",
  tabRoleChanges: "Role changes",
  filterTitle: "Filter",
  filterDescription: "Find an action by who took it, what it touched, or when",
  filterAction: "Action",
  filterActionAny: "Any action",
  filterActor: "Actor (user ID or email)",
  filterResourceType: "Resource type",
  filterResourceTypeAny: "Any resource type",
  filterResourceId: "Resource ID",
  filterFrom: "From",
  filterTo: "To",
  empty: "No actions found",
  emptyFiltered: "No actions match these filters",
  colTime: "Time",
  colAction: "Action",
  colActor: "Actor",
  colResource: "Resource",
  colTarget: "Affected user",
} as const;

export const AUDIT_LOG_ALL_PAGE_SIZE = 25;

export interface AuditLogAllFilters {
  action: string;
  actor: string;
  resourceType: string;
  resourceId: string;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_AUDIT_FILTERS: AuditLogAllFilters = { action: "", actor: "", resourceType: "", resourceId: "", dateFrom: "", dateTo: "" };

/** Pure. The query string for one page: only the filters that are set, trimmed; the page as limit/offset. */
export function auditLogAllQuery(filters: AuditLogAllFilters, page: number, pageSize: number = AUDIT_LOG_ALL_PAGE_SIZE): string {
  const p = new URLSearchParams();
  p.set("limit", String(pageSize));
  p.set("offset", String(Math.max(0, page - 1) * pageSize));
  for (const k of ["action", "actor", "resourceType", "resourceId", "dateFrom", "dateTo"] as const) {
    const v = filters[k].trim();
    if (v) p.set(k, v);
  }
  return p.toString();
}

export function hasAuditFilters(f: AuditLogAllFilters): boolean {
  return Object.values(f).some((v) => v.trim() !== "");
}

/**
 * Pure. Gap 13's status change on a row (`metadata.beforeStatus` → `metadata.afterStatus`), as "before → after"; an
 * absent side reads "—". Null when the row records neither (most rows), so the cell shows nothing extra.
 */
export function auditStatusChange(metadata: unknown): string | null {
  const m = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;
  const before = typeof m?.beforeStatus === "string" && m.beforeStatus.trim() ? m.beforeStatus.trim() : null;
  const after = typeof m?.afterStatus === "string" && m.afterStatus.trim() ? m.afterStatus.trim() : null;
  if (!before && !after) return null;
  return `${before ?? "—"} → ${after ?? "—"}`;
}
