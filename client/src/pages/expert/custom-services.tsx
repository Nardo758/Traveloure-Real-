import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Send, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  DollarSign,
  Package,
  Loader2
} from "lucide-react";
import { motion } from "framer-motion";

interface CustomService {
  id: string;
  title: string;
  description: string | null;
  categoryName: string | null;
  existingCategoryId: string | null;
  price: string;
  duration: string | null;
  deliverables: string[];
  cancellationPolicy: string | null;
  leadTime: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700", icon: Clock },
  submitted: { label: "Pending Review", color: "bg-amber-100 text-amber-700", icon: AlertCircle },
  approved: { label: "Approved", color: "bg-green-100 text-green-700", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700", icon: XCircle },
};

export default function ExpertCustomServicesPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<CustomService | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    categoryName: "",
    price: "",
    duration: "",
    deliverables: [] as string[],
    cancellationPolicy: "",
    leadTime: "",
  });
  const [newDeliverable, setNewDeliverable] = useState("");

  const { data: customServices = [], isLoading } = useQuery<CustomService[]>({
    queryKey: ["/api/expert/custom-services"],
  });

  const { data: serviceCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/expert-service-categories"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/expert/custom-services", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/custom-services"] });
      toast({ title: "Service created", description: "Your custom service has been saved as a draft." });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create service", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/expert/custom-services/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/custom-services"] });
      toast({ title: "Service updated", description: "Your changes have been saved." });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update service", variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/expert/custom-services/${id}/submit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/custom-services"] });
      toast({ title: "Service submitted", description: "Your service is now pending review by our team." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to submit service", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/expert/custom-services/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/custom-services"] });
      toast({ title: "Service deleted", description: "The service has been removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete service", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      categoryName: "",
      price: "",
      duration: "",
      deliverables: [],
      cancellationPolicy: "",
      leadTime: "",
    });
    setEditingService(null);
    setNewDeliverable("");
  };

  const openEditDialog = (service: CustomService) => {
    setEditingService(service);
    setFormData({
      title: service.title,
      description: service.description || "",
      categoryName: service.categoryName || "",
      price: service.price,
      duration: service.duration || "",
      deliverables: service.deliverables || [],
      cancellationPolicy: service.cancellationPolicy || "",
      leadTime: service.leadTime || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.price) {
      toast({ title: "Error", description: "Title and price are required", variant: "destructive" });
      return;
    }

    if (editingService) {
      updateMutation.mutate({ id: editingService.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const addDeliverable = () => {
    if (newDeliverable.trim()) {
      setFormData(prev => ({ ...prev, deliverables: [...prev.deliverables, newDeliverable.trim()] }));
      setNewDeliverable("");
    }
  };

  const removeDeliverable = (index: number) => {
    setFormData(prev => ({ ...prev, deliverables: prev.deliverables.filter((_, i) => i !== index) }));
  };

  const draftServices = customServices.filter(s => s.status === "draft" || s.status === "rejected");
  const pendingServices = customServices.filter(s => s.status === "submitted");
  const approvedServices = customServices.filter(s => s.status === "approved");

  return (
    <ExpertLayout title="Custom Services">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">Custom Services</h1>
            <p className="text-gray-500 mt-1">Create and manage your own unique service offerings</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-[#FF385C]  text-white" data-testid="button-create-service">
                <Plus className="w-4 h-4 mr-2" />
                Create Service
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingService ? "Edit Service" : "Create Custom Service"}</DialogTitle>
                <DialogDescription>
                  {editingService 
                    ? "Update your custom service details. You can submit it for review when ready."
                    : "Add a new custom service that you offer. It will be reviewed by our team before going live."
                  }
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Service Title *</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Private Food Tour in Barcelona"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    data-testid="input-service-title"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what makes your service unique..."
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    data-testid="input-service-description"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select 
                      value={formData.categoryName} 
                      onValueChange={(val) => setFormData(prev => ({ ...prev, categoryName: val }))}
                    >
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select or enter category" />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceCategories.map((cat: any) => (
                          <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                        ))}
                        <SelectItem value="other">Other (Custom)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price">Price ($) *</Label>
                    <Input
                      id="price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.price}
                      onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                      data-testid="input-service-price"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration</Label>
                    <Input
                      id="duration"
                      placeholder="e.g., 3 hours, 1 day"
                      value={formData.duration}
                      onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                      data-testid="input-service-duration"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="leadTime">Lead Time Required</Label>
                    <Input
                      id="leadTime"
                      placeholder="e.g., 48 hours, 1 week"
                      value={formData.leadTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, leadTime: e.target.value }))}
                      data-testid="input-service-lead-time"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>What's Included (Deliverables)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a deliverable..."
                      value={newDeliverable}
                      onChange={(e) => setNewDeliverable(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDeliverable())}
                      data-testid="input-deliverable"
                    />
                    <Button type="button" variant="outline" onClick={addDeliverable} data-testid="button-add-deliverable">
                      Add
                    </Button>
                  </div>
                  {formData.deliverables.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.deliverables.map((item, idx) => (
                        <Badge key={idx} variant="secondary" className="gap-1">
                          {item}
                          <button onClick={() => removeDeliverable(idx)} className="ml-1 ">
                            <XCircle className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cancellationPolicy">Cancellation Policy</Label>
                  <Textarea
                    id="cancellationPolicy"
                    placeholder="Describe your cancellation and refund policy..."
                    rows={2}
                    value={formData.cancellationPolicy}
                    onChange={(e) => setFormData(prev => ({ ...prev, cancellationPolicy: e.target.value }))}
                    data-testid="input-cancellation-policy"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  className="bg-[#FF385C]  text-white"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-service"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingService ? "Save Changes" : "Create Service"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF385C]" />
          </div>
        ) : customServices.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Custom Services Yet</h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Create your own unique service offerings to attract more clients. Once approved, they'll appear on your profile.
              </p>
              <Button 
                onClick={() => setIsDialogOpen(true)}
                className="bg-[#FF385C]  text-white"
                data-testid="button-create-first-service"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Service
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {draftServices.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Drafts & Rejected</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {draftServices.map((service, idx) => (
                    <ServiceCard 
                      key={service.id} 
                      service={service} 
                      idx={idx}
                      onEdit={() => openEditDialog(service)}
                      onSubmit={() => submitMutation.mutate(service.id)}
                      onDelete={() => deleteMutation.mutate(service.id)}
                      isSubmitting={submitMutation.isPending}
                      isDeleting={deleteMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {pendingServices.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Review</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingServices.map((service, idx) => (
                    <ServiceCard key={service.id} service={service} idx={idx} />
                  ))}
                </div>
              </div>
            )}

            {approvedServices.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Approved & Active</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {approvedServices.map((service, idx) => (
                    <ServiceCard key={service.id} service={service} idx={idx} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ExpertLayout>
  );
}

function ServiceCard({ 
  service, 
  idx, 
  onEdit, 
  onSubmit, 
  onDelete,
  isSubmitting,
  isDeleting
}: { 
  service: CustomService; 
  idx: number;
  onEdit?: () => void;
  onSubmit?: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
  isDeleting?: boolean;
}) {
  const config = statusConfig[service.status] || statusConfig.draft;
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
    >
      <Card className="hover:shadow-md transition-shadow" data-testid={`card-custom-service-${service.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate">{service.title}</CardTitle>
              {service.categoryName && (
                <CardDescription className="mt-1">{service.categoryName}</CardDescription>
              )}
            </div>
            <Badge className={`${config.color} gap-1 ml-2`}>
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {service.description && (
            <p className="text-sm text-gray-600 line-clamp-2">{service.description}</p>
          )}

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-gray-600">
              <DollarSign className="w-4 h-4" />
              <span className="font-semibold">${service.price}</span>
            </div>
            {service.duration && (
              <div className="flex items-center gap-1 text-gray-600">
                <Clock className="w-4 h-4" />
                <span>{service.duration}</span>
              </div>
            )}
          </div>

          {service.status === "rejected" && service.rejectionReason && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm text-red-700">
                <strong>Rejection reason:</strong> {service.rejectionReason}
              </p>
            </div>
          )}

          {(service.status === "draft" || service.status === "rejected") && (
            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onEdit}
                data-testid={`button-edit-${service.id}`}
              >
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onSubmit}
                disabled={isSubmitting}
                data-testid={`button-submit-${service.id}`}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Submit for Review
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onDelete}
                disabled={isDeleting}
                className="text-red-500  "
                data-testid={`button-delete-${service.id}`}
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
