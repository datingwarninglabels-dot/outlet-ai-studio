import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Excludes _next/static and _next/image as before, plus every request
  // path ending in a static-asset extension — public/ files (icons, the
  // manifest, sw.js, the OG image, the logo) were falling through to the
  // `authorized` callback like any other route, and since none of them
  // are on its publicPaths allowlist, unauthenticated requests for them
  // got redirected to /login: browsers reject a service-worker
  // registration that gets redirected, and Next's image optimizer treats
  // the redirect's HTML body as "not a valid image" and 400s. Excluding
  // by extension also correctly makes /robots.txt and /sitemap.xml
  // unauthenticated-accessible, which they need to be for crawlers.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|json|js|css|woff2?)$).*)",
  ],
};
