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
      const publicPaths = ["/", "/login", "/setup"];
      const isPublic =
        publicPaths.includes(nextUrl.pathname) ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/legal");

      if (isPublic || isLoggedIn) return true;

      // Explicit redirect (not just `return false`) so the destination is
      // always preserved as ?callbackUrl=... in one place we control and can
      // verify by reading this file, rather than relying on whatever
      // automatic callbackUrl behavior this next-auth beta version does or
      // doesn't implement for a bare `false`. sanitizeCallbackUrl on the
      // /login side re-validates it before ever using it, so a tampered
      // query param can't become an open redirect even though it round-trips
      // through the URL.
      const loginUrl = new URL("/login", nextUrl);
      loginUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
