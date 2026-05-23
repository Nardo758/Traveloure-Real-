import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProviderLayout } from "@/components/provider/provider-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, MessageSquare, TrendingUp, CheckCircle, ChevronDown, ChevronUp, Eye, EyeOff, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ReviewItem {
  id: string;
  serviceId: string;
  travelerId: string;
  rating: number;
  reviewText: string | null;
  responseText: string | null;
  isHidden: boolean;
  createdAt: string;
  serviceName: string | null;
  travelerFirstName: string | null;
  travelerLastName: string | null;
}

interface ReviewsData {
  reviews: ReviewItem[];
  unansweredCount: number;
  avgRating: number;
  total: number;
}

function StarRow({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const px = size === "md" ? "w-5 h-5" : "w-4 h-4";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`${px} ${n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
}

function RatingBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-3 text-right text-gray-600">{stars}</span>
      <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-gray-500">{count}</span>
    </div>
  );
}

function ReviewCard({ review, onRespond }: { review: ReviewItem; onRespond: (id: string, text: string, serviceId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(review.responseText || "");
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();

  const travelerName = [review.travelerFirstName, review.travelerLastName].filter(Boolean).join(" ") || "Anonymous Traveler";
  const initials = travelerName === "Anonymous Traveler" ? "AT" : travelerName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const isAnswered = Boolean(review.responseText);

  const handleSubmit = () => {
    if (!draft.trim()) {
      toast({ title: "Response required", description: "Please write a response before submitting.", variant: "destructive" });
      return;
    }
    onRespond(review.id, draft.trim(), review.serviceId);
    setEditing(false);
  };

  return (
    <Card
      className={`border transition-colors ${review.isHidden ? "opacity-60 bg-gray-50" : ""}`}
      data-testid={`card-review-${review.id}`}
    >
      <CardContent className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-[#FF385C]/10 text-[#FF385C] flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {initials}
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm" data-testid={`text-traveler-${review.id}`}>{travelerName}</p>
              <p className="text-xs text-gray-500">
                {review.serviceName && (
                  <span className="text-gray-600 font-medium">{review.serviceName} · </span>
                )}
                {new Date(review.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {review.isHidden && <Badge variant="secondary" className="text-xs gap-1"><EyeOff className="w-3 h-3" />Hidden</Badge>}
            {isAnswered
              ? <Badge variant="outline" className="text-xs gap-1 border-emerald-300 text-emerald-700 bg-emerald-50"><CheckCircle className="w-3 h-3" />Responded</Badge>
              : <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 bg-amber-50"><MessageSquare className="w-3 h-3" />Awaiting reply</Badge>
            }
          </div>
        </div>

        <StarRow rating={review.rating} />

        {review.reviewText && (
          <p className="mt-2 text-sm text-gray-700 leading-relaxed">{review.reviewText}</p>
        )}

        {/* Response section */}
        {(isAnswered || editing) && (
          <div className="mt-4 pl-4 border-l-2 border-[#FF385C]/30">
            {editing ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Response</p>
                <Textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder="Write a thoughtful, professional response..."
                  className="text-sm resize-none"
                  rows={4}
                  data-testid={`textarea-response-${review.id}`}
                  maxLength={1000}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{draft.length}/1000</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(review.responseText || ""); }} data-testid={`button-cancel-response-${review.id}`}>Cancel</Button>
                    <Button size="sm" onClick={handleSubmit} className="bg-[#FF385C] hover:bg-[#e0314f] text-white" data-testid={`button-submit-response-${review.id}`}>Post Response</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Your Response</p>
                <p className="text-sm text-gray-700">{review.responseText}</p>
                <button
                  className="mt-1 text-xs text-[#FF385C] hover:underline"
                  onClick={() => setEditing(true)}
                  data-testid={`button-edit-response-${review.id}`}
                >
                  Edit response
                </button>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!editing && (
          <div className="mt-3 flex items-center gap-2">
            {!isAnswered && !review.isHidden && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={() => setEditing(true)}
                data-testid={`button-reply-${review.id}`}
              >
                <MessageSquare className="w-3 h-3" />
                Reply
              </Button>
            )}
            <button
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 ml-auto"
              onClick={() => setExpanded(v => !v)}
              data-testid={`button-expand-${review.id}`}
            >
              {expanded ? <><ChevronUp className="w-3 h-3" />Less</> : <><ChevronDown className="w-3 h-3" />Details</>}
            </button>
          </div>
        )}

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-1">
            <p>Review ID: {review.id}</p>
            <p>Service ID: {review.serviceId}</p>
            <p>Submitted: {new Date(review.createdAt).toLocaleString()}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProviderReviews() {
  const { toast } = useToast();
  const [filterRating, setFilterRating] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterService, setFilterService] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  const { data, isLoading } = useQuery<ReviewsData>({
    queryKey: ["/api/provider/reviews"],
  });

  const respondMutation = useMutation({
    mutationFn: async ({ reviewId, responseText, serviceId }: { reviewId: string; responseText: string; serviceId: string }) => {
      return apiRequest("PATCH", `/api/services/${serviceId}/reviews/${reviewId}/respond`, { responseText });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/reviews"] });
      toast({ title: "Response posted", description: "Your response is now visible to travelers." });
    },
    onError: () => {
      toast({ title: "Failed to post response", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleRespond = (id: string, text: string, serviceId: string) => {
    respondMutation.mutate({ reviewId: id, responseText: text, serviceId });
  };

  const reviews = data?.reviews ?? [];

  // Unique service names for filter
  const serviceNames = Array.from(new Set(reviews.map(r => r.serviceName).filter(Boolean))) as string[];

  // Filter + sort
  const filtered = reviews
    .filter(r => filterRating === "all" || r.rating === Number(filterRating))
    .filter(r => {
      if (filterStatus === "unanswered") return !r.responseText && !r.isHidden;
      if (filterStatus === "answered") return Boolean(r.responseText);
      if (filterStatus === "hidden") return r.isHidden;
      return true;
    })
    .filter(r => filterService === "all" || r.serviceName === filterService)
    .sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "highest") return b.rating - a.rating;
      if (sortBy === "lowest") return a.rating - b.rating;
      return 0;
    });

  // Rating distribution
  const ratingDist = [5, 4, 3, 2, 1].map(s => ({
    stars: s,
    count: reviews.filter(r => r.rating === s).length,
  }));

  const stats = [
    {
      label: "Total Reviews",
      value: isLoading ? "—" : String(data?.total ?? 0),
      icon: Star,
      color: "text-amber-500",
      bg: "bg-amber-50",
    },
    {
      label: "Average Rating",
      value: isLoading ? "—" : String(data?.avgRating ?? "0.0"),
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      suffix: "/ 5",
    },
    {
      label: "Awaiting Reply",
      value: isLoading ? "—" : String(data?.unansweredCount ?? 0),
      icon: MessageSquare,
      color: "text-[#FF385C]",
      bg: "bg-rose-50",
    },
    {
      label: "Response Rate",
      value: isLoading ? "—" : (data?.total
        ? `${Math.round(((data.total - (data.unansweredCount ?? 0)) / data.total) * 100)}%`
        : "—"),
      icon: CheckCircle,
      color: "text-sky-600",
      bg: "bg-sky-50",
    },
  ];

  return (
    <ProviderLayout title="Reviews">
      <div className="p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reviews Received</h1>
          <p className="text-gray-500 text-sm mt-1">See what travelers say about your services and respond to build trust.</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => (
            <Card key={stat.label} className="border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  {isLoading
                    ? <Skeleton className="h-6 w-12 mb-1" />
                    : <p className="text-xl font-bold text-gray-900" data-testid={`stat-${stat.label.toLowerCase().replace(/ /g, "-")}`}>
                        {stat.value}{stat.suffix && <span className="text-sm font-normal text-gray-400 ml-1">{stat.suffix}</span>}
                      </p>
                  }
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Rating breakdown */}
          <Card className="border lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rating Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)
                : ratingDist.map(d => (
                    <RatingBar key={d.stars} stars={d.stars} count={d.count} total={data?.total ?? 0} />
                  ))
              }
            </CardContent>
          </Card>

          {/* Filters + list */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filter bar */}
            <div className="flex flex-wrap gap-2 items-center" data-testid="filter-bar">
              <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <Select value={filterRating} onValueChange={setFilterRating}>
                <SelectTrigger className="h-8 text-xs w-28" data-testid="select-filter-rating">
                  <SelectValue placeholder="All ratings" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ratings</SelectItem>
                  {[5, 4, 3, 2, 1].map(s => <SelectItem key={s} value={String(s)}>{s} stars</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs w-32" data-testid="select-filter-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="unanswered">Needs reply</SelectItem>
                  <SelectItem value="answered">Responded</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
              {serviceNames.length > 1 && (
                <Select value={filterService} onValueChange={setFilterService}>
                  <SelectTrigger className="h-8 text-xs w-36" data-testid="select-filter-service">
                    <SelectValue placeholder="All services" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All services</SelectItem>
                    {serviceNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-8 text-xs w-28 ml-auto" data-testid="select-sort">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="highest">Highest rated</SelectItem>
                  <SelectItem value="lowest">Lowest rated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Review list */}
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 border rounded-xl bg-gray-50" data-testid="no-reviews-empty-state">
                <Star className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p className="font-semibold text-gray-700">
                  {reviews.length === 0 ? "No reviews yet" : "No reviews match your filters"}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {reviews.length === 0
                    ? "Reviews from travelers will appear here once they book and rate your services."
                    : "Try adjusting the filters above."}
                </p>
                {reviews.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => { setFilterRating("all"); setFilterStatus("all"); setFilterService("all"); }}
                    data-testid="button-clear-filters"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3" data-testid="reviews-list">
                {filtered.map(r => (
                  <ReviewCard key={r.id} review={r} onRespond={handleRespond} />
                ))}
                <p className="text-xs text-center text-gray-400">{filtered.length} review{filtered.length !== 1 ? "s" : ""}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProviderLayout>
  );
}
