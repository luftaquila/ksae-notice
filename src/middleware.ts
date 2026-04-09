import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Protect /dashboard - requires login
  if (pathname.startsWith('/dashboard')) {
    if (!req.auth) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // Protect /admin and /api/admin - requires login + admin email
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (!req.auth) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/', req.url));
    }
    if (req.auth.user?.email?.toLowerCase() !== process.env.ADMIN_EMAIL?.toLowerCase()) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/api/admin/:path*'],
};
