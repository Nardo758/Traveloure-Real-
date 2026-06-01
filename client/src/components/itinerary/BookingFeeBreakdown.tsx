import { Badge } from "@/components/ui/badge";
import { Sparkles, UserCheck, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface FeeConfig {
  platformFeePercent: number;
  expertSharePercent: number;
}

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  platformFeePercent: 12,
  expertSharePercent: 70,
};

export type BookedBy = "ai" | "expert" | "user";

interface BookingFeeBreakdownProps {
  subtotal: number;
  bookedBy: BookedBy;
  feeConfig?: FeeConfig;
  compact?: boolean;
  className?: string;
}

function calcFees(subtotal: number, bookedBy: BookedBy, cfg: FeeConfig) {
  if (subtotal <= 0) return null;
  const fee = Math.round(subtotal * (cfg.platformFeePercent / 100) * 100) / 100;
  if (bookedBy === "ai") {
    return {
      platformFee: fee,
      expertEarns: 0,
      total: subtotal + fee,
      label: "AI Booking Fee",
      description: `${cfg.platformFeePercent}% platform fee — AI handles all bookings`,
    };
  }
  if (bookedBy === "expert") {
    const expertCut = Math.round(fee * (cfg.expertSharePercent / 100) * 100) / 100;
    const platformCut = Math.round(fee * ((100 - cfg.expertSharePercent) / 100) * 100) / 100;
    return {
      platformFee: platformCut,
      expertEarns: expertCut,
      total: subtotal + fee,
      label: "Expert Booking Fee",
      description: `${cfg.platformFeePercent}% booking fee split: ${100 - cfg.expertSharePercent}% platform / ${cfg.expertSharePercent}% expert`,
    };
  }
  return null;
}

export function BookingFeeBreakdown({
  subtotal,
  bookedBy,
  feeConfig = DEFAULT_FEE_CONFIG,
  compact = false,
  className,
}: BookingFeeBreakdownProps) {
  const fees = calcFees(subtotal, bookedBy, feeConfig);
  if (!fees || subtotal <= 0) return null;

  const isAI = bookedBy === "ai";
  const isExpert = bookedBy === "expert";

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded cursor-help",
                isAI
                  ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                className
              )}
              data-testid="badge-booking-fee-compact"
            >
              {isAI ? <Sparkles className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
              +{feeConfig.platformFeePercent}% fee
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-xs">
            {fees.description}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-3 space-y-2 text-sm",
        isAI
          ? "bg-violet-50/50 dark:bg-violet-950/20 border-violet-100 dark:border-violet-800"
          : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-800",
        className
      )}
      data-testid="booking-fee-breakdown"
    >
      <div className="flex items-center gap-2">
        {isAI ? (
          <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
        ) : (
          <UserCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        )}
        <span className="font-semibold text-foreground">
          {isAI ? "AI-Booked" : "Expert-Booked"}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-xs">
              {fees.description}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto text-[10px] font-medium",
            isAI
              ? "border-violet-200 text-violet-700 dark:text-violet-300"
              : "border-amber-200 text-amber-700 dark:text-amber-300"
          )}
          data-testid="badge-booked-by"
        >
          {isAI ? "AI Managed" : "Expert Managed"}
        </Badge>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>${subtotal.toLocaleString()}</span>
        </div>
        <div
          className={cn(
            "flex justify-between font-medium",
            isAI ? "text-violet-700 dark:text-violet-300" : "text-amber-700 dark:text-amber-300"
          )}
          data-testid="text-platform-fee"
        >
          <span>
            {fees.label} ({feeConfig.platformFeePercent}%)
            {isExpert && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                (platform {100 - feeConfig.expertSharePercent}% · expert {feeConfig.expertSharePercent}%)
              </span>
            )}
          </span>
          <span>${(fees.platformFee + fees.expertEarns).toFixed(2)}</span>
        </div>
        {isExpert && fees.expertEarns > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground pl-2" data-testid="text-expert-earnings">
            <span>↳ Expert earns</span>
            <span className="text-amber-600 dark:text-amber-400">${fees.expertEarns.toFixed(2)}</span>
          </div>
        )}
        <div
          className="flex justify-between font-bold text-foreground pt-1 border-t border-border"
          data-testid="text-total-with-fee"
        >
          <span>Total (incl. fee)</span>
          <span>${fees.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export { calcFees };
