// Availability under Catalog — scheduled tour state (gap #2).
// Gion Evening Food Walk selected: weekly pattern (Tue/Thu 18:00 · 8 seats),
// one-off slot marked *, blackout rail; August 2026 grid with today = Aug 12.

import { AvailabilityEditor, ConsoleShell } from "./_consoleShared";

export function AvailabilityCalendar() {
  return (
    <ConsoleShell
      crumbs={[
        { label: "Catalog" },
        { label: "Availability" },
        { label: "Gion Evening Food Walk", current: true },
      ]}
    >
      <AvailabilityEditor selected="tour" />
    </ConsoleShell>
  );
}
