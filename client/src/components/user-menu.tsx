import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ChevronDown,
  Map,
  UserCheck,
  Building2,
  LogOut,
  LayoutDashboard,
  User,
  Shield,
  Briefcase,
  CalendarClock,
} from "lucide-react";
import { useSignInModal } from "@/contexts/SignInModalContext";
import { getRoleHomePath } from "@/lib/role-utils";

const EXPERT_ROLES = ["expert", "local_expert", "travel_expert", "event_planner"];
const PROVIDER_ROLES = ["service_provider"];

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    travel_expert: "Travel Expert",
    local_expert: "Local Expert",
    event_planner: "Event Planner",
    service_provider: "Provider",
    executive_assistant: "Exec. Assistant",
    expert: "Expert",
    admin: "Admin",
    user: "",
  };
  return labels[role] ?? "";
}

function getDisplayName(user: { firstName?: string | null; email?: string | null }): string {
  if (user.firstName?.trim()) return user.firstName.trim();
  if (user.email) return user.email.split("@")[0];
  return "User";
}

function getAvatarFallback(user: { firstName?: string | null; email?: string | null }): string {
  if (user.firstName?.trim()) return user.firstName.trim()[0].toUpperCase();
  if (user.email) return user.email[0].toUpperCase();
  return "U";
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const { openSignInModal } = useSignInModal();

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="rounded-full px-4"
          onClick={() => openSignInModal()}
          data-testid="button-login"
        >
          Login
        </Button>
        <Button
          className="bg-primary hover:bg-primary/90 text-white rounded-full px-4"
          onClick={() => openSignInModal()}
          data-testid="button-sign-up"
        >
          Sign Up
        </Button>
      </div>
    );
  }

  const role = user.role ?? "user";
  const isExpert = EXPERT_ROLES.includes(role);
  const isProvider = PROVIDER_ROLES.includes(role);
  const isEA = role === "executive_assistant";
  const isAdmin = role === "admin";
  const isUser = !isExpert && !isProvider && !isEA && !isAdmin;

  const roleLabel = getRoleLabel(role);
  const displayName = getDisplayName(user);
  const avatarFallback = getAvatarFallback(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2" data-testid="button-user-menu">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
              {avatarFallback}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start leading-none">
            <span className="text-sm font-medium text-[#6B7280] dark:text-gray-300">
              {displayName}
            </span>
            {roleLabel && (
              <span className="text-[10px] font-semibold text-primary/80 leading-none mt-0.5">
                {roleLabel}
              </span>
            )}
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal pb-1">
          <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
          {user.email && (
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          )}
          {roleLabel && (
            <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
              {roleLabel}
            </span>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* ── Expert roles ── */}
        {isExpert && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/expert/dashboard" className="cursor-pointer" data-testid="link-user-expert-dashboard">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Expert Dashboard
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="cursor-pointer" data-testid="link-user-my-trips">
                <Map className="w-4 h-4 mr-2" />
                My Trips
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/expert/profile" className="cursor-pointer" data-testid="link-user-expert-profile">
                <User className="w-4 h-4 mr-2" />
                Expert Profile
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {/* ── Provider role ── */}
        {isProvider && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/provider/dashboard" className="cursor-pointer" data-testid="link-user-provider-dashboard">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Provider Dashboard
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="cursor-pointer" data-testid="link-user-my-trips">
                <Map className="w-4 h-4 mr-2" />
                My Trips
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/provider/profile" className="cursor-pointer" data-testid="link-user-provider-profile">
                <Briefcase className="w-4 h-4 mr-2" />
                Provider Profile
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {/* ── Executive Assistant role ── */}
        {isEA && (
          <DropdownMenuItem asChild>
            <Link href="/ea/dashboard" className="cursor-pointer" data-testid="link-user-ea-dashboard">
              <CalendarClock className="w-4 h-4 mr-2" />
              EA Dashboard
            </Link>
          </DropdownMenuItem>
        )}

        {/* ── Admin role ── */}
        {isAdmin && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/admin/dashboard" className="cursor-pointer" data-testid="link-user-admin-dashboard">
                <Shield className="w-4 h-4 mr-2" />
                Admin Panel
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="cursor-pointer" data-testid="link-user-my-trips">
                <Map className="w-4 h-4 mr-2" />
                My Trips
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {/* ── Regular traveler ── */}
        {isUser && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="cursor-pointer" data-testid="link-user-my-trips">
                <Map className="w-4 h-4 mr-2" />
                My Trips
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer" data-testid="link-user-profile">
                <User className="w-4 h-4 mr-2" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/expert-status" className="cursor-pointer" data-testid="link-user-expert-status">
                <UserCheck className="w-4 h-4 mr-2" />
                Expert Application
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/provider-status" className="cursor-pointer" data-testid="link-user-provider-status">
                <Building2 className="w-4 h-4 mr-2" />
                Provider Application
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logout()}
          className="text-destructive cursor-pointer"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
