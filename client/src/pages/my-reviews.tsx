import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Star, Pencil, Trash2, ChevronRight, MessageSquare, EyeOff } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type MyReview = {
  id: string;
  serviceId: string;
  bookingId: string;
  rating: number;
  reviewText: string | null;
  responseText: string | null;
  responseAt: string | null;
  isVerified: boolean;
  isHidden: boolean;
  hiddenReason: string | null;
  createdAt: string;
  serviceName: string | null;
};

function StarRow({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={i < rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}
        />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <span className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <button
          key={i}
          type="button"
          data-testid={`star-picker-${i + 1}`}
          className="p-0.5 rounded transition-transform hover:scale-110"
          onMouseEnter={() => setHovered(i + 1)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(i + 1)}
        >
          <Star
            size={20}
            className={i < (hovered || value) ? "fill-amber-400 text-amber-400" : "text-gray-300"}
          />
        </button>
      ))}
    </span>
  );
}

function ReviewCard({ review, onDeleted }: { review: MyReview; onDeleted: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editRating, setEditRating] = useState(review.rating);
  const [editText, setEditText] = useState(review.reviewText ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: { rating: number; reviewText: string }) =>
      apiRequest("PATCH", `/api/services/${review.serviceId}/reviews/${review.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-reviews"] });
      setEditing(false);
      toast({ title: "Review updated" });
    },
    onError: () => toast({ title: "Failed to update review", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/services/${review.serviceId}/reviews/${review.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-reviews"] });
      onDeleted();
      toast({ title: "Review deleted" });
    },
    onError: () => toast({ title: "Failed to delete review", variant: "destructive" }),
  });

  return (
    <Card data-testid={`review-card-${review.id}`} className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/services/${review.serviceId}`}
                className="font-semibold text-gray-900 hover:text-[#FF385C] truncate transition-colors text-sm"
                data-testid={`review-service-link-${review.id}`}
              >
                {review.serviceName ?? "Service"}
              </Link>
              {review.isVerified && (
                <Badge variant="secondary" className="text-xs shrink-0">Verified</Badge>
              )}
              {review.isHidden && (
                <Badge variant="outline" className="text-xs text-gray-500 border-gray-300 shrink-0 gap-1">
                  <EyeOff size={10} /> Hidden by admin
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(review.createdAt).toLocaleDateString("en-US", {
                year: "numeric", month: "short", day: "numeric",
              })}
            </p>
          </div>

          {!editing && !review.isHidden && (
            <div className="flex gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-gray-400 hover:text-gray-700"
                data-testid={`edit-review-${review.id}`}
                onClick={() => {
                  setEditRating(review.rating);
                  setEditText(review.reviewText ?? "");
                  setEditing(true);
                }}
              >
                <Pencil size={13} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-gray-400 hover:text-red-500"
                data-testid={`delete-review-${review.id}`}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {editing ? (
            <div className="space-y-3">
              <StarPicker value={editRating} onChange={setEditRating} />
              <Textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                placeholder="Update your review…"
                className="resize-none text-sm"
                rows={3}
                data-testid={`edit-review-textarea-${review.id}`}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-[#FF385C] hover:bg-[#e0334f] text-white"
                  disabled={updateMutation.isPending}
                  data-testid={`save-review-${review.id}`}
                  onClick={() => updateMutation.mutate({ rating: editRating, reviewText: editText })}
                >
                  {updateMutation.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  data-testid={`cancel-edit-review-${review.id}`}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <StarRow rating={review.rating} />
              {review.reviewText && (
                <p className="text-sm text-gray-700 leading-relaxed">{review.reviewText}</p>
              )}
              {review.isHidden && review.hiddenReason && (
                <p className="text-xs text-gray-400 italic">Admin note: {review.hiddenReason}</p>
              )}
            </>
          )}

          {/* Provider response */}
          {review.responseText && !editing && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageSquare size={12} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500">Provider response</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{review.responseText}</p>
            </div>
          )}
        </div>

        {/* Footer link */}
        {!editing && (
          <div className="px-4 pb-3">
            <Link
              href={`/services/${review.serviceId}`}
              className="inline-flex items-center gap-1 text-xs text-[#FF385C] hover:underline"
              data-testid={`view-service-${review.id}`}
            >
              View service <ChevronRight size={11} />
            </Link>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove your review of{" "}
              <strong>{review.serviceName ?? "this service"}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-review">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
              data-testid="confirm-delete-review"
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function MyReviews() {
  const { data: reviews, isLoading } = useQuery<MyReview[]>({
    queryKey: ["/api/my-reviews"],
  });

  const [deletedCount, setDeletedCount] = useState(0);

  const visibleReviews = reviews ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" data-testid="my-reviews-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Reviews</h1>
        <p className="text-sm text-gray-500 mt-1">
          All reviews you've submitted across your bookings.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && visibleReviews.length === 0 && (
        <div className="text-center py-16 text-gray-400" data-testid="my-reviews-empty">
          <Star size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium text-gray-500">No reviews yet</p>
          <p className="text-sm mt-1">
            After completing a booking, you can leave a review on the service page.
          </p>
          <Link href="/bookings">
            <Button variant="outline" className="mt-5" data-testid="go-to-bookings">
              View my bookings
            </Button>
          </Link>
        </div>
      )}

      {!isLoading && visibleReviews.length > 0 && (
        <>
          <p className="text-sm text-gray-500 mb-4" data-testid="reviews-count">
            {visibleReviews.length} review{visibleReviews.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-4">
            {visibleReviews.map(review => (
              <ReviewCard
                key={review.id}
                review={review}
                onDeleted={() => setDeletedCount(c => c + 1)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
