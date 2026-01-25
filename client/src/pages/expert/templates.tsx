import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  FileText, 
  MessageSquare,
  Copy,
  Plus,
  Edit2,
  Trash2,
  Search,
  Sparkles,
  Clock,
  CheckCircle,
  Send,
  Calendar,
  Package,
  DollarSign,
  Eye,
  MoreVertical
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ExpertTemplates() {
  const responseTemplates = [
    {
      id: 1,
      name: "Initial Inquiry Response",
      category: "Inquiry",
      content: "Thank you for reaching out! I'd love to help you plan your trip to {destination}. To create the perfect itinerary, could you tell me more about...",
      usageCount: 145,
      lastUsed: "2 hours ago",
      aiGenerated: false,
    },
    {
      id: 2,
      name: "Quote Follow-up",
      category: "Sales",
      content: "Hi {client_name}, just wanted to follow up on the quote I sent for your {trip_type}. Do you have any questions about the itinerary or pricing?",
      usageCount: 89,
      lastUsed: "1 day ago",
      aiGenerated: false,
    },
    {
      id: 3,
      name: "Booking Confirmation",
      category: "Confirmation",
      content: "Great news! Your {trip_type} is confirmed for {dates}. I've attached all the details including your personalized itinerary...",
      usageCount: 67,
      lastUsed: "3 days ago",
      aiGenerated: false,
    },
    {
      id: 4,
      name: "Pre-Trip Reminder",
      category: "Reminder",
      content: "Your adventure starts in {days_until} days! Here's a quick checklist to make sure you're all set...",
      usageCount: 52,
      lastUsed: "5 days ago",
      aiGenerated: true,
    },
    {
      id: 5,
      name: "Post-Trip Thank You",
      category: "Follow-up",
      content: "Welcome back! I hope your {trip_type} was everything you dreamed of. I'd love to hear about your experience...",
      usageCount: 38,
      lastUsed: "1 week ago",
      aiGenerated: true,
    },
  ];

  const itineraryTemplates = [
    {
      id: 1,
      name: "7-Day Tokyo Explorer",
      destination: "Tokyo, Japan",
      duration: "7 days",
      price: 49,
      sales: 23,
      revenue: 1127,
      rating: 4.9,
      status: "published",
    },
    {
      id: 2,
      name: "Romantic Kyoto Getaway",
      destination: "Kyoto, Japan",
      duration: "5 days",
      price: 39,
      sales: 18,
      revenue: 702,
      rating: 5.0,
      status: "published",
    },
    {
      id: 3,
      name: "Japan Golden Route",
      destination: "Tokyo-Kyoto-Osaka",
      duration: "10 days",
      price: 79,
      sales: 12,
      revenue: 948,
      rating: 4.8,
      status: "published",
    },
    {
      id: 4,
      name: "Cherry Blossom Special",
      destination: "Various Japan",
      duration: "8 days",
      price: 59,
      sales: 0,
      revenue: 0,
      rating: null,
      status: "draft",
    },
  ];

  const smartReplySuggestions = [
    {
      context: "Client asks about pricing",
      suggestion: "Based on your requirements for a {duration} trip to {destination}, I typically charge ${price_range}. This includes...",
      confidence: 95,
    },
    {
      context: "Client wants to modify dates",
      suggestion: "I can definitely work with the new dates ({new_dates}). Let me check availability and update your itinerary...",
      confidence: 92,
    },
    {
      context: "Client has dietary restrictions",
      suggestion: "Great, I'll make sure all restaurant recommendations accommodate your {restriction} diet. I have several favorites that...",
      confidence: 88,
    },
  ];

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Inquiry": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Sales": return "bg-green-100 text-green-700 border-green-200";
      case "Confirmation": return "bg-purple-100 text-purple-700 border-purple-200";
      case "Reminder": return "bg-amber-100 text-amber-700 border-amber-200";
      case "Follow-up": return "bg-pink-100 text-pink-700 border-pink-200";
      default: return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <ExpertLayout title="Templates">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-templates-title">
              Templates & Quick Responses
            </h1>
            <p className="text-muted-foreground">Save time with reusable templates and AI-powered responses</p>
          </div>
          <Button className="bg-primary" data-testid="button-create-template">
            <Plus className="w-4 h-4 mr-2" /> Create Template
          </Button>
        </div>

        <Tabs defaultValue="responses" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="responses" data-testid="tab-responses">Quick Responses</TabsTrigger>
            <TabsTrigger value="itineraries" data-testid="tab-itineraries">Itinerary Templates</TabsTrigger>
            <TabsTrigger value="ai-replies" data-testid="tab-ai-replies">AI Smart Replies</TabsTrigger>
          </TabsList>

          <TabsContent value="responses" className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search templates..." 
                  className="pl-10"
                  data-testid="input-search-templates"
                />
              </div>
              <Button variant="outline" data-testid="button-ai-generate">
                <Sparkles className="w-4 h-4 mr-2" /> Generate with AI
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {responseTemplates.map((template) => (
                <Card key={template.id} className="border" data-testid={`template-${template.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium text-foreground">{template.name}</p>
                          <Badge variant="outline" className={getCategoryColor(template.category)}>
                            {template.category}
                          </Badge>
                          {template.aiGenerated && (
                            <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200">
                              <Sparkles className="w-3 h-3 mr-1" /> AI Generated
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{template.content}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Copy className="w-3 h-3" /> Used {template.usageCount} times
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Last used {template.lastUsed}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" data-testid={`button-use-${template.id}`}>
                          <Send className="w-3 h-3 mr-1" /> Use
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Edit2 className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Copy className="w-4 h-4 mr-2" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="itineraries" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card className="border bg-primary/5 border-primary/20" data-testid="card-template-earnings">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Earnings</p>
                      <p className="text-2xl font-bold text-foreground">$2,777</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border" data-testid="card-template-sales">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <Package className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Templates Sold</p>
                      <p className="text-2xl font-bold text-foreground">53</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border" data-testid="card-template-active">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Active Templates</p>
                      <p className="text-2xl font-bold text-foreground">3</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Your Itinerary Templates</h3>
              <Button className="bg-primary" data-testid="button-create-itinerary">
                <Plus className="w-4 h-4 mr-2" /> Create Itinerary Template
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {itineraryTemplates.map((template) => (
                <Card key={template.id} className="border" data-testid={`itinerary-${template.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{template.name}</p>
                          <Badge variant={template.status === 'published' ? 'default' : 'outline'}>
                            {template.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{template.destination}</p>
                      </div>
                      <p className="text-xl font-bold text-primary">${template.price}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {template.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" /> {template.sales} sold
                      </span>
                      {template.rating && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <CheckCircle className="w-3 h-3" /> {template.rating}
                        </span>
                      )}
                    </div>
                    {template.status === 'published' && (
                      <div className="p-2 rounded bg-green-50 border border-green-200 text-sm text-green-700">
                        Earned ${template.revenue} from this template
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <Button size="sm" variant="outline" className="flex-1" data-testid={`button-edit-${template.id}`}>
                        <Edit2 className="w-3 h-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" data-testid={`button-preview-${template.id}`}>
                        <Eye className="w-3 h-3 mr-1" /> Preview
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ai-replies" className="space-y-4">
            <Card className="border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  AI Smart Reply System
                </CardTitle>
                <CardDescription>
                  Our AI analyzes your conversations and suggests contextual responses with 95%+ approval rate
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="font-medium text-purple-800">AI Replies Enabled</p>
                      <p className="text-sm text-purple-700">You'll see smart suggestions when responding to clients</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-purple-700">247</p>
                      <p className="text-xs text-purple-600">AI Suggestions Used</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-purple-700">95%</p>
                      <p className="text-xs text-purple-600">Approval Rate</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-purple-700">2.5 hrs</p>
                      <p className="text-xs text-purple-600">Time Saved/Week</p>
                    </div>
                  </div>
                </div>

                <h4 className="font-medium text-foreground mt-6">Recent AI Suggestions</h4>
                <div className="space-y-3">
                  {smartReplySuggestions.map((suggestion, index) => (
                    <div key={index} className="p-4 rounded-lg border" data-testid={`ai-suggestion-${index}`}>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="bg-muted">
                          {suggestion.context}
                        </Badge>
                        <span className="text-xs text-green-600 font-medium">
                          {suggestion.confidence}% confidence
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{suggestion.suggestion}</p>
                    </div>
                  ))}
                </div>

                <Button variant="outline" className="w-full mt-4" data-testid="button-train-ai">
                  <Sparkles className="w-4 h-4 mr-2" /> Train AI on Your Style
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ExpertLayout>
  );
}
