import { AdminSidebar } from "./admin-sidebar";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";
import { UserMenu } from "@/components/user-menu";

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AdminLayout({ children, title }: AdminLayoutProps) {
  return (
    <div className="flex h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 px-6 bg-white border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900" data-testid="text-page-title">
            {title || "Admin Panel"}
          </h1>
          <div className="flex items-center gap-3">
            <Badge className="bg-green-100 text-green-700 border-green-200" data-testid="badge-system-status">
              <CheckCircle className="w-4 h-4 mr-1" /> All Systems Operational
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
