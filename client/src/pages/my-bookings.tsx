import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calendar, 
  MapPin, 
  Clock, 
  DollarSign, 
  FileText, 
  MessageSquare,
  CheckCircle2,
  XCircle,
  Loader2,
  Package
} from "lucide-react";
import { format } from "date-fns";

interface Booking {
  id: string;
  serviceId: string;
  providerId: string;
  contractId: string | null;
  tripId: string | null;
  bookingDetails: {
    scheduledDate?: string;
    notes?: string;
    quantity?: number;
  };
  status: string;
  totalAmount: string;
  platformFee: string;
  providerEarnings: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  confirmed: { label: "Confirmed", variant: "default", icon: CheckCircle2 },
  in_progress: { label: "In Progress", variant: "default", icon: Loader2 },
  completed: { label: "Completed", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: XCircle },
  refunded: { label: "Refunded", variant: "outline", icon: DollarSign },
};

export default function MyBookingsPage() {
  const { user, isLoading: authLoading } = useAuth();

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/my-bookings"],
    enabled: !!user,
  });

  if (authLoading) {
    return (
      <Layout>
        <div className="container py-8 max-w-4xl mx-auto">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="container py-8 max-w-4xl mx-auto text-center">
          <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">My Bookings</h1>
          <p className="text-muted-foreground mb-6">Please sign in to view your bookings</p>
          <Button asChild data-testid="button-sign-in">
            <Link href="/api/login">Sign In</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const pendingBookings = bookings?.filter(b => b.status === "pending") || [];
  const activeBookings = bookings?.filter(b => ["confirmed", "in_progress"].includes(b.status)) || [];
  const completedBookings = bookings?.filter(b => ["completed", "cancelled", "refunded"].includes(b.status)) || [];

  return (
    <Layout>
      <div className="container py-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">My Bookings</h1>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !bookings || bookings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No bookings yet</h2>
              <p className="text-muted-foreground mb-6">Browse our services and make your first booking</p>
              <Button asChild data-testid="button-browse-services">
                <Link href="/discover">Browse Services</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList data-testid="tabs-booking-status">
              <TabsTrigger value="all" data-testid="tab-all">
                All ({bookings.length})
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">
                Pending ({pendingBookings.length})
              </TabsTrigger>
              <TabsTrigger value="active" data-testid="tab-active">
                Active ({activeBookings.length})
              </TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-completed">
                Completed ({completedBookings.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {bookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </TabsContent>

            <TabsContent value="pending" className="space-y-4">
              {pendingBookings.length === 0 ? (
                <EmptyState message="No pending bookings" />
              ) : (
                pendingBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
              )}
            </TabsContent>

            <TabsContent value="active" className="space-y-4">
              {activeBookings.length === 0 ? (
                <EmptyState message="No active bookings" />
              ) : (
                activeBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedBookings.length === 0 ? (
                <EmptyState message="No completed bookings" />
              ) : (
                completedBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  const status = statusConfig[booking.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <Card data-testid={`card-booking-${booking.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={status.variant} data-testid={`badge-status-${booking.id}`}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {status.label}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Booked on {format(new Date(booking.createdAt), "MMM d, yyyy")}
              </span>
            </div>
            
            <div className="text-sm text-muted-foreground space-y-1">
              {booking.bookingDetails?.scheduledDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Scheduled: {format(new Date(booking.bookingDetails.scheduledDate), "PPP")}
                </div>
              )}
              {booking.bookingDetails?.notes && (
                <p className="line-clamp-2">
                  Notes: {booking.bookingDetails.notes}
                </p>
              )}
            </div>
          </div>
          
          <div className="text-right">
            <p className="font-bold text-lg" data-testid={`text-amount-${booking.id}`}>
              ${parseFloat(booking.totalAmount).toFixed(2)}
            </p>
            <div className="flex gap-2 mt-2">
              {booking.contractId && (
                <Button variant="outline" size="sm" asChild data-testid={`button-view-contract-${booking.id}`}>
                  <Link href={`/contracts/${booking.contractId}`}>
                    <FileText className="w-4 h-4 mr-1" />
                    Contract
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild data-testid={`button-message-${booking.id}`}>
                <Link href={`/chat?provider=${booking.providerId}`}>
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Message
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}
