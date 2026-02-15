import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Bell, MessageSquare, Calendar, CreditCard, Bot, Check, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? "s" : ""} ago`;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "message": return MessageSquare;
    case "ai": return Bot;
    case "reminder": return Calendar;
    case "credits": return CreditCard;
    default: return Bell;
  }
}

function getNotificationColor(type: string) {
  switch (type) {
    case "message": return "bg-blue-100 text-blue-600";
    case "ai": return "bg-[#FFE3E8] text-[#FF385C]";
    case "reminder": return "bg-green-100 text-green-600";
    case "credits": return "bg-yellow-100 text-yellow-600";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default function Notifications() {
  const { data: notificationsFromApi } = useQuery<Array<{
    id: string; type: string; title: string; message: string; isRead: boolean; createdAt: string;
  }>>({ queryKey: ["/api/notifications"] });

  const [notifications, setNotifications] = useState<Array<{
    id: number;
    type: string;
    title: string;
    description: string;
    time: string;
    read: boolean;
    icon: any;
    color: string;
  }>>([]);

  useEffect(() => {
    if (notificationsFromApi) {
      const mapped = notificationsFromApi.map((n, index) => ({
        id: index + 1,
        type: n.type ?? "message",
        title: n.title,
        description: n.message,
        time: getRelativeTime(n.createdAt),
        read: n.isRead ?? false,
        icon: getNotificationIcon(n.type),
        color: getNotificationColor(n.type),
      }));
      setNotifications(mapped);
    }
  }, [notificationsFromApi]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markAsRead = (id: number) => {
    setNotifications(prev => prev.map(n =>
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const deleteNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#111827] dark:text-white" data-testid="text-page-title">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <Badge className="bg-[#FF385C] text-white" data-testid="badge-unread-count">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              className="text-[#FF385C]"
              onClick={markAllRead}
              data-testid="button-mark-all-read"
            >
              <Check className="w-4 h-4 mr-2" />
              Mark all as read
            </Button>
          )}
        </div>

        {/* Notifications List */}
        {notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((notification, i) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className={`border ${notification.read ? 'border-[#E5E7EB] bg-white dark:bg-gray-800' : 'border-[#FF385C]/20 bg-[#FFF1F3] dark:bg-[#FF385C]/10'}`}
                  data-testid={`notification-${notification.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${notification.color}`}>
                        <notification.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className={`font-medium ${notification.read ? 'text-[#111827] dark:text-white' : 'text-[#111827] dark:text-white font-semibold'}`}>
                              {notification.title}
                            </h3>
                            <p className="text-sm text-[#6B7280] mt-0.5">{notification.description}</p>
                            <p className="text-xs text-[#9CA3AF] mt-1">{notification.time}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {!notification.read && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-[#6B7280] hover:text-[#111827]"
                                onClick={() => markAsRead(notification.id)}
                                data-testid={`button-mark-read-${notification.id}`}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-[#6B7280] hover:text-red-500"
                              onClick={() => deleteNotification(notification.id)}
                              data-testid={`button-delete-${notification.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="border-2 border-dashed border-[#E5E7EB]">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-[#F3F4F6] rounded-full flex items-center justify-center mx-auto mb-4">
                <Bell className="w-8 h-8 text-[#9CA3AF]" />
              </div>
              <h3 className="text-lg font-semibold text-[#111827] dark:text-white mb-2">
                No notifications
              </h3>
              <p className="text-[#6B7280]">
                You're all caught up! Check back later for updates.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
