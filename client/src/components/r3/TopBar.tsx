/**
 * R3 U4 - the V24 top bar (board panels 1-3): the plan switcher, the bell and the account menu.
 *
 * Plan pages under `?surface=r3` only. The bar sits IN FLOW at the top of the page (no sticky, no overlap): each menu is
 * anchored to its own trigger. Board strings are DRAFT.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Bell, ChevronDown } from "lucide-react";
import { BOARD_CELL, BOARD_FILL, BOARD_INK, BOARD_LINE, BOARD_TEXT } from "@/components/r3/tokens";
import { PLAN_START_HREF } from "@/lib/plan-entry";
import { r3IsPast, r3WhenLine } from "@/lib/r3-surface";
import { useAuth } from "@/hooks/use-auth";

export interface BarPlan {
  id: string;
  title?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export function R3TopBar({ plan, plans, tripId }: { plan: BarPlan | null; plans: BarPlan[]; tripId: string | null }) {
  const [openPanel, setOpenPanel] = useState<"plans" | "account" | null>(null);
  const { user, logout } = useAuth();
  const initials = ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || "U";
  const when = plan ? r3WhenLine(plan.startDate, plan.endDate) : "";
  const panelStyle = { backgroundColor: BOARD_CELL, borderColor: BOARD_LINE } as const;

  return (
    <div className="relative z-30 bg-transparent" data-testid="r3-topbar">
      <div className="mx-auto max-w-[1152px] px-3 pt-3">
        <div className="relative flex h-14 items-center gap-3 rounded-xl border px-3" style={{ borderColor: BOARD_LINE, backgroundColor: BOARD_CELL }}>
          <Link href="/" className="hidden text-[13px] font-bold tracking-[0.12em] lg:block" style={{ color: BOARD_INK }} data-testid="r3-bar-brand">
            TRAVELOURE
          </Link>

          {/* the switcher trigger and its menu share one relative box, so the panel sits under the button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenPanel((p) => (p === "plans" ? null : "plans"))}
              aria-expanded={openPanel === "plans"}
              className="flex min-h-11 items-center gap-2 rounded-full border px-3 text-[13px] font-medium"
              style={{ borderColor: BOARD_LINE, color: BOARD_INK }}
              data-testid="r3-plan-switcher-button"
            >
              <span className="max-w-[170px] truncate">{plan?.title ?? (tripId ? "Your plan" : "Start a plan")}</span>
              {tripId ? <span className="hidden text-[12px] text-muted-foreground sm:inline">{when || "No dates yet"}</span> : null}
              <ChevronDown className="h-4 w-4" />
            </button>
            {openPanel === "plans" ? (
              <div className="absolute left-0 top-full z-40 mt-1 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border p-3 shadow-xl" style={panelStyle} data-testid="r3-plan-switcher-panel">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Your plans</p>
                <ul className="mt-2 space-y-1">
                  {plans.map((p) => {
                    const dates = r3WhenLine(p.startDate, p.endDate);
                    const past = r3IsPast(p.endDate);
                    const current = p.id === tripId;
                    return (
                      <li key={p.id}>
                        <Link
                          href={`/plans/${p.id}?surface=r3`}
                          onClick={() => setOpenPanel(null)}
                          className="block rounded-lg border px-2 py-2"
                          style={current ? { borderColor: BOARD_TEXT } : { borderColor: BOARD_LINE }}
                          data-testid="r3-plan-row"
                          data-current={current ? "true" : "false"}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block text-[13px] font-medium" style={{ color: BOARD_INK }}>{p.title ?? "Your plan"}</span>
                              <span className="block text-[12px] text-muted-foreground">{dates || "No dates yet"}</span>
                            </span>
                            {past ? (
                              <span className="shrink-0 text-[11px] font-medium text-muted-foreground" data-testid="r3-plan-past">Past</span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href={PLAN_START_HREF}
                  className="mt-2 block rounded-lg px-3 py-2 text-center text-[13px] font-medium"
                  style={{ backgroundColor: BOARD_FILL, color: BOARD_TEXT }}
                  data-testid="r3-plan-start"
                >
                  Start a plan
                </Link>
              </div>
            ) : null}
          </div>

          {/* the account trigger and its menu share one relative box, right-aligned inside the bar */}
          <div className="relative ml-auto flex items-center gap-2">
            <button type="button" aria-label="Updates" className="min-h-11 min-w-11 rounded-full border" style={{ borderColor: BOARD_LINE }} data-testid="r3-bar-bell">
              <Bell className="mx-auto h-4 w-4" style={{ color: BOARD_INK }} />
            </button>
            <button
              type="button"
              aria-label="Account"
              aria-expanded={openPanel === "account"}
              onClick={() => setOpenPanel((p) => (p === "account" ? null : "account"))}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border text-[12px] font-semibold"
              style={{ borderColor: BOARD_LINE, color: BOARD_TEXT }}
              data-testid="r3-account-button"
            >
              {initials}
            </button>
            {openPanel === "account" ? (
              <div className="absolute right-0 top-full z-40 mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl border p-3 shadow-xl" style={panelStyle} data-testid="r3-account-panel">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Account</p>
                <ul className="mt-2 divide-y text-[13px]" style={{ color: BOARD_INK, borderColor: BOARD_LINE }}>
                  <li><Link href="/profile" onClick={() => setOpenPanel(null)} className="block px-2 py-2 font-semibold" data-testid="r3-account-profile">Profile</Link></li>
                  <li><Link href="/profile" onClick={() => setOpenPanel(null)} className="block px-2 py-2 font-semibold" data-testid="r3-account-settings">Settings</Link></li>
                  <li>
                    <Link href="/bookings" onClick={() => setOpenPanel(null)} className="block px-2 py-2 font-semibold" data-testid="r3-account-bookings">
                      Bookings and receipts
                      <span className="block text-[11px] font-normal text-muted-foreground">Every plan, and anything not on a plan</span>
                    </Link>
                  </li>
                  <li>
                    <Link href="/inbox" onClick={() => setOpenPanel(null)} className="block px-2 py-2 font-semibold" data-testid="r3-account-messages">
                      Messages
                      <span className="block text-[11px] font-normal text-muted-foreground">Only those not tied to a plan</span>
                    </Link>
                  </li>
                  <li>
                    <button type="button" onClick={() => logout()} className="block w-full px-2 py-2 text-left font-semibold" data-testid="r3-account-logout">
                      Log out
                    </button>
                  </li>
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
