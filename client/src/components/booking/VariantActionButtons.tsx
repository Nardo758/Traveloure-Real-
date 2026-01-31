/**
 * VariantActionButtons - Multiple action buttons for each itinerary variant
 * Features: Book Now, Expert Review, Save for Later, Share
 */

import React, { useState } from 'react';
import { CreditCard, UserCheck, Bookmark, Share2, Clock, DollarSign, Eye, CheckCircle, Star, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Variant {
  id: string;
  name: string;
  description: string;
  totalCost: string;
  items: any[];
}

interface Comparison {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
}

interface VariantActionButtonsProps {
  variant: Variant;
  comparison: Comparison;
  userId: string;
  userEmail?: string;
  onBook: () => void;
}

interface VariantOptionsMenuProps {
  variant: Variant;
  comparison: Comparison;
  userId: string;
}

export default function VariantActionButtons({
  variant,
  comparison,
  userId,
  userEmail,
  onBook,
}: VariantActionButtonsProps) {
  // Expert Review Modal
  const [showExpertModal, setShowExpertModal] = useState(false);
  const [expertServiceType, setExpertServiceType] = useState<'review' | 'review_and_book' | 'full_concierge'>('review');
  const [expertNotes, setExpertNotes] = useState('');
  const [isSubmittingExpert, setIsSubmittingExpert] = useState(false);

  // Save Modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveNotes, setSaveNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Share Modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // Expert Review Service Tiers
  const expertTiers = {
    review: {
      name: 'Review Only',
      price: 50,
      description: 'Expert reviews your itinerary and provides feedback',
      IconComponent: Eye,
    },
    review_and_book: {
      name: 'Review & Book',
      price: 50 + (parseFloat(variant.totalCost) * 0.05),
      description: 'Expert reviews and books everything for you',
      IconComponent: CheckCircle,
    },
    full_concierge: {
      name: 'Full Concierge',
      price: 100 + (parseFloat(variant.totalCost) * 0.08),
      description: 'Complete white-glove service, expert handles everything',
      IconComponent: Star,
    },
  };

  // Extract city from destination for expert routing
  const extractCity = (destination: string): string => {
    const parts = destination.split(',');
    return parts[0].trim().toLowerCase();
  };

  // Handle Expert Review Submit
  const handleExpertSubmit = async () => {
    setIsSubmittingExpert(true);
    try {
      const city = extractCity(comparison.destination);
      
      const response = await fetch('/api/expert-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          variantId: variant.id,
          comparisonId: comparison.id,
          destination: city,
          requestType: expertServiceType,
          expertFee: expertTiers[expertServiceType].price,
          notes: expertNotes,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit expert request');

      // Show success
      alert(`Expert request submitted! Queue position will be shown in your dashboard.`);
      setShowExpertModal(false);
      setExpertNotes('');
    } catch (error) {
      console.error('Expert request error:', error);
      alert('Failed to submit expert request. Please try again.');
    } finally {
      setIsSubmittingExpert(false);
    }
  };

  // Handle Save for Later
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/saved-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          variantId: variant.id,
          comparisonId: comparison.id,
          notes: saveNotes,
        }),
      });

      if (!response.ok) throw new Error('Failed to save trip');

      alert('Trip saved! Check your dashboard to view saved trips.');
      setShowSaveModal(false);
      setSaveNotes('');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save trip. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Share
  const handleShare = async () => {
    setIsGeneratingLink(true);
    try {
      const response = await fetch('/api/shared-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: variant.id,
          comparisonId: comparison.id,
          sharedBy: userId,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate share link');

      const data = await response.json();
      const link = `${window.location.origin}/shared-trip/${data.shareToken}`;
      setShareLink(link);
    } catch (error) {
      console.error('Share error:', error);
      alert('Failed to generate share link. Please try again.');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // Copy link to clipboard
  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    alert('Link copied to clipboard!');
  };

  // Social share URLs
  const socialUrls = shareLink
    ? {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareLink)}&text=Check out this trip to ${comparison.destination}!`,
        whatsapp: `https://wa.me/?text=Check out this trip to ${comparison.destination}: ${encodeURIComponent(shareLink)}`,
        email: `mailto:?subject=Trip to ${comparison.destination}&body=I thought you'd like this trip: ${shareLink}`,
      }
    : null;

  return (
    <>
      {/* Centered Action Buttons */}
      <div className="flex items-center justify-center gap-2">
        {/* Book Now */}
        <Button
          onClick={onBook}
          className="text-xs px-3"
          size="sm"
          variant="default"
          data-testid={`button-book-now-${variant.id}`}
        >
          <CreditCard className="w-3 h-3 mr-1" />
          Book Now
        </Button>

        {/* Expert Review */}
        <Button
          onClick={() => setShowExpertModal(true)}
          className="text-xs px-3"
          size="sm"
          variant="outline"
          data-testid={`button-expert-review-${variant.id}`}
        >
          <UserCheck className="w-3 h-3 mr-1" />
          Expert Review
        </Button>
      </div>

      {/* Expert Review Modal */}
      <Dialog open={showExpertModal} onOpenChange={setShowExpertModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Expert Review Service</DialogTitle>
            <DialogDescription>
              Connect with a local expert in {comparison.destination} who will review your itinerary
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Service Tier Selection */}
            <RadioGroup value={expertServiceType} onValueChange={(v: any) => setExpertServiceType(v)}>
              {Object.entries(expertTiers).map(([key, tier]) => (
                <div key={key} className="flex items-start space-x-2 border rounded-lg p-4 hover-elevate" data-testid={`radio-option-${key}`}>
                  <RadioGroupItem value={key} id={key} data-testid={`radio-${key}`} />
                  <Label htmlFor={key} className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold flex items-center gap-1">
                        <tier.IconComponent className="w-4 h-4" /> {tier.name}
                      </span>
                      <Badge variant="secondary">${tier.price.toFixed(2)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{tier.description}</p>
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {/* Notes */}
            <div>
              <Label>Special Requests (Optional)</Label>
              <Textarea
                value={expertNotes}
                onChange={(e) => setExpertNotes(e.target.value)}
                placeholder="Any specific preferences or requirements for the expert..."
                rows={3}
                className="mt-2"
                data-testid="textarea-expert-notes"
              />
            </div>

            {/* Info */}
            <div className="bg-muted border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                <Clock className="w-4 h-4 inline mr-2" />
                Experts typically respond within 2-4 hours. You'll be notified via email when your request is reviewed.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpertModal(false)} data-testid="button-cancel-expert">
              Cancel
            </Button>
            <Button onClick={handleExpertSubmit} disabled={isSubmittingExpert} data-testid="button-submit-expert">
              {isSubmittingExpert ? 'Submitting...' : `Submit Request - $${expertTiers[expertServiceType].price.toFixed(2)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save for Later Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Trip for Later</DialogTitle>
            <DialogDescription>
              We'll save this itinerary for 30 days and send you reminder emails
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                placeholder="Why are you saving this trip? (e.g., 'Waiting for approval', 'Need to check dates')"
                rows={3}
                className="mt-2"
                data-testid="textarea-save-notes"
              />
            </div>

            <div className="bg-muted border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                <Clock className="w-4 h-4 inline mr-2" />
                Price lock: Current prices are saved, but may change when you book later.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveModal(false)} data-testid="button-cancel-save">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-submit-save">
              {isSaving ? 'Saving...' : 'Save Trip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share This Trip</DialogTitle>
            <DialogDescription>
              Share this itinerary with friends or save it for later
            </DialogDescription>
          </DialogHeader>

          {isGeneratingLink ? (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-600">Generating share link...</p>
            </div>
          ) : shareLink ? (
            <div className="space-y-4">
              {/* Link */}
              <div>
                <Label>Share Link</Label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-3 py-2 border rounded-lg bg-muted text-sm"
                    data-testid="input-share-link"
                  />
                  <Button onClick={copyLink} size="sm" data-testid="button-copy-link">
                    Copy
                  </Button>
                </div>
              </div>

              {/* Social Buttons */}
              <div>
                <Label>Share on Social Media</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.facebook, '_blank')}
                    className="w-full"
                    data-testid="button-share-facebook"
                  >
                    Facebook
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.twitter, '_blank')}
                    className="w-full"
                    data-testid="button-share-twitter"
                  >
                    Twitter
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.whatsapp, '_blank')}
                    className="w-full"
                    data-testid="button-share-whatsapp"
                  >
                    WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.email, '_blank')}
                    className="w-full"
                    data-testid="button-share-email"
                  >
                    Email
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareModal(false)} data-testid="button-done-share">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Separate component for the 3-dot options menu (to be placed in card header)
export function VariantOptionsMenu({ variant, comparison, userId }: VariantOptionsMenuProps) {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveNotes, setSaveNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/saved-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          variantId: variant.id,
          comparisonId: comparison.id,
          notes: saveNotes,
        }),
      });

      if (!response.ok) throw new Error('Failed to save trip');

      alert('Trip saved! Check your dashboard to view saved trips.');
      setShowSaveModal(false);
      setSaveNotes('');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save trip. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    setIsGeneratingLink(true);
    try {
      const response = await fetch('/api/shared-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: variant.id,
          comparisonId: comparison.id,
          sharedBy: userId,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate share link');

      const data = await response.json();
      const link = `${window.location.origin}/shared-trip/${data.shareToken}`;
      setShareLink(link);
    } catch (error) {
      console.error('Share error:', error);
      alert('Failed to generate share link. Please try again.');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    alert('Link copied to clipboard!');
  };

  const socialUrls = shareLink
    ? {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareLink)}&text=Check out this trip to ${comparison.destination}!`,
        whatsapp: `https://wa.me/?text=Check out this trip to ${comparison.destination}: ${encodeURIComponent(shareLink)}`,
        email: `mailto:?subject=Trip to ${comparison.destination}&body=I thought you'd like this trip: ${shareLink}`,
      }
    : null;

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => e.stopPropagation()}
            className="transition-transform duration-200"
            style={{ transform: menuOpen ? 'scale(1.25)' : 'scale(1)' }}
            data-testid={`button-more-options-${variant.id}`}
          >
            <MoreVertical className={`transition-all duration-200 ${menuOpen ? 'w-5 h-5' : 'w-4 h-4'}`} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setShowSaveModal(true);
            }}
            className="py-3 text-sm"
            data-testid={`menu-save-later-${variant.id}`}
          >
            <Bookmark className="w-5 h-5 mr-3" />
            Save for Later
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setShowShareModal(true);
              if (!shareLink) handleShare();
            }}
            className="py-3 text-sm"
            data-testid={`menu-share-${variant.id}`}
          >
            <Share2 className="w-5 h-5 mr-3" />
            Share
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save for Later Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Trip for Later</DialogTitle>
            <DialogDescription>
              We'll save this itinerary for 30 days and send you reminder emails
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                placeholder="Why are you saving this trip? (e.g., 'Waiting for approval', 'Need to check dates')"
                rows={3}
                className="mt-2"
                data-testid="textarea-save-notes"
              />
            </div>

            <div className="bg-muted border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                <Clock className="w-4 h-4 inline mr-2" />
                Price lock: Current prices are saved, but may change when you book later.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveModal(false)} data-testid="button-cancel-save">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-submit-save">
              {isSaving ? 'Saving...' : 'Save Trip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share This Trip</DialogTitle>
            <DialogDescription>
              Share this itinerary with friends or save it for later
            </DialogDescription>
          </DialogHeader>

          {isGeneratingLink ? (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Generating share link...</p>
            </div>
          ) : shareLink ? (
            <div className="space-y-4">
              <div>
                <Label>Share Link</Label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-3 py-2 border rounded-lg bg-muted text-sm"
                    data-testid="input-share-link"
                  />
                  <Button onClick={copyLink} size="sm" data-testid="button-copy-link">
                    Copy
                  </Button>
                </div>
              </div>

              <div>
                <Label>Share on Social Media</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.facebook, '_blank')}
                    className="w-full"
                    data-testid="button-share-facebook"
                  >
                    Facebook
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.twitter, '_blank')}
                    className="w-full"
                    data-testid="button-share-twitter"
                  >
                    Twitter
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.whatsapp, '_blank')}
                    className="w-full"
                    data-testid="button-share-whatsapp"
                  >
                    WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.email, '_blank')}
                    className="w-full"
                    data-testid="button-share-email"
                  >
                    Email
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareModal(false)} data-testid="button-done-share">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
