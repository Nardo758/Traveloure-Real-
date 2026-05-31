---
name: Content studio components
description: 4 components that were missing from content-studio directory causing page crash.
---

## What was created
Directory: `client/src/components/content-studio/`
- `rich-text-editor.tsx` — Markdown-based editor with toolbar (Bold, Italic, H1, H2, List, Quote, Link, Image)
- `template-builder.tsx` — Structured template editors for packing-list, budget-breakdown, day-itinerary
- `media-gallery.tsx` — Image URL-based gallery manager with captions and alt text
- `publish-panel.tsx` — Publication controls: status, visibility, platform toggles, pre-publish checklist

**Why:** `client/src/pages/expert/content-create.tsx` imports all 4 from `@/components/content-studio/`. The directory didn't exist, causing a crash for any expert who visited the create/edit content page.

**Props:** RichTextEditor `{content, onChange}`, TemplateBuilder `{contentType, content, onChange}`, MediaGalleryManager `{contentId?, onChange}`, PublishPanel `{content, onUpdate, onPublish, isPublished}`.
