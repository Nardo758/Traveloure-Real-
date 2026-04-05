import { ProviderSidebar } from "./provider-sidebar";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { UserMenu } from "@/components/user-menu";

interface ProviderLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function ProviderLayout({ children, title }: ProviderLayoutProps) {
  return (
    <div className="flex h-screen bg-gray-50">
      <ProviderSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 px-6 bg-white border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900" data-testid="text-page-title">
            {title || "Service Provider Portal"}
          </h1>
          <div className="flex items-center gap-3">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200" data-testid="badge-rating">
              <Star className="w-4 h-4 mr-1 fill-amber-500" /> 4.9 Rating
            </Badge>
            <UserMenu />
          </div>
        </header>
        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
