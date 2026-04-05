import { AdminLayout } from "@/components/admin/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search as SearchIcon,
  Users,
  UserCheck,
  Building2,
  ClipboardList,
  Clock,
  ArrowRight,
  Loader2
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface SearchResult {
  id: string;
  type: "user" | "expert" | "provider" | "plan";
  name: string;
  description: string;
  meta?: string;
}

const typeColors: Record<string, string> = {
  user: "bg-blue-100 text-blue-700 border-blue-200",
  expert: "bg-purple-100 text-purple-700 border-purple-200",
  provider: "bg-green-100 text-green-700 border-green-200",
  plan: "bg-amber-100 text-amber-700 border-amber-200",
};

export default function AdminSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const { data: searchData, isLoading } = useQuery<{
    results: Array<{ id: string; type: string; name: string; description: string; meta?: string }>;
    counts: { users: number; experts: number; providers: number; plans: number };
  }>({
    queryKey: ["/api/admin/search", { q: searchQuery }],
    enabled: hasSearched && searchQuery.trim().length > 0,
  });

  const results = (searchData?.results ?? []) as SearchResult[];
  const counts = searchData?.counts ?? { users: 0, experts: 0, providers: 0, plans: 0 };

  const quickFilters = [
    { label: "Users", icon: Users, count: counts.users },
    { label: "Experts", icon: UserCheck, count: counts.experts },
    { label: "Providers", icon: Building2, count: counts.providers },
    { label: "Plans", icon: ClipboardList, count: counts.plans },
  ];

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setHasSearched(true);
    }
  };

  return (
    <AdminLayout title="Search">
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Search Box */}
        <Card>
          <CardContent className="p-6">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Search users, experts, providers, plans..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-12 h-12 text-lg"
                  data-testid="input-global-search"
                />
              </div>
              <Button onClick={handleSearch} className="h-12 px-8" data-testid="button-search">
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickFilters.map((filter) => (
            <Button
              key={filter.label}
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              data-testid={`button-filter-${filter.label.toLowerCase()}`}
            >
              <filter.icon className="w-6 h-6" />
              <span>{filter.label}</span>
              <Badge variant="outline">{filter.count.toLocaleString()}</Badge>
            </Button>
          ))}
        </div>

        {!hasSearched ? (
          /* Empty state before searching */
          <Card>
            <CardContent className="p-8 text-center">
              <SearchIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Enter a search term to find users, experts, providers, and plans.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          </div>
        ) : (
          /* Search Results */
          <Card>
            <CardHeader>
              <CardTitle>
                {results.length > 0
                  ? `Found ${results.length} results for "${searchQuery}"`
                  : `No results found for "${searchQuery}"`
                }
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  data-testid={`result-${result.type}-${result.id}`}
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={`text-xs ${
                        result.type === "user" ? "bg-blue-100 text-blue-700" :
                        result.type === "expert" ? "bg-purple-100 text-purple-700" :
                        result.type === "provider" ? "bg-green-100 text-green-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {result.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className={typeColors[result.type]}>{result.type}</Badge>
                        <p className="font-medium text-gray-900">{result.name}</p>
                      </div>
                      <p className="text-sm text-gray-500">{result.description}</p>
                      {result.meta && (
                        <p className="text-xs text-gray-400 mt-1">{result.meta}</p>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </div>
              ))}

              {results.length === 0 && (
                <div className="text-center py-8">
                  <SearchIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No results found. Try a different search term.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
