import NextAuth, { type DefaultSession } from 'next-auth';
import { type JWT } from 'next-auth/jwt';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users, subscriptions } from './db/schema';
import { SUBSCRIPTION_CATEGORIES, getEndOfYear } from './constants';
import { canAcceptNewSubscriber } from './subscription/capacity';

declare module 'next-auth' {
  interface Session {
    user: {
      id: number;
      isAdmin: boolean;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.sub || !profile?.email) return false;

      // Locals keep the narrowing above inside the transaction callbacks below.
      const googleId = profile.sub;
      const email = profile.email;

      const db = getDb();
      const existing = db
        .select()
        .from(users)
        .where(eq(users.googleId, googleId))
        .get();

      if (!existing) {
        // Signing up must respect the subscriber limit too — it does not go
        // through POST /api/subscriptions, so the check lives here as well.
        // Count and insert in one immediate transaction so concurrent sign-ins
        // cannot both read the same free slot.
        db.transaction((tx) => {
          const isActive = canAcceptNewSubscriber(tx) ? 1 : 0;

          const result = tx.insert(users).values({
            googleId,
            email,
            name: profile.name || null,
            avatar: profile.picture || null,
          }).run();

          const userId = Number(result.lastInsertRowid);
          const endOfYear = getEndOfYear();
          for (const cat of SUBSCRIPTION_CATEGORIES) {
            tx.insert(subscriptions).values({
              userId,
              category: cat.id,
              isActive,
              expiresAt: endOfYear,
            }).run();
          }
        }, { behavior: 'immediate' });
      } else if (existing.deletedAt) {
        // Re-register: clear deletedAt and reactivate all subscriptions, but
        // only if there is still room — a returning user takes a fresh slot.
        db.transaction((tx) => {
          const isActive = canAcceptNewSubscriber(tx) ? 1 : 0;
          const endOfYear = getEndOfYear();

          tx.update(users)
            .set({
              deletedAt: null,
              name: profile.name || existing.name,
              avatar: profile.picture || existing.avatar,
              email,
            })
            .where(eq(users.id, existing.id))
            .run();
          tx.update(subscriptions)
            .set({ isActive, expiresAt: endOfYear })
            .where(eq(subscriptions.userId, existing.id))
            .run();
        }, { behavior: 'immediate' });
      } else {
        db.update(users)
          .set({
            name: profile.name || existing.name,
            avatar: profile.picture || existing.avatar,
            email,
          })
          .where(eq(users.googleId, googleId))
          .run();
      }

      return true;
    },

    async jwt({ token, profile }) {
      if (profile?.sub) {
        const db = getDb();
        const user = db
          .select()
          .from(users)
          .where(eq(users.googleId, profile.sub))
          .get();
        if (user) {
          token.userId = user.id;
        }
      }
      return token;
    },

    async session({ session, token }) {
      const user = session.user as { id?: number; isAdmin: boolean };
      if (token.userId) user.id = token.userId;
      user.isAdmin = session.user.email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
      return session;
    },
  },
});

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.isAdmin) return null;
  return session;
}
