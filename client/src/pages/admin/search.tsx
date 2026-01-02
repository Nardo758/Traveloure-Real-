import { AdminLayout } from "@/components/admin-layout";
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
  ArrowRight
} from "lucide-react";
import { useState } from "react";

const recentSearches = [
  "Sarah Mitchell",
  "Grand Estate Venue",
  "Tokyo wedding",
  "Refund #4521",
];

const quickFilters = [
  { label: "Users", icon: Users, count: 12450 },
  { label: "Experts", icon: UserCheck, count: 156 },
  { label: "Providers", icon: Building2, count: 89 },
  { label: "Plans", icon: ClipboardList, count: 342 },
];

interface SearchResult {
  id: number;
  type: "user" | "expert" | "provider" | "plan";
  name: string;
  description: string;
  meta?: string;
}

const mockResults: SearchResult[] = [
  { id: 1, type: "user", name: "Sarah Mitchell", description: "sarah.m@email.com", meta: "5 trips, $2,450 spent" },
  { id: 2, type: "expert", name: "Sarah Chen", description: "Wedding Planner - Paris, France", meta: "4.9 rating, 127 reviews" },
  { id: 3, type: "provider", name: "Sarah's Catering", description: "Catering Service - Los Angeles, CA", meta: "4.7 rating, 52 bookings" },
  { id: 4, type: "plan", name: "Wedding - Sarah & Mike Johnson", description: "Napa Valley, CA - September 15, 2024", meta: "Budget: $50,000" },
];

const typeColors: Record<string, string> = {
  user: "bg-blue-100 text-blue-700 border-blue-200",
  expert: "bg-purple-100 text-purple-700 border-purple-200",
  provider: "bg-green-100 text-green-700 border-green-200",
  plan: "bg-amber-100 text-amber-700 border-amber-200",
};

export default function AdminSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setResults(mockResults.filter(r => 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase())
      ));
      setHasSearched(true);
    }
  };

  const handleRecentSearch = (term: string) => {
    setSearchQuery(term);
    setResults(mockResults.filter(r => 
      r.name.toLowerCase().includes(term.toLowerCase()) ||
      r.description.toLowerCase().includes(term.toLowerCase())
    ));
    setHasSearched(true);
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
          /* Recent Searches */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-500" />
                Recent Searches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term, index) => (
                  <Button 
                    key={index}
                    variant="outline" 
                    size="sm"
                    onClick={() => handleRecentSearch(term)}
                    data-testid={`button-recent-${index}`}
                  >
                    {term}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
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
