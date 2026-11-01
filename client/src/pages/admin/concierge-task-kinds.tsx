/**
 * CN-1b-UI (ledger `2026-11-01-cn1b-ui-concierge-fields`): the admin's concierge task list — the kinds a concierge
 * listing may pick. Reads and writes the #1816 rails (`/api/admin/concierge-task-kinds`, under the §2 blanket guard).
 *
 * Stays and transport are links only: the server derives that from the domain and key and refuses a link-only kind
 * saved as bookable, so this screen shows the derived flag and never offers a "bookable" switch. Every word here is a
 * HELD placeholder (`CN1B_HELD_COPY`).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CONCIERGE_TASK_DOMAINS } from "@shared/concierge-tasks";
import { CN1B_HELD_COPY } from "@/lib/concierge-listing-form";

export const ADMIN_CONCIERGE_TASK_KINDS_URL = "/api/admin/concierge-task-kinds";

interface AdminTaskKind {
  id: string;
  label: string;
  domain: string;
  linkOnly: boolean;
  sortOrder: number | null;
  active: boolean | null;
}

export default function AdminConciergeTaskKindsPage() {
  const { data, isLoading } = useQuery<{ kinds: AdminTaskKind[] }>({ queryKey: [ADMIN_CONCIERGE_TASK_KINDS_URL] });
  const [taskKey, setTaskKey] = useState("");
  const [label, setLabel] = useState("");
  const [domain, setDomain] = useState<string>(CONCIERGE_TASK_DOMAINS[0]);
  const [sortOrder, setSortOrder] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [ADMIN_CONCIERGE_TASK_KINDS_URL] });
    void queryClient.invalidateQueries({ queryKey: ["/api/concierge-task-kinds"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const order = sortOrder.trim() === "" ? null : Number(sortOrder);
      await apiRequest("POST", ADMIN_CONCIERGE_TASK_KINDS_URL, {
        taskKey: taskKey.trim(),
        label: label.trim(),
        domain,
        active: true,
        ...(order !== null && Number.isInteger(order) ? { sortOrder: order } : {}),
      });
    },
    onSuccess: () => {
      setTaskKey("");
      setLabel("");
      setSortOrder("");
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const patch = useMutation({
    mutationFn: async (input: { id: string; body: Record<string, unknown> }) => {
      await apiRequest("PATCH", `${ADMIN_CONCIERGE_TASK_KINDS_URL}/${encodeURIComponent(input.id)}`, input.body);
    },
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl" data-testid="admin-concierge-task-kinds">
        <h1 className="text-2xl font-semibold mb-6">{CN1B_HELD_COPY.adminTitle}</h1>

        <form
          className="flex flex-wrap items-end gap-3 mb-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (taskKey.trim() && label.trim()) add.mutate();
          }}
        >
          <div>
            <Label htmlFor="concierge-task-key">{CN1B_HELD_COPY.adminKey}</Label>
            <Input id="concierge-task-key" value={taskKey} onChange={(e) => setTaskKey(e.target.value)} className="mt-1 w-44" data-testid="admin-concierge-task-key" />
          </div>
          <div>
            <Label htmlFor="concierge-task-label">{CN1B_HELD_COPY.adminLabel}</Label>
            <Input id="concierge-task-label" value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-56" data-testid="admin-concierge-task-label" />
          </div>
          <div>
            <Label htmlFor="concierge-task-domain">{CN1B_HELD_COPY.adminDomain}</Label>
            <select
              id="concierge-task-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="mt-1 block h-10 rounded-md border border-input bg-background px-2 text-sm"
              data-testid="admin-concierge-task-domain"
            >
              {CONCIERGE_TASK_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="concierge-task-order">{CN1B_HELD_COPY.adminSortOrder}</Label>
            <Input id="concierge-task-order" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="mt-1 w-24" data-testid="admin-concierge-task-order" />
          </div>
          <Button type="submit" disabled={add.isPending} data-testid="admin-concierge-task-add">
            {CN1B_HELD_COPY.adminAdd}
          </Button>
        </form>
        {error ? <p className="text-sm text-destructive mb-4">{error}</p> : null}

        {isLoading || !data ? null : (
          <ul className="divide-y border rounded-md" data-testid="admin-concierge-task-list">
            {data.kinds.map((kind) => (
              <AdminTaskKindRow key={kind.id} kind={kind} onPatch={(body) => patch.mutate({ id: kind.id, body })} />
            ))}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}

function AdminTaskKindRow({ kind, onPatch }: { kind: AdminTaskKind; onPatch: (body: Record<string, unknown>) => void }) {
  const [label, setLabel] = useState(kind.label);
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2" data-testid={`admin-concierge-task-${kind.id}`}>
      <span className="text-xs text-muted-foreground w-40">{kind.id}</span>
      <Input aria-label={`${CN1B_HELD_COPY.adminLabel}: ${kind.id}`} value={label} onChange={(e) => setLabel(e.target.value)} className="w-56" />
      <span className="text-xs text-muted-foreground">{kind.domain}</span>
      {kind.linkOnly ? (
        <span className="text-xs font-medium" data-testid={`admin-concierge-task-link-only-${kind.id}`}>
          {CN1B_HELD_COPY.adminLinkOnly}
        </span>
      ) : null}
      <label className="text-sm flex items-center gap-2 ml-auto">
        <input type="checkbox" checked={kind.active !== false} onChange={(e) => onPatch({ active: e.target.checked })} />
        {CN1B_HELD_COPY.adminActive}
      </label>
      <Button type="button" size="sm" variant="outline" disabled={label.trim() === "" || label === kind.label} onClick={() => onPatch({ label: label.trim() })}>
        {CN1B_HELD_COPY.adminSave}
      </Button>
    </li>
  );
}
