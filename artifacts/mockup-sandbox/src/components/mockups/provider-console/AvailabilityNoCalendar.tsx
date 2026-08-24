// Availability under Catalog — no-calendar state.
// Tokyo Like a Local — 3-Day Guide selected: "No calendar — this sells without slots"
// statement plus the "Nothing to publish" rail card.

import { AvailabilityEditor, ConsoleShell } from "./_consoleShared";

export function AvailabilityNoCalendar() {
  return (
    <ConsoleShell
      crumbs={[
        { label: "Catalog" },
        { label: "Availability" },
        { label: "Tokyo Like a Local — 3-Day Guide", current: true },
      ]}
    >
      <AvailabilityEditor selected="pdf" />
    </ConsoleShell>
  );
}
