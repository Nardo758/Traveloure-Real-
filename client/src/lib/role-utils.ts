// Role vocabulary comes from the ONE canonical module (shared/roles.ts) — do not
// re-declare role lists here (the role-vocabulary audit found five divergent copies).
import { isExpertRole, isProviderRole } from "@shared/roles";

export function getRoleHomePath(role: string): string {
  if (isExpertRole(role)) return "/expert/dashboard";
  if (isProviderRole(role)) return "/provider/dashboard";
  if (role === "executive_assistant") return "/ea/dashboard";
  if (role === "admin") return "/admin/dashboard";
  return "/dashboard";
}

export function userHasRequiredRole(userRole: string, requiredRole: string): boolean {
  if (userRole === "admin") return true;
  // "expert" / "provider" here are CLIENT ROUTING TOKENS (ProtectedRoute requiredRole),
  // not stored roles — they expand to the canonical role families.
  if (requiredRole === "expert") return isExpertRole(userRole);
  if (requiredRole === "provider") return isProviderRole(userRole);
  if (requiredRole === "executive_assistant") return userRole === "executive_assistant";
  return userRole === requiredRole;
}
