import { cookies } from 'next/headers';
import NextAuth, { type DefaultSession } from 'next-auth';
import { type JWT } from 'next-auth/jwt';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users } from './db/schema';
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

      if (!existing || existing.deletedAt) {
        // 계정은 여기서 만들지 않는다. 개인정보 동의를 받기 전에 행을 적으면 동의
        // 화면이 의미가 없어지므로, 프로필은 봉인한 쿠키에만 담아 동의 화면으로 보낸다.
        // 실제 생성은 POST /api/auth/signup-consent 가 한다.
        //
        // 탈퇴한 계정도 같은 길을 간다. 방침이 적은 보유 기간은 "탈퇴 시까지"라 그 동의는
        // 끝났고, 재가입은 새 가입이다. 남겨둔 행은 처음 온 사람과 구분하는 데만 쓰이고,
        // 되살리는 것도 동의 라우트의 일이다 — 여기서 되살리면 동의 화면이 생략된다.
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
      }

      // 살아 있는 계정은 프로필만 갱신한다. 기간은 결제가 쓴 값이라 건드리지 않는다.
      db.update(users)
        .set({
          name: profile.name || existing.name,
          avatar: profile.picture || existing.avatar,
          email,
        })
        .where(eq(users.googleId, googleId))
        .run();

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
