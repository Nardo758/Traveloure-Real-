import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Bell, 
  Check, 
  CheckCheck, 
  ShoppingCart, 
  MessageSquare, 
  Star,
  FileText,
  X
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedId: string | null;
  relatedType: string | null;
  isRead: boolean;
  createdAt: string;
}

const typeIcons: Record<string, typeof Bell> = {
  booking_created: ShoppingCart,
  booking_confirmed: Check,
  booking_completed: CheckCheck,
  message_received: MessageSquare,
  review_received: Star,
  contract_created: FileText,
};

export function NotificationBell() {
  const { user } = useAuth();

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!user,
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  if (!user) return null;

  const count = unreadCount?.count || 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span 
              className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {count > 0 && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        
        <ScrollArea className="h-80">
          {!notifications || notifications.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <NotificationItem 
                  key={notification.id} 
                  notification={notification}
                  onMarkAsRead={() => markAsReadMutation.mutate(notification.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({ 
  notification, 
  onMarkAsRead 
}: { 
  notification: Notification;
  onMarkAsRead: () => void;
}) {
  const Icon = typeIcons[notification.type] || Bell;

  return (
    <div 
      className={`p-3 border-b last:border-0 hover-elevate cursor-pointer ${
        !notification.isRead ? "bg-primary/5" : ""
      }`}
      onClick={() => {
        if (!notification.isRead) {
          onMarkAsRead();
        }
      }}
      data-testid={`notification-${notification.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          !notification.isRead ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${!notification.isRead ? "font-medium" : ""}`}>
            {notification.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>
        {!notification.isRead && (
          <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
        )}
      </div>
    </div>
  );
}
