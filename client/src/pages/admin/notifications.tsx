import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  Info,
  UserPlus,
  DollarSign,
  MessageSquare,
  Settings,
  Trash2,
  Loader2
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "alert";
  category: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

const typeIcons: Record<string, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  alert: AlertTriangle,
};

const typeColors: Record<string, string> = {
  info: "bg-blue-100 text-blue-600",
  success: "bg-green-100 text-green-600",
  warning: "bg-amber-100 text-amber-600",
  alert: "bg-red-100 text-red-600",
};

export default function AdminNotifications() {
  const { data: notificationsData, isLoading } = useQuery<Array<{
    id: string; type: string; category: string; title: string; message: string; time: string; read: boolean;
  }>>({ queryKey: ["/api/admin/notifications"] });

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    if (notificationsData) {
      setNotifications(notificationsData as Notification[]);
    }
  }, [notificationsData]);

  if (isLoading) {
    return (
      <AdminLayout title="Notifications">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      </AdminLayout>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  const filteredNotifications = filter
    ? notifications.filter(n => n.type === filter)
    : notifications;

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  return (
    <AdminLayout title="Notifications">
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-gray-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
              <p className="text-gray-600">{unreadCount} unread notifications</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={markAllAsRead} data-testid="button-mark-all-read">
              Mark All as Read
            </Button>
            <Button variant="ghost" size="icon" data-testid="button-notification-settings">
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={filter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(null)}
            data-testid="button-filter-all"
          >
            All ({notifications.length})
          </Button>
          <Button
            variant={filter === "warning" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("warning")}
            data-testid="button-filter-warnings"
          >
            <AlertTriangle className="w-4 h-4 mr-1" /> Warnings
          </Button>
          <Button
            variant={filter === "info" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("info")}
            data-testid="button-filter-info"
          >
            <Info className="w-4 h-4 mr-1" /> Info
          </Button>
          <Button
            variant={filter === "success" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("success")}
            data-testid="button-filter-success"
          >
            <CheckCircle className="w-4 h-4 mr-1" /> Success
          </Button>
        </div>

        {/* Notifications List */}
        <Card>
          <CardContent className="p-0">
            {filteredNotifications.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {filteredNotifications.map((notification) => {
                  const Icon = typeIcons[notification.type];
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 flex items-start gap-4 ${!notification.read ? "bg-blue-50/50" : ""}`}
                      data-testid={`notification-${notification.id}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${typeColors[notification.type]}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{notification.category}</Badge>
                          <p className="font-medium text-gray-900">{notification.title}</p>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{notification.time}</p>
                      </div>
                      <div className="flex gap-1">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(notification.id)}
                            data-testid={`button-mark-read-${notification.id}`}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteNotification(notification.id)}
                          data-testid={`button-delete-${notification.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No notifications to show</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
