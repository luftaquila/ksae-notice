import NextAuth, { type DefaultSession } from 'next-auth';
import { type JWT } from 'next-auth/jwt';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users, subscriptions } from './db/schema';
import { SUBSCRIPTION_CATEGORIES, getEndOfYear } from './constants';

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

      const db = getDb();
      const existing = db
        .select()
        .from(users)
        .where(eq(users.googleId, profile.sub))
        .get();

      if (!existing) {
        const result = db.insert(users).values({
          googleId: profile.sub,
          email: profile.email,
          name: profile.name || null,
          avatar: profile.picture || null,
        }).run();

        const userId = Number(result.lastInsertRowid);
        const endOfYear = getEndOfYear();
        for (const cat of SUBSCRIPTION_CATEGORIES) {
          db.insert(subscriptions).values({
            userId,
            category: cat.id,
            isActive: 1,
            expiresAt: endOfYear,
          }).run();
        }
      } else if (existing.deletedAt) {
        // Re-register: clear deletedAt and reactivate all subscriptions
        const endOfYear = getEndOfYear();
        db.update(users)
          .set({
            deletedAt: null,
            name: profile.name || existing.name,
            avatar: profile.picture || existing.avatar,
            email: profile.email,
          })
          .where(eq(users.id, existing.id))
          .run();
        db.update(subscriptions)
          .set({ isActive: 1, expiresAt: endOfYear })
          .where(eq(subscriptions.userId, existing.id))
          .run();
      } else {
        db.update(users)
          .set({
            name: profile.name || existing.name,
            avatar: profile.picture || existing.avatar,
            email: profile.email,
          })
          .where(eq(users.googleId, profile.sub))
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
