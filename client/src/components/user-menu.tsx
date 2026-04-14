import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { useSignInModal } from "@/contexts/SignInModalContext";

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

  return (
    <div className="flex items-center gap-1">
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
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => logout()}
            className="text-destructive cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/*
        This logout button is always in the DOM (never portaled/unmounted).
        Required for test automation since Radix DropdownMenuContent is
        removed from the DOM when the dropdown is closed.
      */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => logout()}
        className="text-muted-foreground hover:text-destructive gap-1.5 hidden lg:flex"
        data-testid="button-logout"
        aria-label="Logout"
      >
        <LogOut className="h-4 w-4" />
        <span className="sr-only lg:not-sr-only text-xs">Logout</span>
      </Button>
    </div>
  );
}
