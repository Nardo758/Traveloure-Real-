// Availability under Catalog — nightly (property room) state.
// Machiya — the Tatami Room selected: published date ranges with per-range nightly
// price, no day chips, blackout rail; grid reflects the Sep 1 → Oct 31 range.

import { AvailabilityEditor, ConsoleShell } from "./_consoleShared";

export function AvailabilityNightly() {
  return (
    <ConsoleShell
      crumbs={[
        { label: "Catalog" },
        { label: "Availability" },
        { label: "Machiya — the Tatami Room", current: true },
      ]}
    >
      <AvailabilityEditor selected="room" />
    </ConsoleShell>
  );
}
