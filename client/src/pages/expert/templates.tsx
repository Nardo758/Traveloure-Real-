import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import type { ExpertTemplate, InsertExpertTemplate } from "@shared/schema";

// Form schema for template creation
const templateFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(255),
  description: z.string().min(10, "Description must be at least 10 characters"),
  shortDescription: z.string().max(500).optional(),
  destination: z.string().min(2, "Destination is required"),
  duration: z.coerce.number().min(1, "Duration must be at least 1 day"),
  price: z.string().regex(/^\d+\.?\d*$/, "Please enter a valid price"),
  category: z.string().optional(),
  highlights: z.string().optional(),
  isPublished: z.boolean().default(false),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

type EarningsSummary = {
  total: number;
  pending: number;
  available: number;
  paidOut: number;
};

export default function ExpertTemplates() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      title: "",
      description: "",
      shortDescription: "",
      destination: "",
      duration: 7,
      price: "",
      category: "adventure",
      highlights: "",
      isPublished: false,
    },
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
    mutationFn: async (data: TemplateFormData) => {
      const payload = {
        ...data,
        highlights: data.highlights?.split(",").map(h => h.trim()).filter(Boolean) || [],
      };
      const res = await apiRequest("POST", "/api/expert/templates", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/templates"] });
      setIsCreateOpen(false);
      form.reset();
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

  const onSubmit = (data: TemplateFormData) => {
    createTemplateMutation.mutate(data);
  };

  const totalEarnings = earningsData?.summary?.total ?? 0;
  const totalSales = salesData?.length ?? 0;
  const publishedCount = templates?.filter(t => t.isPublished)?.length ?? 0;

  const responseTemplates = [
    {
      id: 1,
      name: "Initial Inquiry Response",
      category: "Inquiry",
      content: "Thank you for reaching out! I'd love to help you plan your trip to {destination}.",
      usageCount: 145,
      lastUsed: "2 hours ago",
      aiGenerated: false,
    },
    {
      id: 2,
      name: "Quote Follow-up",
      category: "Sales",
      content: "Hi {client_name}, just wanted to follow up on the quote I sent for your {trip_type}.",
      usageCount: 89,
      lastUsed: "1 day ago",
      aiGenerated: false,
    },
    {
      id: 3,
      name: "Booking Confirmation",
      category: "Confirmation",
      content: "Great news! Your {trip_type} is confirmed for {dates}.",
      usageCount: 67,
      lastUsed: "3 days ago",
      aiGenerated: false,
    },
  ];

  const smartReplySuggestions = [
    {
      context: "Client asks about pricing",
      suggestion: "Based on your requirements for a {duration} trip to {destination}, I typically charge...",
      confidence: 95,
    },
    {
      context: "Client wants to modify dates",
      suggestion: "I can definitely work with the new dates ({new_dates}). Let me check availability...",
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
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Package className="w-5 h-5 text-muted-foreground" />
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
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <FileText className="w-5 h-5 text-muted-foreground" />
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
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., 7-Day Tokyo Adventure"
                                {...field}
                                data-testid="input-template-title"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="destination"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Destination *</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="e.g., Tokyo, Japan"
                                  {...field}
                                  data-testid="input-template-destination"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="duration"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Duration (days) *</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="1"
                                  {...field}
                                  data-testid="input-template-duration"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Price (USD) *</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="49.99"
                                  {...field}
                                  data-testid="input-template-price"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-template-category">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
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
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="shortDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Short Description</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Brief summary shown in listings"
                                {...field}
                                data-testid="input-template-short-desc"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Description *</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Detailed description of what's included in this itinerary..."
                                className="min-h-[100px]"
                                {...field}
                                data-testid="input-template-description"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="highlights"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Highlights (comma-separated)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Hidden temples, Local food tours, Mt. Fuji day trip"
                                {...field}
                                data-testid="input-template-highlights"
                              />
                            </FormControl>
                            <FormDescription>
                              Separate multiple highlights with commas
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isPublished"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-3 pt-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-template-publish"
                              />
                            </FormControl>
                            <FormLabel className="cursor-pointer !mt-0">
                              Publish immediately (make available for purchase)
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          type="submit"
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
                    </form>
                  </Form>
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
                          <Package className="w-3 h-3" /> {template.salesCount ?? 0} sold
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {template.viewCount ?? 0} views
                        </span>
                        {template.averageRating && parseFloat(template.averageRating) > 0 && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Star className="w-3 h-3 fill-current" /> {parseFloat(template.averageRating).toFixed(1)}
                          </span>
                        )}
                      </div>
                      {(template.salesCount ?? 0) > 0 && (
                        <div className="p-2 rounded bg-muted text-sm mb-3">
                          Earned ${(((template.salesCount ?? 0) * parseFloat(template.price)) * 0.8).toFixed(2)} from this template
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
                            <Button size="icon" variant="ghost" data-testid={`button-menu-${template.id}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem data-testid={`menu-edit-${template.id}`}>
                              <Edit2 className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`menu-preview-${template.id}`}>
                              <Eye className="w-4 h-4 mr-2" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                              data-testid={`menu-delete-${template.id}`}
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
                            <Badge variant="secondary">
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
                  <Sparkles className="w-5 h-5 text-primary" />
                  AI Smart Reply System
                </CardTitle>
                <CardDescription>
                  Our AI analyzes your conversations and suggests contextual responses
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-muted">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium">AI Replies Enabled</p>
                      <p className="text-sm text-muted-foreground">You'll see smart suggestions when responding to clients</p>
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
                        <span className="text-xs text-muted-foreground font-medium">
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
