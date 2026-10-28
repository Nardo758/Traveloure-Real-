import { useEffect } from "react";
import { SITE_ORIGIN } from "@shared/site-origin";

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: "website" | "article" | "profile";
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  /**
   * Ask crawlers not to index this page (`<meta name="robots" content="noindex, follow">`).
   * For honest empty states only. The tag is removed on unmount, because the SPA keeps one
   * <head> across navigations and a leftover noindex would silently deindex the next page.
   */
  noindex?: boolean;
  /** An og:title that differs from the page title (e.g. a campaign headline). Absent ⇒ the page title. */
  ogTitle?: string;
}

const DEFAULT_TITLE = "Traveloure - Your AI-Powered Travel Planning Platform";
const DEFAULT_DESCRIPTION = "Plan unforgettable experiences with Traveloure. From romantic getaways to corporate events, our AI-powered platform connects you with expert travel planners and service providers.";
const DEFAULT_IMAGE = "/og-cover.png";
const SITE_NAME = "Traveloure";
const TWITTER_HANDLE = "@traveloure";

export function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords = [],
  image = DEFAULT_IMAGE,
  url,
  type = "website",
  author,
  publishedTime,
  modifiedTime,
  noindex = false,
  ogTitle,
}: SEOHeadProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const fullUrl = url ? `${SITE_ORIGIN}${url}` : SITE_ORIGIN;
  const imageUrl = image.startsWith("http") ? image : `${SITE_ORIGIN}${image}`;

  const defaultKeywords = [
    "travel planning",
    "trip planning",
    "travel experiences",
    "event planning",
    "vacation planning",
    "travel services",
  ];

  const allKeywords = [...defaultKeywords, ...keywords].join(", ");

  useEffect(() => {
    // Update title
    document.title = fullTitle;

    // Update or create meta tags
    const updateMetaTag = (name: string, content: string, isProperty = false) => {
      const attribute = isProperty ? "property" : "name";
      let element = document.querySelector(`meta[${attribute}="${name}"]`);
      
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }
      
      element.setAttribute("content", content);
    };

    // Basic meta tags
    updateMetaTag("description", description);
    updateMetaTag("keywords", allKeywords);
    if (author) updateMetaTag("author", author);

    // Open Graph
    updateMetaTag("og:type", type, true);
    updateMetaTag("og:url", fullUrl, true);
    updateMetaTag("og:title", ogTitle ?? fullTitle, true);
    updateMetaTag("og:description", description, true);
    updateMetaTag("og:image", imageUrl, true);
    updateMetaTag("og:site_name", SITE_NAME, true);
    if (publishedTime) updateMetaTag("article:published_time", publishedTime, true);
    if (modifiedTime) updateMetaTag("article:modified_time", modifiedTime, true);

    // Twitter
    updateMetaTag("twitter:card", "summary_large_image");
    updateMetaTag("twitter:url", fullUrl);
    updateMetaTag("twitter:title", fullTitle);
    updateMetaTag("twitter:description", description);
    updateMetaTag("twitter:image", imageUrl);
    updateMetaTag("twitter:site", TWITTER_HANDLE);

    // Update canonical link
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = fullUrl;
  }, [fullTitle, description, allKeywords, imageUrl, fullUrl, type, author, publishedTime, modifiedTime, ogTitle]);

  useEffect(() => {
    if (!noindex) return;
    let robots = document.querySelector('meta[name="robots"]');
    const created = !robots;
    const previous = robots?.getAttribute("content") ?? null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "noindex, follow");
    return () => {
      if (created) robots?.remove();
      else if (previous !== null) robots?.setAttribute("content", previous);
    };
  }, [noindex]);

  return null;
}
