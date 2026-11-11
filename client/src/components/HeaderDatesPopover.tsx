/**
 * Cut-list #1 slice B: the header chip's "Add dates" opens THE dates panel (`InlineDatesPanel`,
 * which now draws the one range calendar) in a popover. Not a second picker and not a second write
 * rail: a signed-in plan saves through `PATCH /api/trips/:id` exactly as the slip does; a guest plan
 * through its own `PATCH /api/guest-plans/current` (`updateGuestPlan`, the rail the guest slip uses).
 *
 * After a save the header re-reads: the guest rail writes its query data itself; a trip save
 * invalidates `/api/trips`, which is what the chip reads.
 */
import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InlineDatesPanel } from "@/components/plan/SlipAnchorPanels";
import { queryClient } from "@/lib/queryClient";
import { updateGuestPlan } from "@/lib/waitlist-guest-plan";
import type { HeaderDatesTarget } from "@/lib/header-plan";

export function HeaderDatesPopover({
  target,
  variant,
  children,
}: {
  target: HeaderDatesTarget;
  variant: "desktop" | "mobile";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={variant === "mobile" ? "center" : "end"}
        className="w-auto max-w-[calc(100vw-2rem)] p-0"
        data-testid="header-dates-popover"
      >
        {open ? (
          <InlineDatesPanel
            tripId={target.planId}
            startDate={target.startDate}
            endDate={target.endDate}
            datesConfirmed={target.datesConfirmed}
            testId="header-dates-panel"
            {...(target.guest
              ? {
                  submit: async (d: { startDate: string; endDate: string }) => {
                    await updateGuestPlan({ startDate: d.startDate, endDate: d.endDate });
                  },
                }
              : {})}
            onSaved={() => {
              if (!target.guest) void queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
