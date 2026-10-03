/**
 * Who an EA can file an event or a trip under.
 *
 * `ea_executives` is a manual directory. The people the assistant actually works for live on
 * `ea_client_relationships` (`GET /api/ea/clients`). An event's `executiveId` foreign key points
 * at `ea_executives` only, so an accepted client is offered by NAME and is never sent as that id.
 *
 * A pending invitation (no `clientUserId`) is not on the list — they have not accepted.
 * A client whose name already matches a directory executive is not listed twice.
 */
import { eaClientLabel, type EaClientLabelInput } from "@/lib/ea-client-label";

export interface EaDirectoryExecutive {
  id: string;
  name: string;
}

export interface EaRosterClient extends EaClientLabelInput {
  id: string;
}

export interface EaPersonOption {
  key: string;
  name: string;
  /** Set only for an `ea_executives` row. Null means "send the name, not an id". */
  executiveId: string | null;
}

export function eaPersonOptions(
  executives: EaDirectoryExecutive[],
  clients: EaRosterClient[],
): EaPersonOption[] {
  const fromDirectory: EaPersonOption[] = [];
  const names = new Set<string>();
  for (const exec of executives) {
    const name = exec.name?.trim();
    if (!exec.id || !name) continue;
    fromDirectory.push({ key: `exec:${exec.id}`, name, executiveId: exec.id });
    names.add(name.toLowerCase());
  }
  const fromClients: EaPersonOption[] = [];
  for (const client of clients) {
    if (!client.clientUserId) continue;
    const name = eaClientLabel(client).primary;
    if (!name || name === "Unknown client") continue;
    const folded = name.toLowerCase();
    if (names.has(folded)) continue;
    names.add(folded);
    fromClients.push({ key: `client:${client.id}`, name, executiveId: null });
  }
  return [...fromDirectory, ...fromClients];
}

/** An event filed on a directory row matches that id. A name-only filing matches the name. */
export function eaEventMatchesPerson(
  event: { executiveId?: string | null; executiveName?: string | null },
  person: EaPersonOption,
): boolean {
  if (person.executiveId && event.executiveId === person.executiveId) return true;
  if (event.executiveId) return false;
  return (event.executiveName ?? "") === person.name;
}
