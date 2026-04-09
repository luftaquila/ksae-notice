import NextAuth, { type DefaultSession } from 'next-auth';
import { type JWT } from 'next-auth/jwt';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users } from './db/schema';

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
        db.insert(users).values({
          googleId: profile.sub,
          email: profile.email,
          name: profile.name || null,
          avatar: profile.picture || null,
        }).run();
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
      if (token.userId) {
        (session.user as { id: number }).id = token.userId;
      }
      (session.user as { isAdmin: boolean }).isAdmin =
        session.user.email === process.env.ADMIN_EMAIL;
      return session;
    },
  },
});
