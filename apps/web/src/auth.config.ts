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
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      // "/" is public too — it does its own owner-exists / session check and
      // redirects to /setup, /login, or /dashboard accordingly.
      const publicPaths = ["/", "/login", "/setup"];
      const isPublic =
        publicPaths.includes(nextUrl.pathname) ||
        nextUrl.pathname.startsWith("/api/auth");

      if (isPublic) return true;
      return isLoggedIn;
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
