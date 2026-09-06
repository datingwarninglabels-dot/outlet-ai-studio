import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

// Explicit deny-list of every private/application route rather than a
// deny-all + allow-exceptions pattern — Allow/Disallow precedence in
// robots.txt is evaluated by specificity, not order, which gets ambiguous
// fast once both directives target overlapping paths. Enumerating the
// known private prefixes directly is unambiguous, and anything not listed
// (just "/" and "/legal/*" today) is implicitly crawlable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: [
        "/dashboard",
        "/projects",
        "/characters",
        "/worlds",
        "/brand-kit",
        "/media-library",
        "/provider-hub",
        "/settings",
        "/create-video",
        "/thumbnail-studio",
        "/voice-studio",
        "/login",
        "/setup",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
