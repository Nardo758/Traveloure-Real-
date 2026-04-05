import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExpertLayout } from "@/components/expert/expert-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RichTextEditor } from "@/components/content-studio/rich-text-editor";
import { TemplateBuilder } from "@/components/content-studio/template-builder";
import { MediaGalleryManager } from "@/components/content-studio/media-gallery";
import { PublishPanel } from "@/components/content-studio/publish-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Eye } from "lucide-react";

export default function ContentCreateEditPage() {
  const [location, navigate] = useLocation();
  const [match, params] = useRoute("/expert/content/edit/:id");
  const isEdit = !!match;
  const contentId = params?.id;

  const queryParams = new URLSearchParams(location.split("?")[1] || "");
  const typeParam = queryParams.get("type") || "travel-guide";

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    contentType: typeParam,
    title: "",
    slug: "",
    description: "",
    content: "",
    coverImage: "",
    destination: "",
    category: "",
    tags: [] as string[],
    status: "draft",
    visibility: "free",
    price: "",
    platforms: [] as string[],
  });

  const [currentTab, setCurrentTab] = useState("content");

  // Fetch existing content if editing
  const { data: existingContent } = useQuery({
    queryKey: [`/api/expert/content/${contentId}`],
    enabled: isEdit && !!contentId,
  });

  useEffect(() => {
    if (existingContent) {
      setFormData({
        contentType: existingContent.contentType,
        title: existingContent.title,
        slug: existingContent.slug,
        description: existingContent.description || "",
        content: existingContent.content || "",
        coverImage: existingContent.coverImage || "",
        destination: existingContent.destination || "",
        category: existingContent.category || "",
        tags: existingContent.tags || [],
        status: existingContent.status,
        visibility: existingContent.visibility,
        price: existingContent.price || "",
        platforms: existingContent.platforms || [],
      });
    }
  }, [existingContent]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (isEdit && contentId) {
        return await apiRequest("PATCH", `/api/expert/content/${contentId}`, data);
      } else {
        return await apiRequest("POST", "/api/expert/content", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expert/content"] });
      toast({
        title: isEdit ? "Content updated" : "Content created",
        description: "Your content has been saved successfully",
      });
      navigate("/expert/content-studio");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save content",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    // Auto-generate slug from title if empty
    if (!formData.slug && formData.title) {
      formData.slug = formData.title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
    }

    saveMutation.mutate(formData);
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getEditorComponent = () => {
    const richTextTypes = [
      "travel-guide",
      "hidden-gem",
      "restaurant-review",
      "hotel-review",
      "activity-recommendation",
      "safety-tips",
    ];

    const templateTypes = ["packing-list", "budget-breakdown", "day-itinerary"];

    if (richTextTypes.includes(formData.contentType)) {
      return (
        <RichTextEditor
          content={formData.content}
          onChange={(content) => updateField("content", content)}
        />
      );
    } else if (templateTypes.includes(formData.contentType)) {
      return (
        <TemplateBuilder
          contentType={formData.contentType}
          content={formData.content}
          onChange={(content) => updateField("content", content)}
        />
      );
    } else if (formData.contentType === "photo-collection") {
      return (
        <MediaGalleryManager
          contentId={contentId}
          onChange={(media) => updateField("content", JSON.stringify({ media }))}
        />
      );
    }

    return null;
  };

  const contentTypeLabel = formData.contentType
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <ExpertLayout title={isEdit ? "Edit Content" : "Create Content"}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/expert/content-studio")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isEdit ? "Edit" : "Create"} {contentTypeLabel}
              </h1>
              <p className="text-gray-600 mt-1">
                {isEdit
                  ? "Update your content"
                  : "Share your knowledge with travelers"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <Tabs value={currentTab} onValueChange={setCurrentTab}>
          <TabsList>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="publish">Publish</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    placeholder="Enter content title"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder="Brief description of your content"
                    rows={3}
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="destination">Destination</Label>
                    <Input
                      id="destination"
                      value={formData.destination}
                      onChange={(e) => updateField("destination", e.target.value)}
                      placeholder="e.g., Paris, France"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => updateField("category", e.target.value)}
                      placeholder="e.g., Cultural, Adventure"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="coverImage">Cover Image URL</Label>
                  <Input
                    id="coverImage"
                    value={formData.coverImage}
                    onChange={(e) => updateField("coverImage", e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Content</CardTitle>
              </CardHeader>
              <CardContent>{getEditorComponent()}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Content Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="slug">URL Slug</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => updateField("slug", e.target.value)}
                    placeholder="auto-generated-from-title"
                    className="mt-1"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Leave empty to auto-generate from title
                  </p>
                </div>

                <div>
                  <Label htmlFor="tags">Tags (comma-separated)</Label>
                  <Input
                    id="tags"
                    value={formData.tags.join(", ")}
                    onChange={(e) =>
                      updateField(
                        "tags",
                        e.target.value.split(",").map((t) => t.trim())
                      )
                    }
                    placeholder="travel, budget, adventure"
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="visibility">Visibility</Label>
                    <Select
                      value={formData.visibility}
                      onValueChange={(value) => updateField("visibility", value)}
                    >
                      <SelectTrigger id="visibility" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="premium">Premium</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.visibility === "premium" && (
                    <div>
                      <Label htmlFor="price">Price ($)</Label>
                      <Input
                        id="price"
                        type="number"
                        value={formData.price}
                        onChange={(e) => updateField("price", e.target.value)}
                        placeholder="9.99"
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="publish">
            <PublishPanel
              content={formData}
              onUpdate={(updates) => setFormData((prev) => ({ ...prev, ...updates }))}
              onPublish={handleSave}
              isPublished={formData.status === "published"}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ExpertLayout>
  );
}
