import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { authConfig } from "@/auth.config";
import { checkRateLimit, hashRateLimitKey } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

// Same cheap bot defense as /register and the waitlist form — a real
// person takes at least a couple seconds to fill in email + password.
const MIN_SUBMIT_MS = 1500;
// Keyed by the attempted email (not IP) — this is what actually matters
// for brute-force resistance against one account, and avoids needing to
// plumb request headers through NextAuth's authorize() signature.
const LOGIN_RATE_LIMIT_WINDOW_MINUTES = 10;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // Honeypot + timing fields, same pattern as /register and the
        // waitlist form — real visitors never fill `website`, and never
        // submit within MIN_SUBMIT_MS of the form rendering.
        website: { label: "Website", type: "text" },
        renderedAt: { label: "Rendered At", type: "text" },
      },
      authorize: async (raw) => {
        if (typeof raw?.website === "string" && raw.website) {
          return null;
        }
        const renderedAt = Number(raw?.renderedAt ?? 0);
        if (renderedAt && Date.now() - renderedAt < MIN_SUBMIT_MS) {
          return null;
        }

        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const rateLimitKey = hashRateLimitKey(parsed.data.email.toLowerCase());
        const allowed = await checkRateLimit({
          scope: "login",
          key: rateLimitKey,
          windowMinutes: LOGIN_RATE_LIMIT_WINDOW_MINUTES,
          maxAttempts: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
        });
        if (!allowed) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email))
          .limit(1);

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Stamps role onto the JWT at sign-in — session strategy is "jwt", so
    // this is the only point role data enters the session (the session()
    // callback in auth.config.ts just copies it from here, edge-safe, no
    // DB read). A role change only takes effect on the user's next
    // sign-in, not live — acceptable since roles are set once at account
    // creation, not changed routinely.
    async jwt({ token, user }) {
      if (user?.id) {
        const [dbUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id)).limit(1);
        (token as { role?: string }).role = dbUser?.role ?? "customer";
      }
      return token;
    },
  },
});
