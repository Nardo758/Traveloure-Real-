import { createAutomationRegistry } from "../registry";
import { intakeAutomations } from "./intake-index";
import { providerAdminAutomations } from "./admin-index";

export const providerAutomations = [...intakeAutomations, ...providerAdminAutomations] as const;
export const providerAutomationRegistry = createAutomationRegistry(providerAutomations);