const EXPERT_ROLES = ["expert", "local_expert", "travel_expert", "event_planner"];
const PROVIDER_ROLES = ["service_provider"];

export function getRoleHomePath(role: string): string {
  if (EXPERT_ROLES.includes(role)) return "/expert/dashboard";
  if (PROVIDER_ROLES.includes(role)) return "/provider/dashboard";
  if (role === "executive_assistant") return "/ea/dashboard";
  if (role === "admin") return "/admin/dashboard";
  return "/dashboard";
}

export function userHasRequiredRole(userRole: string, requiredRole: string): boolean {
  if (userRole === "admin") return true;
  if (requiredRole === "expert") return EXPERT_ROLES.includes(userRole);
  if (requiredRole === "provider") return PROVIDER_ROLES.includes(userRole);
  return userRole === requiredRole;
}
