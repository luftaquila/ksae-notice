import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/email/brevo';
import { newPostNotification } from '@/lib/email/templates';

export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const siteUrl = process.env.SITE_URL || 'https://ksae-notice.luftaquila.io';

  const testPosts = [
    {
      id: 0,
      title: '[테스트] KSAE 공지봇 테스트 메일입니다',
      category: '공통',
      date: new Date().toISOString().slice(0, 10),
      boardType: 'notice',
    },
  ];

  try {
    await sendEmail({
      to: { email: session.user.email!, name: session.user.name || undefined },
      subject: '[KSAE 공지봇] 테스트 메일',
      htmlContent: newPostNotification(testPosts, siteUrl),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send' },
      { status: 500 },
    );
  }
}
