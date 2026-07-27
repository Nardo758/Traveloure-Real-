/**
 * Shared back-office UI primitives (Phase B0, docs/backoffice/EXECUTION_ROADMAP.md).
 *
 * The design audit found the same four patterns re-implemented, slightly differently, on
 * every console page: page headers at three different title sizes, several local
 * `getStatusBadge`/`StatusBadge` switch functions, several local "empty" blocks with
 * divergent visuals, and several ad-hoc KPI stat-card blocks. These four primitives are the
 * ratified normal — every later back-office module should import from here instead of
 * re-implementing or restyling its own copy.
 *
 * Styling rule (§17): these render inside ExpertLayout / ProviderLayout / BackofficeShell.
 * Use only Tailwind semantic/console tokens (`text-console-darkest`, `bg-console-bg`,
 * `border-console-light`, `bg-primary`, `text-muted-foreground`, …) — never raw hex.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─────────────────────────────────────────────────────────────────────────
// PageHeader
// ─────────────────────────────────────────────────────────────────────────

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  testId?: string;
}

/** One canonical console page-header: title + optional subtitle line + right-aligned actions. */
export function PageHeader({ title, subtitle, actions, icon: Icon, testId }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-console-darkest flex-shrink-0" />}
          <h1 className="text-2xl font-bold text-console-darkest" data-testid={testId}>
            {title}
          </h1>
        </div>
        {subtitle && <p className="text-console-mid mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────

export interface StatusBadgeEntry {
  label: string;
  className: string;
  icon?: LucideIcon;
}

/**
 * Covers the real lifecycle vocabularies documented in CLAUDE.md: the D1a offering
 * lifecycle (draft/submitted/approved/rejected), service active/paused, the escrow
 * ledger (held/releasable/paid_out/reversed), booking status, and content-studio
 * draft/scheduled/published. Only statuses that actually appear in the codebase are
 * listed — nothing fabricated.
 */
export const DEFAULT_STATUS_MAP: Record<string, StatusBadgeEntry> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-transparent" },
  submitted: { label: "Submitted", className: "bg-blue-100 text-blue-700 border-blue-200" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-200" },
  active: { label: "Active", className: "bg-green-100 text-green-700 border-green-200" },
  paused: { label: "Paused", className: "bg-amber-100 text-amber-700 border-amber-200" },
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-700 border-green-200" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700 border-green-200" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700 border-red-200" },
  refunded: { label: "Refunded", className: "bg-slate-100 text-slate-700 border-slate-200" },
  held: { label: "Held", className: "bg-amber-100 text-amber-700 border-amber-200" },
  releasable: { label: "Releasable", className: "bg-blue-100 text-blue-700 border-blue-200" },
  paid_out: { label: "Paid out", className: "bg-green-100 text-green-700 border-green-200" },
  reversed: { label: "Reversed", className: "bg-red-100 text-red-700 border-red-200" },
  published: { label: "Published", className: "bg-green-100 text-green-700 border-green-200" },
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-700 border-blue-200" },
};

export interface StatusBadgeProps {
  status: string;
  /** Extra/override entries for a page's own statuses, merged over DEFAULT_STATUS_MAP. */
  map?: Record<string, StatusBadgeEntry>;
}

/**
 * A status not found in the map renders the raw string in a neutral outline badge
 * (§13 — never guess a color that implies a state that isn't real).
 */
export function StatusBadge({ status, map }: StatusBadgeProps) {
  const entry = (map && map[status]) ?? DEFAULT_STATUS_MAP[status];
  if (!entry) {
    return <Badge variant="outline">{status}</Badge>;
  }
  const Icon = entry.icon;
  return (
    <Badge className={entry.className}>
      {Icon && <Icon className="w-3 h-3 mr-1" />}
      {entry.label}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  cta?: ReactNode;
  testId?: string;
}

/** The ratified empty-state normal: bordered-dashed container + icon + title + body + optional CTA. */
export function EmptyState({ icon: Icon, title, body, cta, testId }: EmptyStateProps) {
  return (
    <div
      className="rounded-xl border border-dashed border-console-light py-16 px-6 text-center"
      data-testid={testId}
    >
      {Icon && <Icon className="w-10 h-10 mx-auto text-console-mid/60 mb-3" />}
      <h3 className="font-semibold text-console-darkest mb-1">{title}</h3>
      {body && <p className="text-sm text-console-mid max-w-sm mx-auto">{body}</p>}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StatCard
// ─────────────────────────────────────────────────────────────────────────

export interface StatCardProps {
  label: ReactNode;
  /** Real data supplied by the caller — this component never fabricates a value. */
  value: ReactNode;
  valueSuffix?: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  /** Tailwind classes for the icon's wrapper box (e.g. "bg-blue-100 text-blue-600"). */
  iconClassName?: string;
  testId?: string;
}

export function StatCard({ label, value, valueSuffix, sub, icon: Icon, iconClassName, testId }: StatCardProps) {
  return (
    <Card className="border border-console-light" data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-console-mid">{label}</p>
            <p className="text-2xl font-bold text-console-darkest">
              {value}
              {valueSuffix && <span className="text-lg text-console-mid">{valueSuffix}</span>}
            </p>
            {sub && <p className="text-xs text-console-mid mt-1">{sub}</p>}
          </div>
          {Icon && (
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                iconClassName ?? "bg-console-bg text-console-darkest"
              }`}
            >
              <Icon className="w-6 h-6" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
