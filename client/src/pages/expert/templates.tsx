import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  MoreVertical,
  MapPin,
  Star,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

type ExpertTemplate = {
  id: string;
  expertId: string;
  title: string;
  description: string;
  shortDescription?: string;
  destination: string;
  duration: number;
  price: string;
  currency?: string;
  category?: string;
  coverImage?: string;
  images?: string[];
  highlights?: string[];
  tags?: string[];
  isPublished: boolean;
  isFeatured: boolean;
  salesCount?: number;
  viewCount?: number;
  averageRating?: string;
  reviewCount?: number;
  createdAt?: string;
};

type EarningsSummary = {
  total: number;
  pending: number;
  available: number;
  paidOut: number;
};

export default function ExpertTemplates() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    title: "",
    description: "",
    shortDescription: "",
    destination: "",
    duration: 7,
    price: "",
    category: "adventure",
    highlights: "",
    isPublished: false,
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<ExpertTemplate[]>({
    queryKey: ["/api/expert/templates"],
  });

  const { data: earningsData } = useQuery<{ summary: EarningsSummary }>({
    queryKey: ["/api/expert/earnings"],
  });

  const { data: salesData } = useQuery<any[]>({
    queryKey: ["/api/expert/template-sales"],
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/expert/templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/templates"] });
      setIsCreateOpen(false);
      setNewTemplate({
        title: "",
        description: "",
        shortDescription: "",
        destination: "",
        duration: 7,
        price: "",
        category: "adventure",
        highlights: "",
        isPublished: false,
      });
      toast({
        title: "Template created!",
        description: "Your itinerary template has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      const res = await apiRequest("PATCH", `/api/expert/templates/${id}`, { isPublished });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/templates"] });
      toast({
        title: "Template updated!",
        description: "Template publish status has been updated.",
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/expert/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/templates"] });
      toast({
        title: "Template deleted",
        description: "Your template has been removed.",
      });
    },
  });

  const handleCreateTemplate = () => {
    if (!newTemplate.title || !newTemplate.destination || !newTemplate.price) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    createTemplateMutation.mutate({
      ...newTemplate,
      highlights: newTemplate.highlights.split(",").map(h => h.trim()).filter(Boolean),
      price: newTemplate.price,
    });
  };

  const totalEarnings = earningsData?.summary?.total || 0;
  const totalSales = salesData?.length || 0;
  const publishedCount = templates?.filter(t => t.isPublished).length || 0;

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
  ];

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Inquiry": return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
      case "Sales": return "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300";
      case "Confirmation": return "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
      default: return "bg-muted text-muted-foreground";
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
            <p className="text-muted-foreground">Save time with reusable templates and earn passive income</p>
          </div>
        </div>

        <Tabs defaultValue="itineraries" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="itineraries" data-testid="tab-itineraries">Itinerary Templates</TabsTrigger>
            <TabsTrigger value="responses" data-testid="tab-responses">Quick Responses</TabsTrigger>
            <TabsTrigger value="ai-replies" data-testid="tab-ai-replies">AI Smart Replies</TabsTrigger>
          </TabsList>

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
                      <p className="text-2xl font-bold text-foreground">${totalEarnings.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border" data-testid="card-template-sales">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                      <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Templates Sold</p>
                      <p className="text-2xl font-bold text-foreground">{totalSales}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border" data-testid="card-template-active">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Published Templates</p>
                      <p className="text-2xl font-bold text-foreground">{publishedCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Your Itinerary Templates</h3>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary" data-testid="button-create-itinerary">
                    <Plus className="w-4 h-4 mr-2" /> Create Itinerary Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Itinerary Template</DialogTitle>
                    <DialogDescription>
                      Create a ready-made travel itinerary that travelers can purchase. You'll earn 80% of the sale price.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Title *</Label>
                      <Input
                        id="title"
                        placeholder="e.g., 7-Day Tokyo Adventure"
                        value={newTemplate.title}
                        onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
                        data-testid="input-template-title"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="destination">Destination *</Label>
                        <Input
                          id="destination"
                          placeholder="e.g., Tokyo, Japan"
                          value={newTemplate.destination}
                          onChange={(e) => setNewTemplate({ ...newTemplate, destination: e.target.value })}
                          data-testid="input-template-destination"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="duration">Duration (days) *</Label>
                        <Input
                          id="duration"
                          type="number"
                          min="1"
                          value={newTemplate.duration}
                          onChange={(e) => setNewTemplate({ ...newTemplate, duration: parseInt(e.target.value) || 1 })}
                          data-testid="input-template-duration"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="price">Price (USD) *</Label>
                        <Input
                          id="price"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="49.99"
                          value={newTemplate.price}
                          onChange={(e) => setNewTemplate({ ...newTemplate, price: e.target.value })}
                          data-testid="input-template-price"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <Select
                          value={newTemplate.category}
                          onValueChange={(value) => setNewTemplate({ ...newTemplate, category: value })}
                        >
                          <SelectTrigger data-testid="select-template-category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="adventure">Adventure</SelectItem>
                            <SelectItem value="cultural">Cultural</SelectItem>
                            <SelectItem value="luxury">Luxury</SelectItem>
                            <SelectItem value="budget">Budget</SelectItem>
                            <SelectItem value="family">Family</SelectItem>
                            <SelectItem value="romantic">Romantic</SelectItem>
                            <SelectItem value="business">Business</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shortDescription">Short Description</Label>
                      <Input
                        id="shortDescription"
                        placeholder="Brief summary shown in listings"
                        value={newTemplate.shortDescription}
                        onChange={(e) => setNewTemplate({ ...newTemplate, shortDescription: e.target.value })}
                        data-testid="input-template-short-desc"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Full Description *</Label>
                      <Textarea
                        id="description"
                        placeholder="Detailed description of what's included in this itinerary..."
                        className="min-h-[100px]"
                        value={newTemplate.description}
                        onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                        data-testid="input-template-description"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="highlights">Highlights (comma-separated)</Label>
                      <Input
                        id="highlights"
                        placeholder="e.g., Hidden temples, Local food tours, Mt. Fuji day trip"
                        value={newTemplate.highlights}
                        onChange={(e) => setNewTemplate({ ...newTemplate, highlights: e.target.value })}
                        data-testid="input-template-highlights"
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <Switch
                        id="publish"
                        checked={newTemplate.isPublished}
                        onCheckedChange={(checked) => setNewTemplate({ ...newTemplate, isPublished: checked })}
                        data-testid="switch-template-publish"
                      />
                      <Label htmlFor="publish" className="cursor-pointer">
                        Publish immediately (make available for purchase)
                      </Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCreateTemplate}
                      disabled={createTemplateMutation.isPending}
                      data-testid="button-save-template"
                    >
                      {createTemplateMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create Template"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {templatesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : templates && templates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="border" data-testid={`itinerary-${template.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{template.title}</p>
                            <Badge variant={template.isPublished ? 'default' : 'outline'}>
                              {template.isPublished ? 'Published' : 'Draft'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3" /> {template.destination}
                          </p>
                        </div>
                        <p className="text-xl font-bold text-primary">${template.price}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {template.duration} days
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" /> {template.salesCount || 0} sold
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {template.viewCount || 0} views
                        </span>
                        {template.averageRating && parseFloat(template.averageRating) > 0 && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Star className="w-3 h-3 fill-current" /> {parseFloat(template.averageRating).toFixed(1)}
                          </span>
                        )}
                      </div>
                      {template.salesCount && template.salesCount > 0 && (
                        <div className="p-2 rounded bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300 mb-3">
                          Earned ${((template.salesCount || 0) * parseFloat(template.price) * 0.8).toFixed(2)} from this template
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1"
                          onClick={() => togglePublishMutation.mutate({ id: template.id, isPublished: !template.isPublished })}
                          data-testid={`button-toggle-${template.id}`}
                        >
                          {template.isPublished ? "Unpublish" : "Publish"}
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
                              <Eye className="w-4 h-4 mr-2" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No itinerary templates yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first itinerary template to start earning passive income from your travel expertise.
                  </p>
                  <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first">
                    <Plus className="w-4 h-4 mr-2" /> Create Your First Template
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

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
                            <Badge variant="outline" className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
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

          <TabsContent value="ai-replies" className="space-y-4">
            <Card className="border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  AI Smart Reply System
                </CardTitle>
                <CardDescription>
                  Our AI analyzes your conversations and suggests contextual responses
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <div>
                      <p className="font-medium text-purple-800 dark:text-purple-200">AI Replies Enabled</p>
                      <p className="text-sm text-purple-700 dark:text-purple-300">You'll see smart suggestions when responding to clients</p>
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
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
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
