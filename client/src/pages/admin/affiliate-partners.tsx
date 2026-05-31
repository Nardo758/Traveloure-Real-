import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Globe,
  Link2,
  RefreshCw,
  Edit,
  Trash2,
  ExternalLink,
  Package,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  BarChart3,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { AffiliatePartner, AffiliateProduct } from "@shared/schema";

interface PartnerFormData {
  name: string;
  websiteUrl: string;
  category: string;
  affiliateTrackingId?: string;
  affiliateLinkTemplate?: string;
  description?: string;
  logoUrl?: string;
  commissionRate?: number;
}

export default function AdminAffiliatePartners() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<AffiliatePartner | null>(null);
  const [viewingProducts, setViewingProducts] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: categoriesData } = useQuery<{ categories: { value: string; label: string }[] }>({
    queryKey: ["/api/affiliate/categories"],
  });

  const { data: partnersData, isLoading: isLoadingPartners } = useQuery<{ partners: AffiliatePartner[]; total: number }>({
    queryKey: ["/api/affiliate/partners", selectedCategory !== "all" ? selectedCategory : undefined],
  });

  const { data: productsData, isLoading: isLoadingProducts } = useQuery<{ products: AffiliateProduct[]; total: number }>({
    queryKey: ["/api/affiliate/products", viewingProducts],
    enabled: !!viewingProducts,
  });

  const createMutation = useMutation({
    mutationFn: async (data: PartnerFormData) => {
      return apiRequest("POST", "/api/affiliate/partners", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/affiliate/partners") });
      setIsAddDialogOpen(false);
      toast({ title: "Success", description: "Partner created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PartnerFormData> }) => {
      return apiRequest("PATCH", `/api/affiliate/partners/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/affiliate/partners") });
      setEditingPartner(null);
      toast({ title: "Success", description: "Partner updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/affiliate/partners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/affiliate/partners") });
      toast({ title: "Success", description: "Partner deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      return apiRequest("POST", `/api/affiliate/partners/${partnerId}/scrape`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/affiliate") });
      toast({
        title: "Scraping Complete",
        description: `Found ${data.productsFound} products (${data.productsNew} new, ${data.productsUpdated} updated)`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Scraping Failed", description: error.message, variant: "destructive" });
    },
  });

  const partners = partnersData?.partners || [];
  const categories = categoriesData?.categories || [];

  const filteredPartners = partners.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.websiteUrl.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryLabel = (value: string) => {
    return categories.find((c) => c.value === value)?.label || value;
  };

  const totalProducts = partners.reduce((acc, p) => acc + ((p as any).productCount || 0), 0);

  return (
    <AdminLayout title="Affiliate Partners">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-stat-total-partners">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" data-testid="text-total-partners">{partners.length}</p>
              <p className="text-sm text-muted-foreground">Total Partners</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-active-partners">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600" data-testid="text-active-partners">
                {partners.filter((p) => p.isActive).length}
              </p>
              <p className="text-sm text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-products">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600" data-testid="text-total-products">{totalProducts}</p>
              <p className="text-sm text-muted-foreground">Scraped Products</p>
            </CardContent>
          </Card>
          <Card data-testid="card-stat-categories">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600" data-testid="text-categories">
                {new Set(partners.map((p) => p.category)).size}
              </p>
              <p className="text-sm text-muted-foreground">Categories</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Affiliate Partners
              </CardTitle>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-partner">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Partner
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add Affiliate Partner</DialogTitle>
                    <DialogDescription>
                      Add a new affiliate partner to scrape products from their website.
                    </DialogDescription>
                  </DialogHeader>
                  <PartnerForm
                    categories={categories}
                    onSubmit={(data) => createMutation.mutate(data)}
                    isSubmitting={createMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex flex-wrap gap-4 mt-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search partners..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-partners"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[200px]" data-testid="select-category-filter">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingPartners ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPartners.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-partners">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No affiliate partners found</p>
                <p className="text-sm mt-1">Add a partner to start scraping products</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Scraped</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPartners.map((partner) => (
                    <TableRow key={partner.id} data-testid={`row-partner-${partner.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                            {partner.logoUrl ? (
                              <img src={partner.logoUrl} alt={partner.name} className="h-8 w-8 object-contain rounded" />
                            ) : (
                              <Globe className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium" data-testid={`text-partner-name-${partner.id}`}>{partner.name}</p>
                            <a
                              href={partner.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-muted-foreground hover:underline flex items-center gap-1"
                            >
                              {new URL(partner.websiteUrl).hostname}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" data-testid={`badge-category-${partner.id}`}>
                          {getCategoryLabel(partner.category)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {partner.isActive ? (
                          <Badge variant="default" className="bg-green-600" data-testid={`badge-status-${partner.id}`}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-status-${partner.id}`}>
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {partner.lastScrapedAt ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(partner.lastScrapedAt).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {partner.commissionRate ? (
                          <span className="font-medium">{partner.commissionRate}%</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setViewingProducts(partner.id)}
                            title="View Products"
                            data-testid={`button-view-products-${partner.id}`}
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => scrapeMutation.mutate(partner.id)}
                            disabled={scrapeMutation.isPending}
                            title="Scrape Website"
                            data-testid={`button-scrape-${partner.id}`}
                          >
                            {scrapeMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingPartner(partner)}
                            title="Edit Partner"
                            data-testid={`button-edit-${partner.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this partner?")) {
                                deleteMutation.mutate(partner.id);
                              }
                            }}
                            title="Delete Partner"
                            data-testid={`button-delete-${partner.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editingPartner} onOpenChange={(open) => !open && setEditingPartner(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Partner</DialogTitle>
              <DialogDescription>Update affiliate partner details.</DialogDescription>
            </DialogHeader>
            {editingPartner && (
              <PartnerForm
                categories={categories}
                initialData={editingPartner}
                onSubmit={(data) => updateMutation.mutate({ id: editingPartner.id, data })}
                isSubmitting={updateMutation.isPending}
              />
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewingProducts} onOpenChange={(open) => !open && setViewingProducts(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Scraped Products</DialogTitle>
              <DialogDescription>
                Products scraped from{" "}
                {partners.find((p) => p.id === viewingProducts)?.name || "partner"}
              </DialogDescription>
            </DialogHeader>
            {isLoadingProducts ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (productsData?.products?.length || 0) === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No products scraped yet</p>
                <p className="text-sm mt-1">Click the refresh button to scrape products from this partner</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {productsData?.products.map((product) => (
                  <Card key={product.id} data-testid={`card-product-${product.id}`}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-20 h-20 object-cover rounded-md"
                          />
                        )}
                        <div className="flex-1">
                          <h4 className="font-medium">{product.name}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {product.shortDescription || product.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {product.price && (
                              <Badge variant="secondary">${product.price} {product.currency}</Badge>
                            )}
                            {product.city && <Badge variant="outline">{product.city}</Badge>}
                            {product.rating && (
                              <Badge variant="outline">Rating: {product.rating}</Badge>
                            )}
                          </div>
                        </div>
                        <a
                          href={product.affiliateUrl || product.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0"
                        >
                          <Button size="sm" variant="outline">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

function PartnerForm({
  categories,
  initialData,
  onSubmit,
  isSubmitting,
}: {
  categories: { value: string; label: string }[];
  initialData?: AffiliatePartner;
  onSubmit: (data: PartnerFormData) => void;
  isSubmitting: boolean;
}) {
  const form = useForm<PartnerFormData>({
    defaultValues: {
      name: initialData?.name || "",
      websiteUrl: initialData?.websiteUrl || "",
      category: initialData?.category || "",
      affiliateTrackingId: initialData?.affiliateTrackingId || "",
      affiliateLinkTemplate: initialData?.affiliateLinkTemplate || "",
      description: initialData?.description || "",
      logoUrl: initialData?.logoUrl || "",
      commissionRate: initialData?.commissionRate ? parseFloat(initialData.commissionRate) : undefined,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            rules={{ required: "Name is required" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Partner Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., GetYourGuide" data-testid="input-partner-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="websiteUrl"
            rules={{
              required: "Website URL is required",
              pattern: {
                value: /^https?:\/\/.+/,
                message: "Must be a valid URL starting with http:// or https://",
              },
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website URL</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="https://example.com" data-testid="input-website-url" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="category"
            rules={{ required: "Category is required" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger data-testid="select-partner-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
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
            name="commissionRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Commission Rate (%)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="e.g., 5.5"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    data-testid="input-commission-rate"
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
            name="affiliateTrackingId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Affiliate Tracking ID</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Your affiliate ID" data-testid="input-tracking-id" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="logoUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Logo URL</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="https://example.com/logo.png" data-testid="input-logo-url" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="affiliateLinkTemplate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Affiliate Link Template</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="https://partner.com/redirect?url={url}&ref={tracking_id}"
                  data-testid="input-link-template"
                />
              </FormControl>
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{url}"}, {"{tracking_id}"}, {"{product_url}"} as placeholders
              </p>
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
                <Textarea
                  {...field}
                  placeholder="Brief description of the partner..."
                  rows={3}
                  data-testid="textarea-description"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting} data-testid="button-submit-partner">
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initialData ? "Update Partner" : "Add Partner"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
