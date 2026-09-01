import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

// Only the marketing homepage — the /legal/* placeholder pages are
// explicitly noindex (see their own metadata) since they're draft, not
// final content, so listing them here would send a conflicting signal.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
