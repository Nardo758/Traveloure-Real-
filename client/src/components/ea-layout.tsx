import { EASidebar } from "./ea-sidebar";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";

interface EALayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function EALayout({ children, title }: EALayoutProps) {
  return (
    <div className="flex h-screen bg-gray-50">
      <EASidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 px-6 bg-white border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900" data-testid="text-page-title">
            {title || "Executive Assistant Portal"}
          </h1>
          <Badge className="bg-green-100 text-green-700 border-green-200" data-testid="badge-ai-status">
            <Bot className="w-4 h-4 mr-1" /> AI: Active
          </Badge>
        </header>
        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
