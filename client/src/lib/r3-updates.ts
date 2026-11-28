/**
 * R3 U6 - the pure rules behind the Updates panel (V24 v4, panel 8). No React, no network: the panel and its unit test
 * both call these.
 */
import type { ApiNotification } from "@/lib/notification-icons";

export interface UpdatePlan {
  id: string;
  title?: string | null;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "N minutes ago" / "N hours ago" / "Yesterday" / "12 Nov", in local time. `now` is passed in, so the rule is testable. */
export function r3UpdateWhen(createdAt: string, now: Date): string {
  const then = new Date(createdAt);
  if (Number.isNaN(then.getTime())) return "";
  const diff = now.getTime() - then.getTime();
  if (diff < HOUR) {
    const minutes = Math.max(1, Math.floor(diff / MINUTE));
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (diff < 24 * HOUR) {
    const hours = Math.max(1, Math.floor(diff / HOUR));
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (
    then.getFullYear() === yesterday.getFullYear() &&
    then.getMonth() === yesterday.getMonth() &&
    then.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return `${then.getDate()} ${MONTHS[then.getMonth()]}`;
}

/** The plan line for a row: the plan the notification names, or "Not on a plan" when it names none we know. */
export function r3UpdatePlanLine(notification: Pick<ApiNotification, "data">, plans: readonly UpdatePlan[]): string {
  const tripId = notification.data?.tripId;
  if (!tripId) return "Not on a plan";
  const plan = plans.find((p) => p.id === tripId);
  return plan?.title || "Not on a plan";
}

/** Line 2: the plan line, then the moment, as the board draws them. */
export function r3UpdateSubline(notification: Pick<ApiNotification, "data" | "createdAt">, plans: readonly UpdatePlan[], now: Date): string {
  return `${r3UpdatePlanLine(notification, plans)} \u00b7 ${r3UpdateWhen(notification.createdAt, now)}`;
}

/** An href that is the plan's own surface keeps the R3 switch when the panel navigates to it. */
export function r3UpdateHref(href: string): string {
  if (!href.startsWith("/plans/")) return href;
  if (/[?&]surface=r3(&|$)/.test(href)) return href;
  return href.includes("?") ? `${href}&surface=r3` : `${href}?surface=r3`;
}
