import { dispatchAutomationEvent } from "../event-dispatcher";
import { providerAutomationRegistry } from "./index";

export async function dispatchProviderEvent<T>(
  id: string,
  event: string,
  payload: unknown,
  context: Record<string, unknown>,
  action: () => Promise<T> | T,
): Promise<T> {
  const dispatched = await dispatchAutomationEvent(
    providerAutomationRegistry,
    id,
    { ...context, event, payload },
    action,
  );
  if (!dispatched.executed) {
    throw new Error(`Provider automation ${id} did not run (${dispatched.reason})`);
  }
  return dispatched.result;
}