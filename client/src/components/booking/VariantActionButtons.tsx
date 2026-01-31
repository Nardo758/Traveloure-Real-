/**
 * VariantActionButtons - Multiple action buttons for each itinerary variant
 * Features: Book Now, Expert Review, Save for Later, Share
 */

import React, { useState } from 'react';
import { CreditCard, UserCheck, Bookmark, Share2, Clock, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
      icon: '👀',
    },
    review_and_book: {
      name: 'Review & Book',
      price: 50 + (parseFloat(variant.totalCost) * 0.05),
      description: 'Expert reviews and books everything for you',
      icon: '✅',
    },
    full_concierge: {
      name: 'Full Concierge',
      price: 100 + (parseFloat(variant.totalCost) * 0.08),
      description: 'Complete white-glove service, expert handles everything',
      icon: '⭐',
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
      {/* Action Buttons Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Book Now */}
        <Button
          onClick={onBook}
          className="w-full"
          size="lg"
          variant="default"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          Book Now
        </Button>

        {/* Expert Review */}
        <Button
          onClick={() => setShowExpertModal(true)}
          className="w-full"
          size="lg"
          variant="outline"
        >
          <UserCheck className="w-4 h-4 mr-2" />
          Expert Review
        </Button>

        {/* Save for Later */}
        <Button
          onClick={() => setShowSaveModal(true)}
          className="w-full"
          size="lg"
          variant="outline"
        >
          <Bookmark className="w-4 h-4 mr-2" />
          Save Later
        </Button>

        {/* Share */}
        <Button
          onClick={() => {
            setShowShareModal(true);
            if (!shareLink) handleShare();
          }}
          className="w-full"
          size="lg"
          variant="outline"
        >
          <Share2 className="w-4 h-4 mr-2" />
          Share
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
                <div key={key} className="flex items-start space-x-2 border rounded-lg p-4 hover:bg-gray-50">
                  <RadioGroupItem value={key} id={key} />
                  <Label htmlFor={key} className="flex-1 cursor-pointer">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">
                        {tier.icon} {tier.name}
                      </span>
                      <Badge variant="secondary">${tier.price.toFixed(2)}</Badge>
                    </div>
                    <p className="text-sm text-gray-600">{tier.description}</p>
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
              />
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <Clock className="w-4 h-4 inline mr-2" />
                Experts typically respond within 2-4 hours. You'll be notified via email when your request is reviewed.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpertModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleExpertSubmit} disabled={isSubmittingExpert}>
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
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <Clock className="w-4 h-4 inline mr-2" />
                Price lock: Current prices are saved, but may change when you book later.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
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
                    className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 text-sm"
                  />
                  <Button onClick={copyLink} size="sm">
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
                  >
                    Facebook
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.twitter, '_blank')}
                    className="w-full"
                  >
                    Twitter
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.whatsapp, '_blank')}
                    className="w-full"
                  >
                    WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open(socialUrls!.email, '_blank')}
                    className="w-full"
                  >
                    Email
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareModal(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
