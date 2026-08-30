import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Play, Grid3x3, MoreHorizontal } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MediaItem {
  id: string;
  url: string;
  type: "video" | "photo";
  title?: string;
  attribution?: string;
  width?: number;
  height?: number;
}

interface MediaCardProps {
  videos?: MediaItem[];
  photos?: MediaItem[];
  isLoading?: boolean;
  error?: string | null;
}

export function MediaCard({ videos = [], photos = [], isLoading, error }: MediaCardProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  const displayPhotos = showAllPhotos ? photos : photos.slice(0, 6);
  const hasMorePhotos = photos.length > 6;

  return (
    <div className="space-y-6">
      {/* Video strip */}
      {videos && videos.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Videos</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video) => (
              <Card key={video.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                <div className="relative h-48 bg-muted flex items-center justify-center">
                  {video.url.startsWith("http") ? (
                    <video src={video.url} className="w-full h-full object-cover" />
                  ) : (
                    <iframe
                      width="100%"
                      height="100%"
                      src={video.url}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/20 hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                    <Play className="w-12 h-12 text-white drop-shadow" />
                  </div>
                </div>
                {video.title && (
                  <CardContent className="p-3">
                    <p className="text-sm font-medium line-clamp-2">{video.title}</p>
                    {video.attribution && (
                      <p className="text-xs text-muted-foreground mt-1">{video.attribution}</p>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Photo gallery */}
      {photos && photos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Grid3x3 className="w-4 h-4" />
              Photo Gallery ({photos.length})
            </h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {displayPhotos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className="relative aspect-square rounded-lg overflow-hidden hover:ring-2 ring-primary transition-all"
              >
                <img src={photo.url} alt={photo.title || "Photo"} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors" />
              </button>
            ))}
          </div>

          {/* Load more / Show all */}
          {hasMorePhotos && !showAllPhotos && (
            <button
              onClick={() => setShowAllPhotos(true)}
              className="w-full py-2 px-4 rounded-lg border border-dashed text-sm font-medium hover:bg-muted transition-colors"
            >
              Load more ({photos.length - 6} photos)
            </button>
          )}
        </div>
      )}

      {/* Lightbox modal for selected photo */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
          >
            <MoreHorizontal className="w-6 h-6" />
          </button>
          <img
            src={selectedPhoto.url}
            alt={selectedPhoto.title || "Photo"}
            className="max-w-2xl max-h-[80vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {!videos || (videos.length === 0 && (!photos || photos.length === 0)) && (
        <p className="text-sm text-muted-foreground">
          No media available yet. Videos and photos will be displayed here once content is sourced.
        </p>
      )}
    </div>
  );
}
