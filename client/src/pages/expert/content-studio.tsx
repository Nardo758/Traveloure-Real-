import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
  Brain,
  Lightbulb,
  TriangleAlert,
  ThumbsUp,
  BadgeDollarSign,
  Landmark,
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

// === Knowledge Nuggets ===
const nuggetTypes = [
  { id: "tip", label: "Tip", icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-50" },
  { id: "warning", label: "Warning", icon: TriangleAlert, color: "text-red-500", bg: "bg-red-50" },
  { id: "recommendation", label: "Recommendation", icon: ThumbsUp, color: "text-green-500", bg: "bg-green-50" },
  { id: "cultural-note", label: "Cultural Note", icon: Landmark, color: "text-purple-500", bg: "bg-purple-50" },
  { id: "hidden-cost", label: "Hidden Cost", icon: BadgeDollarSign, color: "text-orange-500", bg: "bg-orange-50" },
] as const;

const seasons = ["year-round", "spring", "summer", "fall", "winter"] as const;

const nuggetFormSchema = z.object({
  nuggetType: z.enum(["tip", "warning", "recommendation", "cultural-note", "hidden-cost"]).default("tip"),
  city: z.string().min(2, "City is required"),
  linkedPoi: z.string().optional().or(z.literal("")),
  linkedNeighbourhood: z.string().optional().or(z.literal("")),
  insight: z.string().min(10, "Insight must be at least 10 characters"),
  targetAudience: z.string().optional().or(z.literal("")),
  notFor: z.string().optional().or(z.literal("")),
  seasonality: z.array(z.string()).default([]),
});
type NuggetFormData = z.infer<typeof nuggetFormSchema>;

type LocalKnowledgeNugget = {
  id: string;
  expertUserId: string;
  nuggetType: string;
  city: string;
  linkedPoi?: string | null;
  linkedNeighbourhood?: string | null;
  insight: string;
  targetAudience?: string | null;
  notFor?: string | null;
  seasonality?: string[];
  createdAt: string;
  updatedAt: string;
};

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

// §13: the social "Content" library has no backend yet (no content-store endpoint),
// so this is empty rather than seeded with fabricated posts + invented view/like
// counts. The stat cards and grid below now honestly read 0 / show the empty state.
// The real half of this page — Knowledge Nuggets (/api/expert/knowledge-nuggets) —
// is untouched. Filed: a real content-library backend to populate this.
const mockContent: ContentItem[] = [];

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
  const { user } = useAuth();
  const isLocalExpert = user?.role === "local_expert";
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [pageSection, setPageSection] = useState<"content" | "knowledge">("content");
  const [isNuggetDialogOpen, setIsNuggetDialogOpen] = useState(false);
  const [editingNugget, setEditingNugget] = useState<LocalKnowledgeNugget | null>(null);
  const [nuggetSearch, setNuggetSearch] = useState("");

  const { data: instagramStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/instagram/status"],
  });
  const isInstagramConnected = instagramStatus?.connected ?? false;

  const { data: nuggets = [], isLoading: nuggetsLoading } = useQuery<LocalKnowledgeNugget[]>({
    queryKey: ["/api/expert/knowledge-nuggets"],
    enabled: isLocalExpert,
  });

  const nuggetForm = useForm<NuggetFormData>({
    resolver: zodResolver(nuggetFormSchema),
    defaultValues: { nuggetType: "tip", city: "", linkedPoi: "", linkedNeighbourhood: "", insight: "", targetAudience: "", notFor: "", seasonality: [] },
  });

  const createNuggetMutation = useMutation({
    mutationFn: (data: NuggetFormData) => apiRequest("POST", "/api/expert/knowledge-nuggets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/knowledge-nuggets"] });
      toast({ title: "Nugget added!", description: "Your knowledge nugget has been saved." });
      setIsNuggetDialogOpen(false);
      nuggetForm.reset();
    },
    onError: () => toast({ title: "Error", description: "Failed to save nugget", variant: "destructive" }),
  });

  const updateNuggetMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NuggetFormData> }) =>
      apiRequest("PATCH", `/api/expert/knowledge-nuggets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/knowledge-nuggets"] });
      toast({ title: "Nugget updated!" });
      setIsNuggetDialogOpen(false);
      setEditingNugget(null);
      nuggetForm.reset();
    },
    onError: () => toast({ title: "Error", description: "Failed to update nugget", variant: "destructive" }),
  });

  const deleteNuggetMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/expert/knowledge-nuggets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/knowledge-nuggets"] });
      toast({ title: "Nugget deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete nugget", variant: "destructive" }),
  });

  const openEditNugget = (nugget: LocalKnowledgeNugget) => {
    setEditingNugget(nugget);
    nuggetForm.reset({
      nuggetType: nugget.nuggetType as any,
      city: nugget.city,
      linkedPoi: nugget.linkedPoi || "",
      linkedNeighbourhood: nugget.linkedNeighbourhood || "",
      insight: nugget.insight,
      targetAudience: nugget.targetAudience || "",
      notFor: nugget.notFor || "",
      seasonality: nugget.seasonality || [],
    });
    setIsNuggetDialogOpen(true);
  };

  const onNuggetSubmit = (data: NuggetFormData) => {
    if (editingNugget) {
      updateNuggetMutation.mutate({ id: editingNugget.id, data });
    } else {
      createNuggetMutation.mutate(data);
    }
  };

  const filteredNuggets = nuggets.filter(n => {
    if (!nuggetSearch) return true;
    const q = nuggetSearch.toLowerCase();
    return n.city.toLowerCase().includes(q) || n.insight.toLowerCase().includes(q) ||
      (n.linkedPoi || "").toLowerCase().includes(q) || (n.linkedNeighbourhood || "").toLowerCase().includes(q);
  });

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
      // W0.6 fix (SH4, Tier-2 activation ratified): apiRequest's signature is
      // (method, url, data) — the old call passed the URL into the method slot, so the
      // request never reached the server.
      return apiRequest("POST", "/api/instagram/publish", data);
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

  // Factory wire B (sidebar audit, ratified 2026-07-25): the Workspace and DMO Library hand a
  // build or library item to the studio as a prefilled draft via query params
  // (?prefill=1&title=…&destination=…&type=…&description=…). Applied once per arrival — the
  // studio stays the author of the content; the params only seed the form.
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (prefillApplied.current) return;
    const params = new URLSearchParams(searchParams);
    if (params.get("prefill") !== "1") return;
    prefillApplied.current = true;
    const title = params.get("title");
    const destination = params.get("destination");
    const type = params.get("type");
    const description = params.get("description");
    if (title) form.setValue("title", title.slice(0, 255));
    if (destination) form.setValue("destination", destination.slice(0, 120));
    if (type && contentTypes.some((t) => t.id === type)) form.setValue("contentType", type);
    if (description) form.setValue("description", description.slice(0, 2000));
    setPageSection("content");
    setIsCreateOpen(true);

    // Phase A3: when the caller also names a real offering (targetType/targetId — e.g. workspace's
    // "Create promo in Content Studio" for a Ready Made build), prefill the Instagram caption from
    // the shared server-side promo-text service. Non-blocking: a fetch failure just leaves the
    // caption empty, the rest of the prefill above is untouched either way.
    const targetType = params.get("targetType");
    const targetId = params.get("targetId");
    if (targetType && targetId) {
      fetch(`/api/promo-text?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`, {
        credentials: "include",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.caption) form.setValue("instagramCaption", data.caption.slice(0, 2200));
        })
        .catch(() => {});
    }
  }, [searchParams, form]);

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
        {/* Local Expert page section tabs */}
        {isLocalExpert && (
          <div className="flex gap-2 border-b pb-4">
            <Button
              variant={pageSection === "content" ? "default" : "ghost"}
              onClick={() => setPageSection("content")}
              className="gap-2"
              data-testid="button-section-content"
            >
              <FileText className="w-4 h-4" />
              Content Studio
            </Button>
            <Button
              variant={pageSection === "knowledge" ? "default" : "ghost"}
              onClick={() => setPageSection("knowledge")}
              className="gap-2"
              data-testid="button-section-knowledge"
            >
              <Brain className="w-4 h-4" />
              Knowledge Base
              {nuggets.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{nuggets.length}</Badge>
              )}
            </Button>
          </div>
        )}

        {/* Knowledge Base Section */}
        {isLocalExpert && pageSection === "knowledge" ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold" data-testid="text-knowledge-base-title">Knowledge Base</h1>
                <p className="text-muted-foreground">Add local insights that power AI recommendations for your city</p>
              </div>
              <Button onClick={() => { setEditingNugget(null); nuggetForm.reset(); setIsNuggetDialogOpen(true); }} data-testid="button-add-nugget">
                <Plus className="w-4 h-4 mr-2" />
                Add Knowledge Nugget
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {nuggetTypes.map(type => {
                const count = nuggets.filter(n => n.nuggetType === type.id).length;
                return (
                  <Card key={type.id}>
                    <CardContent className="p-3 flex items-center gap-2">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", type.bg)}>
                        <type.icon className={cn("w-4 h-4", type.color)} />
                      </div>
                      <div>
                        <p className="text-xl font-bold leading-none">{count}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{type.label}s</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by city, POI, neighbourhood, or insight…"
                value={nuggetSearch}
                onChange={(e) => setNuggetSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-nuggets"
              />
            </div>

            {/* Nuggets list */}
            {nuggetsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
              </div>
            ) : filteredNuggets.length === 0 ? (
              <Card className="p-12">
                <div className="text-center">
                  <Brain className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {nuggetSearch ? "No nuggets match your search" : "Your knowledge base is empty"}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {nuggetSearch ? "Try a different search term" : "Add your first local insight to help AI build better itineraries for your city"}
                  </p>
                  {!nuggetSearch && (
                    <Button onClick={() => { setEditingNugget(null); nuggetForm.reset(); setIsNuggetDialogOpen(true); }} data-testid="button-add-first-nugget">
                      <Plus className="w-4 h-4 mr-2" /> Add Your First Nugget
                    </Button>
                  )}
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredNuggets.map((nugget) => {
                  const typeInfo = nuggetTypes.find(t => t.id === nugget.nuggetType) || nuggetTypes[0];
                  return (
                    <Card key={nugget.id} className="relative" data-testid={`card-nugget-${nugget.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", typeInfo.bg)}>
                              <typeInfo.icon className={cn("w-4 h-4", typeInfo.color)} />
                            </div>
                            <div>
                              <Badge variant="outline" className="text-xs">{typeInfo.label}</Badge>
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {nugget.city}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditNugget(nugget)} data-testid={`button-edit-nugget-${nugget.id}`}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteNuggetMutation.mutate(nugget.id)} disabled={deleteNuggetMutation.isPending} data-testid={`button-delete-nugget-${nugget.id}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm">{nugget.insight}</p>
                        {(nugget.linkedPoi || nugget.linkedNeighbourhood) && (
                          <div className="flex flex-wrap gap-1.5">
                            {nugget.linkedPoi && (
                              <Badge variant="secondary" className="text-xs gap-1"><MapPin className="w-2.5 h-2.5" />{nugget.linkedPoi}</Badge>
                            )}
                            {nugget.linkedNeighbourhood && (
                              <Badge variant="secondary" className="text-xs gap-1"><Globe className="w-2.5 h-2.5" />{nugget.linkedNeighbourhood}</Badge>
                            )}
                          </div>
                        )}
                        {nugget.targetAudience && (
                          <p className="text-xs text-muted-foreground"><span className="font-medium text-green-600">For:</span> {nugget.targetAudience}</p>
                        )}
                        {nugget.notFor && (
                          <p className="text-xs text-muted-foreground"><span className="font-medium text-red-500">Not for:</span> {nugget.notFor}</p>
                        )}
                        {nugget.seasonality && nugget.seasonality.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {nugget.seasonality.map(s => (
                              <Badge key={s} variant="outline" className="text-xs capitalize">{s}</Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Nugget Dialog */}
            <Dialog open={isNuggetDialogOpen} onOpenChange={(open) => { setIsNuggetDialogOpen(open); if (!open) { setEditingNugget(null); nuggetForm.reset(); } }}>
              <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingNugget ? "Edit Knowledge Nugget" : "Add Knowledge Nugget"}</DialogTitle>
                  <DialogDescription>Share a local insight tied to a specific place or neighbourhood</DialogDescription>
                </DialogHeader>
                <Form {...nuggetForm}>
                  <form onSubmit={nuggetForm.handleSubmit(onNuggetSubmit)} className="space-y-4">
                    {/* Type selector */}
                    <FormField control={nuggetForm.control} name="nuggetType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <div className="grid grid-cols-5 gap-2">
                          {nuggetTypes.map(type => (
                            <button key={type.id} type="button" onClick={() => field.onChange(type.id)}
                              className={cn("flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all", field.value === type.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}
                              data-testid={`button-nugget-type-${type.id}`}>
                              <type.icon className={cn("w-4 h-4", type.color)} />
                              <span className="text-center leading-tight">{type.label}</span>
                            </button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={nuggetForm.control} name="city" render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl><Input placeholder="e.g., Tokyo" {...field} data-testid="input-nugget-city" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={nuggetForm.control} name="linkedPoi" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Linked POI <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                          <FormControl><Input placeholder="e.g., Senso-ji Temple" {...field} data-testid="input-nugget-poi" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={nuggetForm.control} name="linkedNeighbourhood" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Neighbourhood <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                          <FormControl><Input placeholder="e.g., Asakusa" {...field} data-testid="input-nugget-neighbourhood" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={nuggetForm.control} name="insight" render={({ field }) => (
                      <FormItem>
                        <FormLabel>The Insight</FormLabel>
                        <FormControl><Textarea placeholder="Share your local knowledge…" rows={3} {...field} data-testid="textarea-nugget-insight" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={nuggetForm.control} name="targetAudience" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Who it's for <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                          <FormControl><Input placeholder="e.g., early risers, families" {...field} data-testid="input-nugget-for" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={nuggetForm.control} name="notFor" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Who it's NOT for <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                          <FormControl><Input placeholder="e.g., solo travelers" {...field} data-testid="input-nugget-not-for" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* Seasonality */}
                    <FormField control={nuggetForm.control} name="seasonality" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Seasonality</FormLabel>
                        <div className="flex flex-wrap gap-2">
                          {seasons.map(s => {
                            const selected = (field.value || []).includes(s);
                            return (
                              <button key={s} type="button"
                                onClick={() => {
                                  const current = field.value || [];
                                  field.onChange(selected ? current.filter(x => x !== s) : [...current, s]);
                                }}
                                className={cn("px-3 py-1 rounded-full text-xs border capitalize transition-all", selected ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50")}
                                data-testid={`button-season-${s}`}>
                                {s}
                              </button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <DialogFooter className="gap-2">
                      <Button type="button" variant="outline" onClick={() => { setIsNuggetDialogOpen(false); setEditingNugget(null); nuggetForm.reset(); }} data-testid="button-nugget-cancel">Cancel</Button>
                      <Button type="submit" disabled={createNuggetMutation.isPending || updateNuggetMutation.isPending} data-testid="button-nugget-save">
                        {(createNuggetMutation.isPending || updateNuggetMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {editingNugget ? "Save Changes" : "Add Nugget"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
        <div className="space-y-6">
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
                          <DropdownMenuItem
                            data-testid={`menu-instagram-${item.id}`}
                            // W0.6 fix (SH4): this item was decorative (no onClick). Publishes the
                            // item's own image + a caption from its real fields; honest guards —
                            // not connected or no image → an explanatory toast, never fake success.
                            onClick={() => {
                              if (!isInstagramConnected) {
                                toast({
                                  title: "Instagram not connected",
                                  description: "Connect your Instagram account in the panel above first.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              if (!item.coverImageUrl) {
                                toast({
                                  title: "No image to publish",
                                  description: "This content item has no cover image — Instagram requires one.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              publishToInstagramMutation.mutate({
                                imageUrl: item.coverImageUrl,
                                caption: `${item.title}\n\n${item.destination}`,
                              });
                            }}
                          >
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
        )}
      </div>
    </ExpertLayout>
  );
}
