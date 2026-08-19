import NextAuth, { type DefaultSession } from 'next-auth';
import { type JWT } from 'next-auth/jwt';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users, subscriptions } from './db/schema';
import { SUBSCRIPTION_CATEGORIES } from './constants';

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
        // Signing up hands out categories, never a period: only a settled
        // payment writes subscriptionExpiresAt. An account with no period
        // costs nothing to carry — it holds no subscriber slot and the sender
        // skips it — so there is no capacity gate to apply here any more.
        // The transaction keeps the user row and its six category rows
        // all-or-nothing.
        db.transaction((tx) => {
          const result = tx.insert(users).values({
            googleId,
            email,
            name: profile.name || null,
            avatar: profile.picture || null,
            subscriptionExpiresAt: null,
          }).run();

          const userId = Number(result.lastInsertRowid);
          for (const cat of SUBSCRIPTION_CATEGORIES) {
            tx.insert(subscriptions).values({
              userId,
              category: cat.id,
              isActive: 1,
            }).run();
          }
        }, { behavior: 'immediate' });
      } else if (existing.deletedAt) {
        // Re-register restores the account exactly as it was left. A paid
        // period that has not run out is theirs to finish; one that has
        // lapsed has to be bought again. Neither path gives anything away,
        // so the period is the one field this branch must not touch.
        db.transaction((tx) => {
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
            .set({ isActive: 1 })
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
