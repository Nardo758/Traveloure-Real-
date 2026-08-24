import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  planning: "bg-blue-50 text-blue-700",
  new: "bg-amber-50 text-amber-700",
  pending: "bg-amber-50 text-amber-700",
  completed: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-50 text-red-700",
};

export function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.planning;
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={cn("text-[10px] font-semibold px-2.5 py-0.5 rounded-full", style)}>
      {label}
    </span>
  );
}
