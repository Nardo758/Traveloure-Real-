import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  ChevronDown, 
  Map, 
  CreditCard, 
  UserCheck, 
  Building2, 
  LogOut 
} from "lucide-react";

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <a href="/api/login">
          <Button variant="outline" className="rounded-full px-4" data-testid="button-login">
            Login
          </Button>
        </a>
        <a href="/api/login">
          <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-4" data-testid="button-sign-up">
            Sign Up
          </Button>
        </a>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2" data-testid="button-user-menu">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || "User"} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
              {user.firstName?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-[#6B7280] dark:text-gray-300">
            {user.firstName}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="cursor-pointer" data-testid="link-user-my-trips">
            <Map className="w-4 h-4 mr-2" />
            My Trips
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/credits" className="cursor-pointer" data-testid="link-user-credits">
            <CreditCard className="w-4 h-4 mr-2" />
            Credits & Billing
          </Link>
        </DropdownMenuItem>
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
