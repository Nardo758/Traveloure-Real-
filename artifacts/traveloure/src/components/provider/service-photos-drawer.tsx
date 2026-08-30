/**
 * Gap #16 (Gate G5, ratified Aug 13 2026) — the listing home's "Photos & media" drawer.
 *
 * The ratified mock's scope, kept deliberately: this drawer owns the COVER PHOTO — the thing
 * every traveler-facing card renders first and the thing the listing-home checklist row derives
 * from. Two ways in, with the trade-off stated where the choice is made (the mock's copy):
 *
 *   UPLOAD (recommended) — the ruling-58 objstore rail extended to images:
 *     POST /api/provider/services/:id/photo, raw bytes (JPEG/PNG/WebP, magic-byte checked
 *     server-side, 10MB). The stored value is a platform-served URL on OUR domain, so it cannot
 *     be hot-linked away, moved or changed by a third party.
 *   PASTE A LINK — a URL we do not own; it can break, move or change and we cannot vouch for
 *     it. Still allowed (a provider who only has a link should still be able to use one);
 *     written through the ordinary PATCH rail.
 *
 * NEGATIVE SPACE (the mock names these as open questions — not built here): gallery ordering,
 * clip/video support, and whether a cover photo is REQUIRED to go live. The gallery stays
 * authored on the Review & submit step; the checklist row stays non-gating.
 *
 * Upload success mirrors the new URL into the parent form state via `onCoverChange` instead of
 * invalidating ["/api/provider/services", id] — that query's hydration effect resets the whole
 * form and would discard unsaved edits (the deliverable-upload precedent in ServiceForm).
 */
import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/api-error";
import { Loader2, ImageIcon, UploadCloud } from "lucide-react";

// The workspace cover rail (POST .../cover-photo) accepts JPEG/PNG, magic-byte gated server-side.
const ACCEPTED_TYPES = ["image/jpeg", "image/png"];

interface ServicePhotosDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The listing's row id — the drawer only opens on the listing home, where the row exists. */
  serviceId: string;
  /** The current cover value (`formData.serviceImage`) — hydrates the preview + paste box. */
  coverUrl: string;
  /** Mirrors a successful write back into the parent's form state (never a form-resetting
   *  query invalidation — see the module doc). */
  onCoverChange: (url: string) => void;
}

export function ServicePhotosDrawer({
  open,
  onOpenChange,
  serviceId,
  coverUrl,
  onCoverChange,
}: ServicePhotosDrawerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const uploadPhoto = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({
        title: "That file isn't a photo we can take",
        description: "JPEG or PNG images only.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      // The workspace's canonical cover rail: covers:-discriminator storage, private-bucket
      // proxy serve; the response's imageUrl is the proxy URL every card renders.
      const res = await fetch(`/api/provider/services/${serviceId}/cover-photo`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": file.type },
        body: file,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // The server's own sentence (not an image, too large, storage unavailable) — never a
        // generic failure and never a fake success.
        throw new Error(body?.message ?? `Upload failed (${res.status})`);
      }
      // The server has already written provider_services.serviceImage; mirror the proxy URL locally.
      if (typeof body?.imageUrl === "string") onCoverChange(body.imageUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services/health"] });
      toast({
        title: "Cover photo uploaded",
        description: "Stored by us and served from our domain — it can't be hot-linked away or changed by a third party.",
      });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const savePastedLink = async () => {
    const url = linkDraft.trim();
    if (!url) return;
    setSavingLink(true);
    try {
      // apiRequest throws on any non-2xx with the server's JSON envelope in the message.
      await apiRequest("PATCH", `/api/provider/services/${serviceId}`, { serviceImage: url });
      onCoverChange(url);
      setLinkDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/services/health"] });
      toast({ title: "Cover photo link saved" });
    } catch (err: any) {
      toast({
        title: "Couldn't save that link",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setSavingLink(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="drawer-service-photos">
        <SheetHeader>
          <SheetTitle>Photos &amp; media</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <p className="text-xs text-muted-foreground border border-dashed rounded-md bg-muted/30 px-3 py-2.5 leading-relaxed">
            The checklist row <b className="text-foreground">"Add a cover photo"</b> links here. It
            ticks when a cover photo exists on the listing — not when you click the row.
          </p>

          <div>
            <Label className="text-sm font-medium">Cover photo</Label>
            <div className="mt-2" data-testid="photos-cover-slot">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt="Current cover photo"
                  className="w-full h-44 object-cover rounded-md border"
                  data-testid="img-photos-cover"
                />
              ) : (
                <div
                  className="w-full h-28 rounded-md border border-dashed bg-muted/30 flex flex-col items-center justify-center gap-1 text-muted-foreground"
                  data-testid="photos-cover-empty"
                >
                  <ImageIcon className="w-5 h-5" />
                  <span className="text-xs">No cover photo yet</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              How photos get onto a listing
            </p>
            <div
              className={`rounded-md border border-dashed px-4 py-5 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "bg-muted/20"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void uploadPhoto(file);
              }}
              data-testid="photos-dropzone"
            >
              <UploadCloud className="w-5 h-5 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium mt-1.5">Drop a photo here, or choose a file</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Uploads are <b className="text-foreground">platform-protected</b> — stored by us and
                served from our domain, like your PDF guide. They cannot be hot-linked, moved or
                taken away by a third party.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-photos-choose-file"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading…
                  </>
                ) : (
                  "Choose file"
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  e.target.value = "";
                }}
                data-testid="input-photos-file"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="photos-paste-link" className="text-sm font-medium">
              …or paste an image link
            </Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="photos-paste-link"
                placeholder="Paste a link"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                data-testid="input-photos-paste-link"
              />
              <Button
                variant="outline"
                disabled={savingLink || !linkDraft.trim()}
                onClick={() => void savePastedLink()}
                data-testid="button-photos-save-link"
              >
                {savingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              The honest trade-off, stated where the choice is made: a pasted link is a URL we do
              not own. It can break, move or change to something else, and we cannot vouch for it.
              Providers who only have a link should still be able to use it; uploads are the
              recommended path.
            </p>
          </div>

          <p className="text-xs text-muted-foreground border border-dashed rounded-md bg-muted/30 px-3 py-2.5 leading-relaxed">
            Gallery ordering, clip support and whether a cover photo is <i>required</i> to go live
            are still open questions — this drawer owns the cover photo; the gallery stays authored
            on the Review &amp; submit step.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
