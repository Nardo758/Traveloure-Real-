import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useAuth } from "@/hooks/use-auth";
import { isExpertRole, isProviderRole } from "@shared/roles";

export type ConsoleRole = "expert" | "provider" | "ea" | "user";

interface ActiveConsoleContextType {
  consoleRole: ConsoleRole;
}

const STORAGE_KEY = "traveloure_active_console";

function deriveConsoleRole(role: string | undefined | null): ConsoleRole {
  // Role families come from the canonical shared/roles.ts (role-vocabulary audit) —
  // executive_assistant is deliberately NOT expert-family (own /ea console).
  if (isExpertRole(role)) return "expert";
  if (role === "executive_assistant") return "ea";
  if (isProviderRole(role)) return "provider";
  return "user";
}

const ActiveConsoleContext = createContext<ActiveConsoleContextType>({
  consoleRole: "user",
});

export function ActiveConsoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [consoleRole, setConsoleRole] = useState<ConsoleRole>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ConsoleRole | null;
    if (stored && ["expert", "provider", "ea", "user"].includes(stored)) {
      return stored;
    }
    return "user";
  });

  useEffect(() => {
    if (user) {
      const derived = deriveConsoleRole(user.role);
      setConsoleRole(derived);
      localStorage.setItem(STORAGE_KEY, derived);
    } else {
      setConsoleRole("user");
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user?.role]);

  return (
    <ActiveConsoleContext.Provider value={{ consoleRole }}>
      {children}
    </ActiveConsoleContext.Provider>
  );
}

export function useActiveConsole() {
  return useContext(ActiveConsoleContext);
}
