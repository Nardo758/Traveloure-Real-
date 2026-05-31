import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Camera, 
  Car, 
  ChefHat, 
  Baby,
  Map,
  Users,
  Wrench,
  Heart,
  Scissors,
  PawPrint,
  PartyPopper,
  Laptop,
  Languages,
  Sparkles,
  HelpCircle,
  ChevronRight
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface ServiceSubcategory {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  icon: string | null;
  priceRange: any;
  isActive: boolean;
  sortOrder: number | null;
  createdAt: string;
}

interface ServiceCategory {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  icon: string | null;
  imageUrl: string | null;
  categoryType: string;
  verificationRequired: boolean;
  requiredDocuments: string[];
  customProfileFields: any[];
  priceRange: any;
  isActive: boolean;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
  subcategories: ServiceSubcategory[];
}

const categoryIcons: Record<string, any> = {
  "photography-videography": Camera,
  "transportation-logistics": Car,
  "food-culinary": ChefHat,
  "childcare-family": Baby,
  "tours-experiences": Map,
  "personal-assistance": Users,
  "taskrabbit-services": Wrench,
  "health-wellness": Heart,
  "beauty-styling": Scissors,
  "pets-animals": PawPrint,
  "events-celebrations": PartyPopper,
  "technology-connectivity": Laptop,
  "language-translation": Languages,
  "specialty-services": Sparkles,
  "custom-other": HelpCircle,
};

export default function AdminCategories() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [newCategory, setNewCategory] = useState({
    name: "",
    description: "",
    icon: "",
    categoryType: "service_provider",
    verificationRequired: true,
    requiredDocuments: [] as string[],
  });

  const { data: categories = [], isLoading } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/admin/categories"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newCategory) => {
      return apiRequest("POST", "/api/admin/categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      toast({ title: "Category created successfully" });
      setIsCreateOpen(false);
      setNewCategory({ name: "", description: "", icon: "", categoryType: "service_provider", verificationRequired: true, requiredDocuments: [] });
    },
    onError: () => {
      toast({ title: "Failed to create category", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ServiceCategory> }) => {
      return apiRequest("PATCH", `/api/admin/categories/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      toast({ title: "Category updated successfully" });
      setEditingCategory(null);
    },
    onError: () => {
      toast({ title: "Failed to update category", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/categories/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      toast({ title: "Category deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete category", variant: "destructive" });
    },
  });

  const getCategoryTypeLabel = (type: string) => {
    switch (type) {
      case "service_provider": return "Service Provider";
      case "local_expert": return "Local Expert";
      case "hybrid": return "Hybrid";
      default: return type;
    }
  };

  const getCategoryTypeColor = (type: string) => {
    switch (type) {
      case "service_provider": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "local_expert": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "hybrid": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default: return "";
    }
  };

  return (
    <AdminLayout title="Service Categories">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100" data-testid="text-categories-title">
              Service Provider Categories
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage the 15+ service provider categories for your marketplace
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#FF385C] hover:bg-[#E23350]" data-testid="button-create-category">
                <Plus className="w-4 h-4 mr-2" /> Add Category
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Service Category</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Category Name</Label>
                  <Input 
                    id="name" 
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                    placeholder="e.g., Photography & Videography"
                    data-testid="input-category-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description"
                    value={newCategory.description}
                    onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                    placeholder="Brief description of this category..."
                    data-testid="input-category-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="icon">Icon (emoji)</Label>
                  <Input 
                    id="icon"
                    value={newCategory.icon}
                    onChange={(e) => setNewCategory({ ...newCategory, icon: e.target.value })}
                    placeholder="e.g., camera icon"
                    data-testid="input-category-icon"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Category Type</Label>
                  <Select 
                    value={newCategory.categoryType}
                    onValueChange={(value) => setNewCategory({ ...newCategory, categoryType: value })}
                  >
                    <SelectTrigger data-testid="select-category-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="service_provider">Service Provider</SelectItem>
                      <SelectItem value="local_expert">Local Expert</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="verification">Verification Required</Label>
                  <Switch 
                    id="verification"
                    checked={newCategory.verificationRequired}
                    onCheckedChange={(checked) => setNewCategory({ ...newCategory, verificationRequired: checked })}
                    data-testid="switch-verification-required"
                  />
                </div>
                <Button 
                  className="w-full bg-[#FF385C] hover:bg-[#E23350]"
                  onClick={() => createMutation.mutate(newCategory)}
                  disabled={!newCategory.name || createMutation.isPending}
                  data-testid="button-submit-category"
                >
                  {createMutation.isPending ? "Creating..." : "Create Category"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-total-categories">
                {categories.length}
              </div>
              <p className="text-sm text-blue-600 dark:text-blue-400">Total Categories</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="text-active-categories">
                {categories.filter(c => c.isActive).length}
              </div>
              <p className="text-sm text-green-600 dark:text-green-400">Active Categories</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400" data-testid="text-total-subcategories">
                {categories.reduce((sum, c) => sum + (c.subcategories?.length || 0), 0)}
              </div>
              <p className="text-sm text-purple-600 dark:text-purple-400">Total Subcategories</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-verified-categories">
                {categories.filter(c => c.verificationRequired).length}
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-400">Require Verification</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Categories</CardTitle>
            <CardDescription>Manage service provider categories and their subcategories</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <HelpCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>No categories yet. Create your first category to get started.</p>
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {categories.map((category) => {
                  const IconComponent = categoryIcons[category.slug || ""] || HelpCircle;
                  return (
                    <AccordionItem key={category.id} value={category.id} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-[#FF385C]/10 flex items-center justify-center">
                            <IconComponent className="w-5 h-5 text-[#FF385C]" />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{category.name}</span>
                              <Badge variant="outline" className={getCategoryTypeColor(category.categoryType)}>
                                {getCategoryTypeLabel(category.categoryType)}
                              </Badge>
                              {category.verificationRequired && (
                                <Badge variant="outline" className="text-xs">Verified</Badge>
                              )}
                              {!category.isActive && (
                                <Badge variant="secondary" className="text-xs">Inactive</Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 line-clamp-1">{category.description}</p>
                          </div>
                          <div className="text-sm text-gray-500 mr-4">
                            {category.subcategories?.length || 0} subcategories
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="pl-14 space-y-4">
                          <div className="flex items-center gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setEditingCategory(category)}
                              data-testid={`button-edit-category-${category.id}`}
                            >
                              <Edit className="w-4 h-4 mr-1" /> Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => updateMutation.mutate({ 
                                id: category.id, 
                                data: { isActive: !category.isActive } 
                              })}
                              data-testid={`button-toggle-category-${category.id}`}
                            >
                              {category.isActive ? "Deactivate" : "Activate"}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                if (confirm("Are you sure? This will also delete all subcategories.")) {
                                  deleteMutation.mutate(category.id);
                                }
                              }}
                              data-testid={`button-delete-category-${category.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-1" /> Delete
                            </Button>
                          </div>
                          
                          {category.subcategories && category.subcategories.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Subcategories</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {category.subcategories.map((sub) => (
                                  <div 
                                    key={sub.id} 
                                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                                  >
                                    <div className="flex items-center gap-2">
                                      <ChevronRight className="w-4 h-4 text-gray-400" />
                                      <span className="text-sm">{sub.name}</span>
                                    </div>
                                    <Badge variant={sub.isActive ? "outline" : "secondary"}>
                                      {sub.isActive ? "Active" : "Inactive"}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {category.requiredDocuments && (category.requiredDocuments as string[]).length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Required Documents</h4>
                              <div className="flex flex-wrap gap-2">
                                {(category.requiredDocuments as string[]).map((doc, i) => (
                                  <Badge key={i} variant="secondary">{doc}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
