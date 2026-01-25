import { useState } from "react";
import { ExpertLayout } from "@/components/expert-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ChevronLeft, 
  ChevronRight, 
  Check,
  Video,
  MapPin,
  FileText,
  Clock,
  DollarSign,
  Package,
  AlertCircle
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface ServiceFormData {
  serviceName: string;
  description: string;
  categoryId: string;
  serviceType: string;
  deliveryMethod: string;
  deliveryTimeframe: string;
  price: string;
  location: string;
  requirements: string;
  whatIncluded: string;
  status: string;
}

const initialFormData: ServiceFormData = {
  serviceName: "",
  description: "",
  categoryId: "",
  serviceType: "consultation",
  deliveryMethod: "video",
  deliveryTimeframe: "",
  price: "",
  location: "",
  requirements: "",
  whatIncluded: "",
  status: "draft",
};

const serviceTypes = [
  { value: "consultation", label: "Consultation", description: "1-on-1 advice sessions" },
  { value: "planning", label: "Full Planning", description: "Complete trip/event planning" },
  { value: "review", label: "Cart Review", description: "Review and optimize selections" },
  { value: "booking", label: "Booking Assistance", description: "Help with reservations" },
  { value: "custom", label: "Custom Package", description: "Tailored service offering" },
];

const deliveryMethods = [
  { value: "video", label: "Video Call", icon: Video, description: "Live video consultation" },
  { value: "in-person", label: "In-Person", icon: MapPin, description: "Meet in person" },
  { value: "document", label: "Document Delivery", icon: FileText, description: "Written deliverable" },
  { value: "hybrid", label: "Hybrid", icon: Package, description: "Combination approach" },
];

const steps = [
  { id: 1, title: "Basics", description: "Service name and type" },
  { id: 2, title: "Details", description: "Description and delivery" },
  { id: 3, title: "Pricing", description: "Set your rates" },
  { id: 4, title: "Requirements", description: "What you need from clients" },
  { id: 5, title: "Review", description: "Preview and publish" },
];

export default function ServiceWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ServiceFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof ServiceFormData, string>>>({});
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/service-categories"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      return apiRequest("POST", "/api/provider/services", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expert/analytics"] });
      toast({ title: "Service created successfully" });
      navigate("/expert/services");
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create service", 
        description: error.message || "Please try again",
        variant: "destructive" 
      });
    },
  });

  const updateField = (field: keyof ServiceFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof ServiceFormData, string>> = {};

    switch (step) {
      case 1:
        if (!formData.serviceName.trim()) {
          newErrors.serviceName = "Service name is required";
        }
        if (!formData.serviceType) {
          newErrors.serviceType = "Please select a service type";
        }
        break;
      case 2:
        if (!formData.description.trim()) {
          newErrors.description = "Description is required";
        }
        if (!formData.deliveryMethod) {
          newErrors.deliveryMethod = "Please select a delivery method";
        }
        break;
      case 3:
        if (!formData.price || Number(formData.price) <= 0) {
          newErrors.price = "Please enter a valid price";
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = (asDraft: boolean = false) => {
    createMutation.mutate({
      ...formData,
      status: asDraft ? "draft" : "active",
    });
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div 
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
              currentStep === step.id 
                ? "bg-[#FF385C] border-[#FF385C] text-white" 
                : currentStep > step.id 
                  ? "bg-green-500 border-green-500 text-white"
                  : "border-gray-300 text-gray-400"
            )}
          >
            {currentStep > step.id ? (
              <Check className="w-5 h-5" />
            ) : (
              step.id
            )}
          </div>
          {index < steps.length - 1 && (
            <div 
              className={cn(
                "w-16 h-1 mx-2",
                currentStep > step.id ? "bg-green-500" : "bg-gray-200"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="serviceName">Service Name</Label>
        <Input
          id="serviceName"
          value={formData.serviceName}
          onChange={(e) => updateField("serviceName", e.target.value)}
          placeholder="e.g., Trip Planning Consultation"
          className={errors.serviceName ? "border-red-500" : ""}
          data-testid="input-service-name"
        />
        {errors.serviceName && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.serviceName}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Service Type</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {serviceTypes.map((type) => (
            <div
              key={type.value}
              onClick={() => updateField("serviceType", type.value)}
              className={cn(
                "p-4 rounded-lg border-2 cursor-pointer transition-colors",
                formData.serviceType === type.value 
                  ? "border-[#FF385C] bg-[#FF385C]/5" 
                  : "border-gray-200 hover:border-gray-300"
              )}
              data-testid={`option-service-type-${type.value}`}
            >
              <p className="font-medium text-gray-900">{type.label}</p>
              <p className="text-sm text-gray-600">{type.description}</p>
            </div>
          ))}
        </div>
        {errors.serviceType && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.serviceType}
          </p>
        )}
      </div>

      {categories.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="category">Category (Optional)</Label>
          <Select value={formData.categoryId} onValueChange={(v) => updateField("categoryId", v)}>
            <SelectTrigger data-testid="select-category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Describe your service in detail..."
          rows={4}
          className={errors.description ? "border-red-500" : ""}
          data-testid="input-description"
        />
        {errors.description && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.description}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Delivery Method</Label>
        <div className="grid grid-cols-2 gap-3">
          {deliveryMethods.map((method) => (
            <div
              key={method.value}
              onClick={() => updateField("deliveryMethod", method.value)}
              className={cn(
                "p-4 rounded-lg border-2 cursor-pointer transition-colors",
                formData.deliveryMethod === method.value 
                  ? "border-[#FF385C] bg-[#FF385C]/5" 
                  : "border-gray-200 hover:border-gray-300"
              )}
              data-testid={`option-delivery-${method.value}`}
            >
              <method.icon className={cn(
                "w-6 h-6 mb-2",
                formData.deliveryMethod === method.value ? "text-[#FF385C]" : "text-gray-400"
              )} />
              <p className="font-medium text-gray-900">{method.label}</p>
              <p className="text-sm text-gray-600">{method.description}</p>
            </div>
          ))}
        </div>
        {errors.deliveryMethod && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.deliveryMethod}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="deliveryTimeframe">Delivery Timeframe</Label>
          <Input
            id="deliveryTimeframe"
            value={formData.deliveryTimeframe}
            onChange={(e) => updateField("deliveryTimeframe", e.target.value)}
            placeholder="e.g., 60 min, 2-3 days"
            data-testid="input-timeframe"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location (if in-person)</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => updateField("location", e.target.value)}
            placeholder="e.g., Paris, France"
            data-testid="input-location"
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="price">Price (USD)</Label>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            id="price"
            type="number"
            min="0"
            step="0.01"
            value={formData.price}
            onChange={(e) => updateField("price", e.target.value)}
            placeholder="0.00"
            className={cn("pl-10", errors.price ? "border-red-500" : "")}
            data-testid="input-price"
          />
        </div>
        {errors.price && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {errors.price}
          </p>
        )}
      </div>

      <Card className="border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-900">Pricing Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-2">
          <p className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-500 mt-0.5" />
            Research competitor pricing in your specialty
          </p>
          <p className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-500 mt-0.5" />
            Consider your experience and expertise level
          </p>
          <p className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-500 mt-0.5" />
            Factor in preparation time, not just delivery
          </p>
          <p className="flex items-start gap-2">
            <Check className="w-4 h-4 text-green-500 mt-0.5" />
            Start competitive, adjust based on demand
          </p>
        </CardContent>
      </Card>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="requirements">Requirements from Client</Label>
        <Textarea
          id="requirements"
          value={formData.requirements}
          onChange={(e) => updateField("requirements", e.target.value)}
          placeholder="What information do you need from clients before the service?"
          rows={4}
          data-testid="input-requirements"
        />
        <p className="text-sm text-gray-500">e.g., Travel dates, budget range, preferences</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatIncluded">What is Included</Label>
        <Textarea
          id="whatIncluded"
          value={formData.whatIncluded}
          onChange={(e) => updateField("whatIncluded", e.target.value)}
          placeholder="List what clients will receive..."
          rows={4}
          data-testid="input-included"
        />
        <p className="text-sm text-gray-500">e.g., Detailed itinerary, booking links, local recommendations</p>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle>{formData.serviceName || "Untitled Service"}</CardTitle>
          <CardDescription>{formData.description || "No description"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Service Type</p>
              <p className="font-medium">
                {serviceTypes.find(t => t.value === formData.serviceType)?.label || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Delivery Method</p>
              <p className="font-medium">
                {deliveryMethods.find(m => m.value === formData.deliveryMethod)?.label || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Price</p>
              <p className="font-medium text-green-600">${formData.price || "0"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Timeframe</p>
              <p className="font-medium">{formData.deliveryTimeframe || "Not specified"}</p>
            </div>
          </div>

          {formData.requirements && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Requirements</p>
              <p className="text-gray-700">{formData.requirements}</p>
            </div>
          )}

          {formData.whatIncluded && (
            <div>
              <p className="text-sm text-gray-500 mb-1">What is Included</p>
              <p className="text-gray-700">{formData.whatIncluded}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertCircle className="w-5 h-5 text-yellow-600" />
        <p className="text-sm text-yellow-800">
          You can publish now or save as draft to edit later
        </p>
      </div>
    </div>
  );

  return (
    <ExpertLayout title="Create Service">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/expert/services")}
            className="mb-4"
            data-testid="button-back-to-services"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Services
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Create New Service</h1>
          <p className="text-gray-600">
            Step {currentStep} of {steps.length}: {steps[currentStep - 1].title}
          </p>
        </div>

        {renderStepIndicator()}

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>{steps[currentStep - 1].title}</CardTitle>
            <CardDescription>{steps[currentStep - 1].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mt-6 gap-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
            data-testid="button-wizard-back"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          <div className="flex items-center gap-3">
            {currentStep === steps.length ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(true)}
                  disabled={createMutation.isPending}
                  data-testid="button-save-draft"
                >
                  Save as Draft
                </Button>
                <Button
                  className="bg-[#FF385C] "
                  onClick={() => handleSubmit(false)}
                  disabled={createMutation.isPending}
                  data-testid="button-publish-service"
                >
                  {createMutation.isPending ? "Publishing..." : "Publish Service"}
                </Button>
              </>
            ) : (
              <Button
                className="bg-[#FF385C] "
                onClick={handleNext}
                data-testid="button-wizard-next"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </ExpertLayout>
  );
}
