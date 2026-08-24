import type { ReactNode } from "react";
import { Bell, ChevronDown, Globe2 } from "lucide-react";
import "./continuity.css";

type ContinuityShellProps = {
  active: "Marketplace" | "Experts & services" | "Planning tools";
  children: ReactNode;
};

export function ContinuityShell({ active, children }: ContinuityShellProps) {
  const navItems: ContinuityShellProps["active"][] = ["Marketplace", "Experts & services", "Planning tools"];

  return (
    <div className="tc-page">
      <header className="tc-topbar">
        <div className="tc-shell tc-nav">
          <div className="tc-wordmark"><span className="tc-mark">◉</span>TRAVELOURE</div>
          <nav className="tc-main-nav" aria-label="Primary navigation">
            {navItems.map((item) => <button type="button" className={item === active ? "active" : ""} key={item}>{item}{item !== "Planning tools" && <ChevronDown size={13} />}</button>)}
          </nav>
          <div className="tc-nav-actions"><button type="button" aria-label="Change language"><Globe2 size={16} /></button><button type="button" aria-label="Notifications"><Bell size={16} /></button><button type="button" className="tc-avatar">T</button></div>
        </div>
      </header>
      <main className="tc-shell">{children}</main>
    </div>
  );
}