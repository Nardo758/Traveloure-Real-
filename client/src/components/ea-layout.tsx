import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { EASidebar } from "./ea-sidebar";
import { Bell, Bot, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { UserMenu } from "@/components/user-menu";
import { useQuery } from "@tanstack/react-query";

interface EALayoutProps {
  children: React.ReactNode;
  title?: string;
}

interface ImportantDate {
  label: string;
  date: string;
}

interface EaExecutive {
  id: string;
  name: string;
  family?: {
    spouse?: string;
    anniversary?: string;
    children?: string;
    importantDates?: ImportantDate[];
  };
}

interface ImminentDate {
  executiveName: string;
  label: string;
  daysUntil: number;
}

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function parseMonthDay(dateStr: string): { month: number; day: number } | null {
  const cleaned = dateStr.trim().replace(/,/g, "");
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return null;
  const monthKey = parts[0].toLowerCase();
  const day = parseInt(parts[1], 10);
  const month = MONTH_MAP[monthKey];
  if (month === undefined || isNaN(day) || day < 1 || day > 31) return null;
  return { month, day };
}

function daysUntilNextOccurrence(month: number, day: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let target = new Date(today.getFullYear(), month, day);
  if (target.getTime() < today.getTime()) {
    target = new Date(today.getFullYear() + 1, month, day);
  }
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getImminentDates(executives: EaExecutive[]): ImminentDate[] {
  const results: ImminentDate[] = [];
  for (const exec of executives) {
    const dates = exec.family?.importantDates ?? [];
    for (const entry of dates) {
      const parsed = parseMonthDay(entry.date);
      if (!parsed) continue;
      const daysUntil = daysUntilNextOccurrence(parsed.month, parsed.day);
      if (daysUntil <= 1) {
        results.push({ executiveName: exec.name, label: entry.label, daysUntil });
      }
    }
    if (exec.family?.anniversary) {
      const parsed = parseMonthDay(exec.family.anniversary);
      if (parsed) {
        const daysUntil = daysUntilNextOccurrence(parsed.month, parsed.day);
        if (daysUntil <= 1) {
          results.push({ executiveName: exec.name, label: "Anniversary", daysUntil });
        }
      }
    }
  }
  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

function sessionDismissKey(): string {
  const today = new Date();
  return `ea-imminent-banner-dismissed-${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
}

function ImminentDatesBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(sessionDismissKey()) === "true";
    } catch {
      return false;
    }
  });

  const { data: executives } = useQuery<EaExecutive[]>({
    queryKey: ["/api/ea/executives"],
  });

  const imminentDates = getImminentDates(executives ?? []);

  if (dismissed || imminentDates.length === 0) return null;

  const todayDates = imminentDates.filter((d) => d.daysUntil === 0);
  const tomorrowDates = imminentDates.filter((d) => d.daysUntil === 1);

  function handleDismiss() {
    try {
      sessionStorage.setItem(sessionDismissKey(), "true");
    } catch {
    }
    setDismissed(true);
  }

  return (
    <div
      className="flex items-start gap-3 px-5 py-3"
      style={{
        background: "linear-gradient(90deg, #FFF7ED 0%, #FFF3E8 100%)",
        borderBottom: "1px solid #FED7AA",
      }}
      data-testid="banner-imminent-dates"
    >
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#EA580C" }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: "#9A3412" }}>
          Important dates need attention
        </p>
        <ul className="mt-0.5 space-y-0.5">
          {todayDates.map((d, i) => (
            <li key={`today-${i}`} className="text-sm" style={{ color: "#7C2D12" }} data-testid={`text-imminent-today-${i}`}>
              <span className="font-medium text-red-700">Today —</span>{" "}
              {d.executiveName}'s {d.label}
            </li>
          ))}
          {tomorrowDates.map((d, i) => (
            <li key={`tomorrow-${i}`} className="text-sm" style={{ color: "#7C2D12" }} data-testid={`text-imminent-tomorrow-${i}`}>
              <span className="font-medium text-orange-700">Tomorrow —</span>{" "}
              {d.executiveName}'s {d.label}
            </li>
          ))}
        </ul>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 rounded text-orange-700 hover:bg-orange-100"
        onClick={handleDismiss}
        data-testid="button-dismiss-imminent-banner"
        aria-label="Dismiss alert"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export function EALayout({ children, title }: EALayoutProps) {
  const style = {
    "--sidebar-width": "220px",
    "--sidebar-width-icon": "56px",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full" style={{ background: "#FAFAF8" }}>
        <EASidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header
            className="flex items-center justify-between h-[52px] px-5 sticky top-0 z-40 bg-white"
            style={{ borderBottom: "1px solid #E8E8E2" }}
          >
            <div className="flex items-center gap-3">
              <SidebarTrigger
                className="h-8 w-8 rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
                style={{ border: "1px solid #E8E8E2" }}
                data-testid="button-ea-sidebar-toggle"
              />
              {title && (
                <h1
                  className="text-[16px] font-semibold"
                  style={{ color: "#1A1A18", letterSpacing: -0.3 }}
                  data-testid="text-page-title"
                >
                  {title}
                </h1>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="hidden sm:flex items-center gap-1.5 h-[28px] px-2.5 rounded-full"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
                data-testid="badge-ai-status"
              >
                <Bot className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />
                <span className="text-[11px] font-medium" style={{ color: "#15803D" }}>
                  AI: Active
                </span>
              </div>
              <Link href="/notifications">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-[34px] w-[34px] rounded-lg text-[#7A7A72] hover:bg-[#F3F3EE]"
                  style={{ border: "1px solid #E8E8E2" }}
                  data-testid="button-ea-notifications"
                >
                  <Bell className="w-4 h-4" />
                  <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] bg-[#E85D55] rounded-full" />
                </Button>
              </Link>
              <UserMenu />
            </div>
          </header>
          <ImminentDatesBanner />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
