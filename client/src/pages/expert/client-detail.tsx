import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MessageSquare,
  Calendar,
  User,
  MapPin,
  ArrowRight,
  Mail,
  Phone,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";

interface Client {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  tripTitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: "active" | "planning" | "completed" | "cancelled";
  avatar?: string;
  travelStyle?: string;
  interests?: string[];
  dietary?: string;
  notes?: string;
}

interface Booking {
  id: string;
  date: string;
  service: string;
  amount: string;
  status: string;
}

interface Message {
  id: string;
  sender: "client" | "expert";
  text: string;
  timestamp: string;
}

export default function ExpertClientDetail() {
  const { id } = useParams<{ id: string }>();

  // Mock data - replace with API call in production
  const mockClient: Client = {
    id: id || "1",
    displayName: "Yuki Matsuda",
    email: "yuki.matsuda@example.com",
    phone: "+81-90-1234-5678",
    tripTitle: "Kyoto Cherry Blossom Experience",
    destination: "Kyoto, Japan",
    startDate: "2024-04-01",
    endDate: "2024-04-07",
    status: "active",
    avatar: "YM",
    travelStyle: "Luxury Experiential",
    interests: ["Cultural Heritage", "Culinary Arts", "Photography", "Traditional Crafts"],
    dietary: "Vegetarian",
    notes: "Prefers early morning activities, enjoys authentic local experiences",
  };

  const mockBookings: Booking[] = [
    { id: "1", date: "2024-04-01", service: "Kyoto Temple Tour", amount: "$150", status: "confirmed" },
    { id: "2", date: "2024-04-03", service: "Kaiseki Dinner Experience", amount: "$200", status: "confirmed" },
    { id: "3", date: "2024-04-05", service: "Traditional Tea Ceremony", amount: "$80", status: "confirmed" },
  ];

  const mockMessages: Message[] = [
    { id: "1", sender: "client", text: "Hi! I'm so excited about the Kyoto trip. Do you have any recommendations for early morning activities?", timestamp: "2024-03-28T10:30:00" },
    { id: "2", sender: "expert", text: "Great! Yes, I'd recommend visiting Fushimi Inari Shrine at sunrise. It's magical with fewer crowds.", timestamp: "2024-03-28T11:15:00" },
    { id: "3", sender: "client", text: "That sounds perfect! What about dietary accommodations for vegetarian meals?", timestamp: "2024-03-28T14:00:00" },
    { id: "4", sender: "expert", text: "Kyoto has excellent vegetarian options. I'll arrange authentic Buddhist temple cuisine (shojin ryori) for the kaiseki dinner.", timestamp: "2024-03-28T14:45:00" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";
      case "planning":
        return "bg-blue-100 text-blue-700";
      case "completed":
        return "bg-slate-100 text-slate-600";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <ExpertLayout>
      <div className="p-6 space-y-6">
        {/* Client Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-[#FF385C] text-white text-lg font-semibold">
                {mockClient.avatar}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{mockClient.displayName}</h1>
              <p className="text-lg text-gray-600 mt-1">{mockClient.tripTitle}</p>
              <div className="flex items-center gap-2 mt-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="text-gray-600">{mockClient.destination}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  {new Date(mockClient.startDate).toLocaleDateString()} -{" "}
                  {new Date(mockClient.endDate).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge className={getStatusColor(mockClient.status)}>
                  {mockClient.status.charAt(0).toUpperCase() + mockClient.status.slice(1)}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/chat">
              <Button className="bg-[#FF385C] hover:bg-[#FF385C]/90">
                <MessageSquare className="w-4 h-4 mr-2" /> Message
              </Button>
            </Link>
            <Button variant="outline">
              <Calendar className="w-4 h-4 mr-2" /> View Itinerary
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="itinerary" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          {/* Itinerary Tab */}
          <TabsContent value="itinerary" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Trip Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <p className="font-semibold text-gray-900">Trip Title</p>
                      <p className="text-sm text-gray-600 mt-1">{mockClient.tripTitle}</p>
                    </div>
                  </div>
                  <div className="flex items-start justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div>
                      <p className="font-semibold text-gray-900">Duration</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {Math.ceil(
                          (new Date(mockClient.endDate).getTime() -
                            new Date(mockClient.startDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )}{" "}
                        days
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                    <div>
                      <p className="font-semibold text-gray-900">Planned Activities</p>
                      <p className="text-sm text-gray-600 mt-1">5 activities scheduled</p>
                    </div>
                  </div>
                </div>
                <Button className="w-full bg-[#FF385C] hover:bg-[#FF385C]/90">
                  View Full Itinerary <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Message Thread</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {mockMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === "expert" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-xs rounded-lg p-3 ${
                          message.sender === "expert"
                            ? "bg-[#FF385C] text-white"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        <p className="text-sm">{message.text}</p>
                        <p className={`text-xs mt-1 ${message.sender === "expert" ? "text-red-100" : "text-gray-500"}`}>
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4">
                  <Button className="w-full" variant="outline" data-testid="button-send-message">
                    <MessageSquare className="w-4 h-4 mr-2" /> Send Message
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Trip Bookings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {mockBookings.map((booking) => (
                  <div key={booking.id} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{booking.service}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {new Date(booking.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{booking.amount}</p>
                        <Badge
                          className="mt-2"
                          variant={
                            booking.status === "confirmed"
                              ? "default"
                              : booking.status === "pending"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-6">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-500" />
                    <p className="text-sm text-gray-700">{mockClient.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-500" />
                    <p className="text-sm text-gray-700">{mockClient.phone}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Travel Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Travel Style</p>
                    <p className="text-sm text-gray-900 mt-1">{mockClient.travelStyle}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Interests</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {mockClient.interests?.map((interest) => (
                        <Badge key={interest} variant="outline">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Dietary Restrictions</p>
                    <p className="text-sm text-gray-900 mt-1">{mockClient.dietary}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-600">Special Notes</p>
                    <p className="text-sm text-gray-900 mt-1">{mockClient.notes}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ExpertLayout>
  );
}
