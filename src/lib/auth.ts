import { cookies } from 'next/headers';
import NextAuth, { type DefaultSession } from 'next-auth';
import { type JWT } from 'next-auth/jwt';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users, subscriptions } from './db/schema';
import { SUBSCRIPTION_CATEGORIES } from './constants';
import {
  PENDING_SIGNUP_COOKIE,
  PENDING_SIGNUP_TTL_SECONDS,
  sealPendingSignup,
} from './signup/pending';

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
        // 계정은 여기서 만들지 않는다. 개인정보 동의를 받기 전에 행을 적으면 동의
        // 화면이 의미가 없어지므로, 프로필은 봉인한 쿠키에만 담아 동의 화면으로 보낸다.
        // 실제 생성은 POST /api/auth/signup-consent 가 한다.
        (await cookies()).set(PENDING_SIGNUP_COOKIE, sealPendingSignup({
          googleId,
          email,
          name: profile.name || null,
          avatar: profile.picture || null,
        }), {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: PENDING_SIGNUP_TTL_SECONDS,
        });

        // 문자열을 돌려주면 세션을 만들지 않고 이 주소로 보낸다.
        return '/signup/consent';
      } else if (existing.deletedAt) {
        // Re-registering brings the account back with its categories but no
        // period. Withdrawal forfeits the period — that is what /policy and the
        // confirmation prompt promise — so signing back in must not hand one
        // out, or a lapsed subscriber gets a free year for logging in twice.
        //
        // The period is cleared here and not only on withdrawal because rows
        // deleted before withdrawal started clearing it still carry one.
        db.transaction((tx) => {
          tx.update(users)
            .set({
              deletedAt: null,
              name: profile.name || existing.name,
              avatar: profile.picture || existing.avatar,
              email,
              subscriptionExpiresAt: null,
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
