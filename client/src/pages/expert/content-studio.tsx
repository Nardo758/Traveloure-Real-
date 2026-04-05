import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Plus,
  Edit2,
  Trash2,
  Search,
  Sparkles,
  Clock,
  CheckCircle,
  Send,
  Calendar,
  Image as ImageIcon,
  Video,
  MapPin,
  Star,
  Loader2,
  Instagram,
  Eye,
  Copy,
  BookOpen,
  List,
  Camera,
  MessageSquare,
  Utensils,
  Hotel,
  Plane,
  Heart,
  Share2,
  Hash,
  Link2,
  ExternalLink,
  AlertCircle,
  Globe,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const contentTypes = [
  { id: "travel-guide", label: "Travel Guide", icon: BookOpen, color: "text-blue-500", description: "Comprehensive destination guides" },
  { id: "review", label: "Review", icon: Star, color: "text-amber-500", description: "Hotel, restaurant, experience reviews" },
  { id: "top-list", label: "Top List", icon: List, color: "text-purple-500", description: "Top 10s, best of lists" },
  { id: "photo-gallery", label: "Photo Gallery", icon: Camera, color: "text-pink-500", description: "Curated photo collections" },
  { id: "video-content", label: "Video", icon: Video, color: "text-red-500", description: "Travel vlogs and reels" },
  { id: "itinerary", label: "Itinerary", icon: Calendar, color: "text-green-500", description: "Day-by-day travel plans" },
  { id: "food-guide", label: "Food Guide", icon: Utensils, color: "text-orange-500", description: "Local cuisine recommendations" },
  { id: "hotel-guide", label: "Hotel Guide", icon: Hotel, color: "text-cyan-500", description: "Accommodation recommendations" },
  { id: "tips-tricks", label: "Tips & Tricks", icon: Sparkles, color: "text-violet-500", description: "Travel hacks and advice" },
  { id: "story", label: "Travel Story", icon: Heart, color: "text-rose-500", description: "Personal travel narratives" },
];

const contentFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(255),
  contentType: z.string().min(1, "Select a content type"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  destination: z.string().min(2, "Destination is required"),
  coverImageUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  tags: z.string().optional(),
  instagramCaption: z.string().max(2200, "Instagram captions are limited to 2200 characters").optional(),
  instagramHashtags: z.string().optional(),
  publishToInstagram: z.boolean().default(false),
  status: z.enum(["draft", "published", "scheduled"]).default("draft"),
});

type ContentFormData = z.infer<typeof contentFormSchema>;

type ContentItem = {
  id: number;
  title: string;
  contentType: string;
  description: string;
  destination: string;
  coverImageUrl?: string;
  tags?: string[];
  instagramCaption?: string;
  instagramHashtags?: string;
  status: "draft" | "published" | "scheduled";
  instagramPostId?: string;
  views: number;
  likes: number;
  createdAt: string;
  updatedAt: string;
};

const mockContent: ContentItem[] = [
  {
    id: 1,
    title: "Hidden Gems of Kyoto: A Local's Guide",
    contentType: "travel-guide",
    description: "Discover the secret spots in Kyoto that most tourists miss. From hidden temples to authentic local eateries.",
    destination: "Kyoto, Japan",
    coverImageUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800",
    tags: ["japan", "kyoto", "hidden-gems", "local-guide"],
    status: "published",
    views: 2340,
    likes: 189,
    createdAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-20T14:30:00Z",
  },
  {
    id: 2,
    title: "Top 10 Beach Resorts in Bali",
    contentType: "top-list",
    description: "The ultimate ranking of Bali's best beach resorts for every budget.",
    destination: "Bali, Indonesia",
    coverImageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800",
    tags: ["bali", "resorts", "beach", "luxury"],
    status: "published",
    instagramPostId: "123456789",
    views: 5620,
    likes: 432,
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-18T09:15:00Z",
  },
  {
    id: 3,
    title: "Street Food Tour: Bangkok Edition",
    contentType: "food-guide",
    description: "A comprehensive guide to the best street food in Bangkok's vibrant markets.",
    destination: "Bangkok, Thailand",
    coverImageUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800",
    tags: ["bangkok", "street-food", "thailand", "foodie"],
    status: "draft",
    views: 0,
    likes: 0,
    createdAt: "2026-01-25T16:00:00Z",
    updatedAt: "2026-01-25T16:00:00Z",
  },
];

function generateHashtags(destination: string, contentType: string): string {
  const baseHashtags = ["#travel", "#wanderlust", "#travelgram", "#instatravel", "#traveloure"];
  const locationTags = destination.split(",").map(loc => `#${loc.trim().toLowerCase().replace(/\s+/g, "")}`);
  const typeTags = {
    "travel-guide": ["#travelguide", "#traveltips", "#explore"],
    "review": ["#review", "#honest", "#recommendation"],
    "top-list": ["#top10", "#bestof", "#mustsee"],
    "photo-gallery": ["#photography", "#photooftheday", "#travelphotography"],
    "video-content": ["#reels", "#travelreels", "#video"],
    "itinerary": ["#itinerary", "#tripplanning", "#daytrip"],
    "food-guide": ["#foodie", "#streetfood", "#localfood"],
    "hotel-guide": ["#hotel", "#resort", "#luxury"],
    "tips-tricks": ["#travelhacks", "#tips", "#advice"],
    "story": ["#travelstory", "#adventure", "#memories"],
  };
  return [...baseHashtags, ...locationTags, ...(typeTags[contentType as keyof typeof typeTags] || [])].join(" ");
}

export default function ContentStudio() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  
  const { data: instagramStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/instagram/status"],
  });
  const isInstagramConnected = instagramStatus?.connected ?? false;

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (params.get("instagram") === "connected") {
      queryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] });
      toast({ title: "Instagram Connected!", description: "Your Instagram account is now linked." });
      setLocation("/expert/content-studio", { replace: true });
    }
    if (params.get("error")) {
      toast({ title: "Connection Failed", description: params.get("error") || "Failed to connect Instagram", variant: "destructive" });
      setLocation("/expert/content-studio", { replace: true });
    }
  }, [searchParams, toast, setLocation]);

  const publishToInstagramMutation = useMutation({
    mutationFn: async (data: { imageUrl: string; caption: string }) => {
      return apiRequest("/api/instagram/publish", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
    },
    onSuccess: () => {
      toast({ title: "Published!", description: "Your content is now live on Instagram." });
    },
    onError: (error: any) => {
      toast({ title: "Publish Failed", description: error.message || "Could not publish to Instagram", variant: "destructive" });
    },
  });

  const form = useForm<ContentFormData>({
    resolver: zodResolver(contentFormSchema),
    defaultValues: {
      title: "",
      contentType: "",
      description: "",
      destination: "",
      coverImageUrl: "",
      tags: "",
      instagramCaption: "",
      instagramHashtags: "",
      publishToInstagram: false,
      status: "draft",
    },
  });

  const watchContentType = form.watch("contentType");
  const watchDestination = form.watch("destination");
  const watchPublishToInstagram = form.watch("publishToInstagram");

  const handleGenerateHashtags = () => {
    if (watchDestination && watchContentType) {
      const hashtags = generateHashtags(watchDestination, watchContentType);
      form.setValue("instagramHashtags", hashtags);
      toast({ title: "Hashtags generated!", description: "Auto-generated hashtags based on your content." });
    } else {
      toast({ title: "Missing info", description: "Please fill in destination and content type first.", variant: "destructive" });
    }
  };

  const handleConnectInstagram = async () => {
    const clientId = import.meta.env.VITE_META_APP_ID;
    if (!clientId) {
      toast({ 
        title: "Configuration Required", 
        description: "Instagram integration requires Meta App setup.", 
        variant: "destructive" 
      });
      return;
    }
    
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/instagram/callback`);
    const scope = encodeURIComponent("instagram_business_basic,instagram_business_content_publish");
    const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    
    window.location.href = authUrl;
  };

  const filteredContent = mockContent.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.destination.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || item.status === activeTab || item.contentType === activeTab;
    return matchesSearch && matchesTab;
  });

  const onSubmit = async (data: ContentFormData) => {
    try {
      if (data.publishToInstagram && isInstagramConnected && data.coverImageUrl) {
        const caption = data.instagramCaption 
          ? `${data.instagramCaption}\n\n${data.instagramHashtags}` 
          : `${data.title}\n\n${data.description}\n\n${data.instagramHashtags}`;
        
        publishToInstagramMutation.mutate({
          imageUrl: data.coverImageUrl,
          caption: caption,
        });
      } else {
        toast({ title: "Content created!", description: "Saved as draft." });
      }
      setIsCreateOpen(false);
      form.reset();
    } catch (error) {
      toast({ title: "Error", description: "Failed to create content", variant: "destructive" });
    }
  };

  const getContentTypeInfo = (typeId: string) => {
    return contentTypes.find(t => t.id === typeId) || contentTypes[0];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Published</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Scheduled</Badge>;
      default:
        return <Badge variant="secondary">Draft</Badge>;
    }
  };

  return (
    <ExpertLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-content-studio-title">Content Creator Studio</h1>
            <p className="text-muted-foreground">Create and manage your travel content with Instagram integration</p>
          </div>
          <div className="flex items-center gap-3">
            {isInstagramConnected ? (
              <Badge className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white gap-1.5">
                <Instagram className="w-3.5 h-3.5" />
                Connected
              </Badge>
            ) : (
              <Button 
                variant="outline" 
                onClick={handleConnectInstagram}
                className="gap-2"
                data-testid="button-connect-instagram"
              >
                <Instagram className="w-4 h-4" />
                Connect Instagram
              </Button>
            )}
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-content">
              <Plus className="w-4 h-4 mr-2" />
              Create Content
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Content</p>
                  <p className="text-2xl font-bold">{mockContent.length}</p>
                </div>
                <FileText className="w-8 h-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Published</p>
                  <p className="text-2xl font-bold text-green-600">{mockContent.filter(c => c.status === "published").length}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Views</p>
                  <p className="text-2xl font-bold">{mockContent.reduce((acc, c) => acc + c.views, 0).toLocaleString()}</p>
                </div>
                <Eye className="w-8 h-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Likes</p>
                  <p className="text-2xl font-bold text-rose-600">{mockContent.reduce((acc, c) => acc + c.likes, 0).toLocaleString()}</p>
                </div>
                <Heart className="w-8 h-8 text-rose-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search content..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-content"
            />
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
              <TabsTrigger value="published" data-testid="tab-published">Published</TabsTrigger>
              <TabsTrigger value="draft" data-testid="tab-draft">Drafts</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContent.map((item) => {
            const typeInfo = getContentTypeInfo(item.contentType);
            return (
              <Card key={item.id} className="overflow-hidden hover-elevate cursor-pointer" data-testid={`card-content-${item.id}`}>
                {item.coverImageUrl && (
                  <div className="aspect-video relative overflow-hidden">
                    <img 
                      src={item.coverImageUrl} 
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 flex gap-2">
                      {getStatusBadge(item.status)}
                      {item.instagramPostId && (
                        <Badge className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white">
                          <Instagram className="w-3 h-3" />
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-muted", typeInfo.color)}>
                        <typeInfo.icon className="w-4 h-4" />
                      </div>
                      <Badge variant="outline" className="text-xs">{typeInfo.label}</Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-menu-${item.id}`}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem data-testid={`menu-edit-${item.id}`}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem data-testid={`menu-duplicate-${item.id}`}>
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        {!item.instagramPostId && (
                          <DropdownMenuItem data-testid={`menu-instagram-${item.id}`}>
                            <Instagram className="w-4 h-4 mr-2" />
                            Post to Instagram
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" data-testid={`menu-delete-${item.id}`}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardTitle className="text-lg line-clamp-2">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{item.description}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{item.destination}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        {item.views.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5" />
                        {item.likes.toLocaleString()}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredContent.length === 0 && (
          <Card className="p-12">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No content found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "Try adjusting your search" : "Create your first piece of content to get started"}
              </p>
              <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-content">
                <Plus className="w-4 h-4 mr-2" />
                Create Content
              </Button>
            </div>
          </Card>
        )}

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Content</DialogTitle>
              <DialogDescription>
                Create travel content and optionally publish to Instagram
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="contentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Type</FormLabel>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {contentTypes.map((type) => (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => field.onChange(type.id)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all",
                              field.value === type.id 
                                ? "border-primary bg-primary/5" 
                                : "border-border hover:border-primary/50"
                            )}
                            data-testid={`button-type-${type.id}`}
                          >
                            <type.icon className={cn("w-5 h-5", type.color)} />
                            <span className="text-xs font-medium text-center">{type.label}</span>
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Hidden Gems of Tokyo" {...field} data-testid="input-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="destination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destination</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Tokyo, Japan" {...field} data-testid="input-destination" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe your content..." 
                          rows={4}
                          {...field} 
                          data-testid="textarea-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="coverImageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cover Image URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} data-testid="input-cover-image" />
                      </FormControl>
                      <FormDescription>Enter a URL for your cover image</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input placeholder="japan, travel, adventure (comma separated)" {...field} data-testid="input-tags" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="border rounded-lg p-4 space-y-4 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-orange-500/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Instagram className="w-5 h-5 text-pink-500" />
                      <h3 className="font-semibold">Instagram Publishing</h3>
                    </div>
                    <FormField
                      control={form.control}
                      name="publishToInstagram"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormLabel className="text-sm">Publish to Instagram</FormLabel>
                          <FormControl>
                            <Switch 
                              checked={field.value} 
                              onCheckedChange={field.onChange}
                              data-testid="switch-instagram"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {watchPublishToInstagram && (
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="instagramCaption"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Instagram Caption</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Write your Instagram caption..." 
                                rows={3}
                                {...field} 
                                data-testid="textarea-instagram-caption"
                              />
                            </FormControl>
                            <FormDescription>
                              {field.value?.length || 0}/2200 characters
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="instagramHashtags"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Hashtags</FormLabel>
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm"
                                onClick={handleGenerateHashtags}
                                className="gap-1.5"
                                data-testid="button-generate-hashtags"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                Auto-generate
                              </Button>
                            </div>
                            <FormControl>
                              <Textarea 
                                placeholder="#travel #wanderlust..." 
                                rows={2}
                                {...field} 
                                data-testid="textarea-hashtags"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {!isInstagramConnected && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm">Connect your Instagram account to publish directly</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="button-save-content">
                    {watchPublishToInstagram ? (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Save & Publish
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        Save Draft
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </ExpertLayout>
  );
}
