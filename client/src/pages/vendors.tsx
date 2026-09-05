import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Search,
  Plus,
  Building2,
  MapPin,
  Phone,
  Mail,
  Star,
  Filter,
  Grid3X3,
  List,
  Loader2,
  Camera,
  Music,
  Utensils,
  Car,
  Home,
  Sparkles,
  Heart,
  Users,
  UserRound,
  Download,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { getVendorCreatorLabel } from "@/lib/vendor-creator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { VendorCreator, VendorDirectoryRow } from "@shared/schema";

const vendorCategories = [
  { id: "photography", label: "Photography", icon: Camera },
  { id: "catering", label: "Catering", icon: Utensils },
  { id: "music", label: "Music & DJ", icon: Music },
  { id: "transportation", label: "Transportation", icon: Car },
  { id: "venue", label: "Venues", icon: Home },
  { id: "decor", label: "Decor & Flowers", icon: Sparkles },
  { id: "wedding", label: "Wedding Services", icon: Heart },
  { id: "coordination", label: "Event Coordination", icon: Users },
];

const vendorFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().optional(),
  priceRange: z.string().optional(),
});

type VendorFormValues = z.infer<typeof vendorFormSchema>;
/**
 * What `GET /api/vendors` actually returns (ledger `2026-09-05-vendors-read-scope`): the vendor's
 * own business columns always, and `createdBy` ONLY on the admin projection — the server does not
 * disclose the creating account to a non-admin browser at all.
 */
type Vendor = VendorDirectoryRow;

const PLANNER_ROLES = new Set(["admin", "service_provider", "provider", "local_expert", "travel_expert", "event_planner"]);

/**
 * True when the SERVER disclosed creator provenance for this row (the admin projection).
 *
 * §13: an UNDISCLOSED creator and an UNKNOWN one are different facts. `createdBy: null` already
 * means "this vendor predates the provenance column", so a non-admin response omits the key
 * entirely and this surface renders no attribution line at all — rather than printing
 * "Unknown origin" over a creator the platform knows perfectly well and simply is not telling
 * this viewer.
 */
function hasCreatorProvenance(vendor: Vendor): boolean {
  return "createdBy" in vendor;
}

function VendorCreatorAttribution({ vendor }: { vendor: Vendor }) {
  const creatorName = [vendor.createdBy?.firstName, vendor.createdBy?.lastName]
    .filter(Boolean)
    .join(" ");
  const creatorLabel = getVendorCreatorLabel(vendor.createdBy);

  return (
    <div
      className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
      data-testid={`vendor-creator-${vendor.id}`}
      title={vendor.createdBy ? "Creator provenance is read-only" : "This vendor predates creator provenance"}
    >
      <UserRound className="w-4 h-4 shrink-0" />
      <span className="font-medium">Created by:</span>
      <span className={vendor.createdBy ? "" : "italic"}>{creatorLabel}</span>
      {vendor.createdBy && creatorName && vendor.createdBy.email && (
        <span className="truncate text-xs">({vendor.createdBy.email})</span>
      )}
    </div>
  );
}

export default function Vendors() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isPlanner = !!user && PLANNER_ROLES.has(user.role ?? "");
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [creatorFilter, setCreatorFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Ledger `2026-09-05-vendors-read-scope`. Two endpoints, because creator provenance is an
  // ADMIN-AUDIT fact and now lives on an admin path (under §2's blanket `adminApiGuard`) rather
  // than as a projection branch inside the browse route. The browse endpoint returns no creator at
  // all, so the creator dropdown below simply has nothing to build from for a non-admin — which is
  // correct: that control is already admin-only.
  const vendorsEndpoint = isAdmin ? "/api/admin/vendors" : "/api/vendors";
  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: [vendorsEndpoint, { createdById: isAdmin && creatorFilter !== "all" ? creatorFilter : undefined }],
  });

  const creatorOptions = vendors.reduce<(VendorCreator | null | undefined)[]>((creators, vendor) => {
    if (vendor.createdBy && !creators.some((creator) => creator?.id === vendor.createdBy?.id)) {
      creators.push(vendor.createdBy);
    }
    return creators;
  }, []).sort((a, b) => getVendorCreatorLabel(a).localeCompare(getVendorCreatorLabel(b)));

  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorFormSchema),
    defaultValues: {
      name: "",
      category: "",
      description: "",
      city: "",
      country: "",
      email: "",
      phone: "",
      website: "",
      priceRange: "moderate",
    },
  });

  const createVendor = useMutation({
    mutationFn: async (data: VendorFormValues) => {
      const res = await apiRequest("POST", "/api/vendors", data);
      return res.json();
    },
    onSuccess: () => {
      // Both listing endpoints (browse + admin) show the new row, so both are invalidated.
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors"] });
      setIsAddDialogOpen(false);
      form.reset();
    },
  });

  const filteredVendors = vendors.filter((vendor) => {
    const matchesSearch = vendor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vendor.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vendor.city?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || vendor.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (category: string) => {
    const cat = vendorCategories.find(c => c.id === category);
    return cat?.icon || Building2;
  };

  const onSubmit = (data: VendorFormValues) => {
    createVendor.mutate(data);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/admin/vendors/export", { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `vendor-creator-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Vendor creator history downloaded." });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Unable to download vendor history.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/dashboard")}
            className="mb-4 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary rounded-lg">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                  {isPlanner ? "Vendor Directory" : "Service Providers"}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  {isPlanner ? "Find and manage trusted service providers" : "Browse trusted service providers"}
                </p>
              </div>
            </div>
            {isPlanner && (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={isExporting}
                  data-testid="button-export-vendors"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export History
                </Button>
              )}
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-vendor">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Vendor
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add New Vendor</DialogTitle>
                  <DialogDescription>
                    Add a trusted service provider to your directory
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vendor Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Dream Photography" {...field} data-testid="input-vendor-name" />
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
                              <SelectTrigger data-testid="select-vendor-category">
                                <SelectValue placeholder="Select a category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {vendorCategories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Brief description of services..." {...field} data-testid="input-vendor-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input placeholder="Paris" {...field} data-testid="input-vendor-city" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input placeholder="France" {...field} data-testid="input-vendor-country" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="priceRange"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price Range</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-vendor-price">
                                <SelectValue placeholder="Select range" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="budget">Budget</SelectItem>
                              <SelectItem value="moderate">Moderate</SelectItem>
                              <SelectItem value="premium">Premium</SelectItem>
                              <SelectItem value="luxury">Luxury</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="vendor@example.com" {...field} data-testid="input-vendor-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 (555) 000-0000" {...field} data-testid="input-vendor-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createVendor.isPending} data-testid="button-submit-vendor">
                        {createVendor.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Add Vendor"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
              </Dialog>
            </div>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 dark:text-gray-400" />
            <Input
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-vendors"
            />
          </div>
          <div className="flex gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-category">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {vendorCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select value={creatorFilter} onValueChange={setCreatorFilter}>
                <SelectTrigger className="w-[220px]" data-testid="select-filter-creator">
                  <UserRound className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Creator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Creators</SelectItem>
                  {creatorOptions.map((creator) => (
                    <SelectItem key={creator!.id} value={creator!.id}>
                      {getVendorCreatorLabel(creator)}
                      {creator!.email ? ` (${creator!.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
                data-testid="button-view-grid"
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {!isPlanner && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              Looking for tours, transport, or photography?
            </span>
            <a href="/services" className="ml-auto shrink-0 font-medium text-primary underline-offset-2 hover:underline" data-testid="link-browse-services-banner">
              Browse Service Catalog →
            </a>
          </div>
        )}

        <ScrollArea className="flex-1 px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-gray-600 dark:text-gray-400" />
            </div>
          ) : filteredVendors.length === 0 ? (
            <Card className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Building2 className="w-16 h-16 text-gray-600 dark:text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  No service providers found
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-center max-w-md mb-6">
                  {searchQuery || selectedCategory !== "all"
                    ? "Try adjusting your search or filters"
                    : isPlanner
                    ? "Add your first vendor to get started"
                    : "Browse the full service catalog to find tours, photography, transport, and more."}
                </p>
                {isPlanner ? (
                  <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-vendor-empty">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Vendor
                  </Button>
                ) : (
                  <a href="/services">
                    <Button data-testid="button-browse-services-empty">
                      Browse Service Catalog
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVendors.map((vendor) => {
                const CategoryIcon = getCategoryIcon(vendor.category);
                return (
                  <Card
                    key={vendor.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700"
                    data-testid={`card-vendor-${vendor.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <CategoryIcon className="w-5 h-5 text-primary" />
                        </div>
                        <Badge variant="secondary" className="capitalize">
                          {vendor.priceRange || "moderate"}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg mt-2">{vendor.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {vendor.description || "No description available"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(vendor.city || vendor.country) && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <MapPin className="w-4 h-4" />
                          {[vendor.city, vendor.country].filter(Boolean).join(", ")}
                        </div>
                      )}
                      {vendor.email && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Mail className="w-4 h-4" />
                          {vendor.email}
                        </div>
                      )}
                      {vendor.phone && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Phone className="w-4 h-4" />
                          {vendor.phone}
                        </div>
                      )}
                      {vendor.rating && (
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{vendor.rating}</span>
                        </div>
                      )}
                      {hasCreatorProvenance(vendor) && <VendorCreatorAttribution vendor={vendor} />}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVendors.map((vendor) => {
                const CategoryIcon = getCategoryIcon(vendor.category);
                return (
                  <Card
                    key={vendor.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700"
                    data-testid={`card-vendor-${vendor.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-lg">
                          <CategoryIcon className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900 dark:text-white">{vendor.name}</h3>
                            <Badge variant="secondary" className="capitalize">
                              {vendor.priceRange || "moderate"}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {vendor.description || "No description available"}
                          </p>
                        </div>
                        <div className="hidden md:flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
                          {(vendor.city || vendor.country) && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {[vendor.city, vendor.country].filter(Boolean).join(", ")}
                            </div>
                          )}
                          {vendor.rating && (
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                              {vendor.rating}
                            </div>
                          )}
                          {hasCreatorProvenance(vendor) && <VendorCreatorAttribution vendor={vendor} />}
                        </div>
                        <Button variant="outline" size="sm" data-testid={`button-contact-vendor-${vendor.id}`}>
                          Contact
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {vendorCategories.slice(0, 4).map((category) => {
            const count = vendors.filter(v => v.category === category.id).length;
            return (
              <Card
                key={category.id}
                className={cn(
                  "cursor-pointer transition-all bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700",
                  selectedCategory === category.id && "ring-2 ring-primary"
                )}
                onClick={() => setSelectedCategory(category.id === selectedCategory ? "all" : category.id)}
                data-testid={`card-category-${category.id}`}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <category.icon className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">{category.label}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{count} vendors</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
