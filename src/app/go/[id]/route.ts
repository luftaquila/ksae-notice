import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { posts } from '@/lib/db/schema';

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i;
const SITE_URL = process.env.SITE_URL || 'https://ksae-notice.luftaquila.io';

function getMobileUrl(postNumber: number, boardType: string): string {
  const code = boardType === 'notice' ? 'J_notice' : 'J_rule';
  return `https://www.ksae.org/jajak/mobile/bbs/view.php?number=${postNumber}&page=1&code=${code}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const postId = parseInt(id, 10);
  if (isNaN(postId)) {
    return NextResponse.redirect(SITE_URL);
  }

  const db = getDb();
  const post = db
    .select({ postNumber: posts.postNumber, boardType: posts.boardType, url: posts.url })
    .from(posts)
    .where(eq(posts.id, postId))
    .get();

  if (!post) {
    return NextResponse.redirect(SITE_URL);
  }

  const ua = _req.headers.get('user-agent') || '';
  const isMobile = MOBILE_UA.test(ua);

  const target = isMobile ? getMobileUrl(post.postNumber, post.boardType) : post.url;
  return NextResponse.redirect(target);
}
