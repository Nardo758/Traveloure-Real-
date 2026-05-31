import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Image as ImageIcon, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MediaItem {
  id: string;
  url: string;
  caption: string;
  alt: string;
}

interface MediaGalleryManagerProps {
  contentId?: string;
  onChange: (media: MediaItem[]) => void;
}

export function MediaGalleryManager({ contentId, onChange }: MediaGalleryManagerProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [newAlt, setNewAlt] = useState("");

  const notify = (updated: MediaItem[]) => {
    setItems(updated);
    onChange(updated);
  };

  const addItem = () => {
    if (!newUrl.trim()) {
      toast({ title: "URL required", description: "Please enter an image URL", variant: "destructive" });
      return;
    }
    const item: MediaItem = {
      id: crypto.randomUUID(),
      url: newUrl.trim(),
      caption: newCaption.trim(),
      alt: newAlt.trim() || "Image",
    };
    notify([...items, item]);
    setNewUrl("");
    setNewCaption("");
    setNewAlt("");
  };

  const removeItem = (id: string) => {
    notify(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof MediaItem, value: string) => {
    notify(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
        <Label className="text-sm font-medium">Add Image</Label>
        <Input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://example.com/image.jpg"
          data-testid="input-media-url"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={newCaption}
            onChange={(e) => setNewCaption(e.target.value)}
            placeholder="Caption (optional)"
            data-testid="input-media-caption"
          />
          <Input
            value={newAlt}
            onChange={(e) => setNewAlt(e.target.value)}
            placeholder="Alt text for accessibility"
            data-testid="input-media-alt"
          />
        </div>
        <Button onClick={addItem} type="button" size="sm" data-testid="button-add-media">
          <Plus className="w-4 h-4 mr-2" /> Add Image
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg text-gray-400">
          <ImageIcon className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No images added yet</p>
          <p className="text-xs mt-1">Add image URLs above to build your photo collection</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {items.map((item) => (
            <Card key={item.id} data-testid={`card-media-${item.id}`}>
              <CardContent className="p-3 space-y-2">
                <div className="relative aspect-video bg-gray-100 rounded-md overflow-hidden">
                  <img
                    src={item.url}
                    alt={item.alt}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://placehold.co/400x225?text=Image+Not+Found";
                    }}
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() => removeItem(item.id)}
                    type="button"
                    data-testid={`button-remove-media-${item.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <Input
                  value={item.caption}
                  onChange={(e) => updateItem(item.id, "caption", e.target.value)}
                  placeholder="Caption"
                  className="text-sm"
                />
                <Input
                  value={item.alt}
                  onChange={(e) => updateItem(item.id, "alt", e.target.value)}
                  placeholder="Alt text"
                  className="text-xs text-gray-500"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="text-sm text-gray-500 text-center">
          {items.length} image{items.length !== 1 ? "s" : ""} in gallery
        </p>
      )}
    </div>
  );
}
