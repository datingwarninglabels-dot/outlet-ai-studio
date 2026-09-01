import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

// Edge-safe config used by middleware. No adapter, no Credentials provider
// (bcrypt needs the Node runtime) — just enough to read/authorize the JWT.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      // "/" is public too — it does its own owner-exists / session check and
      // renders the marketing page, or redirects to /setup or /dashboard.
      // "/legal" covers the placeholder policy pages (Privacy, Terms, ...).
      const publicPaths = ["/", "/login", "/setup", "/register"];
      const isPublic =
        publicPaths.includes(nextUrl.pathname) ||
        nextUrl.pathname.startsWith("/api/auth") ||
        // Stripe calls this directly — no session cookie exists. The
        // webhook's own signature verification (against
        // STRIPE_WEBHOOK_SECRET) is its authentication, not a login
        // session — see api/stripe/webhook/route.ts.
        nextUrl.pathname.startsWith("/api/stripe/webhook") ||
        nextUrl.pathname.startsWith("/legal");

      if (isPublic) return true;

      if (!isLoggedIn) {
        // Explicit redirect (not just `return false`) so the destination is
        // always preserved as ?callbackUrl=... in one place we control and
        // can verify by reading this file, rather than relying on whatever
        // automatic callbackUrl behavior this next-auth beta version does
        // or doesn't implement for a bare `false`. sanitizeCallbackUrl on
        // the /login side re-validates it before ever using it, so a
        // tampered query param can't become an open redirect even though
        // it round-trips through the URL.
        const loginUrl = new URL("/login", nextUrl);
        loginUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
        return NextResponse.redirect(loginUrl);
      }

      // Owner-only screens (Provider Hub shows platform-wide spend and
      // provider config — never customer-facing, confirmed during the
      // marketing landing page's copy audit). A signed-in Customer hitting
      // this isn't an unauthenticated visitor, so /dashboard is the right
      // redirect target, not /login. Centralized here as defense-in-depth
      // alongside provider-hub/page.tsx's own role check.
      if (nextUrl.pathname.startsWith("/provider-hub") && auth?.user?.role !== "owner") {
        return NextResponse.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      // Cast rather than a "next-auth/jwt" module augmentation — this beta
      // version's generic callback signatures don't reliably pick one up
      // here, matching this codebase's existing stance of not trusting
      // undocumented behavior from this specific next-auth beta (see the
      // authorized callback's own comment above on the same theme). The
      // matching write side is auth.ts's jwt() callback.
      const role = (token as { role?: string }).role;
      if (session.user && role) {
        session.user.role = role;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
