import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, asc, and, sql, like } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { posts } from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const board = searchParams.get('board');
  const category = searchParams.get('category');
  const pinned = searchParams.get('pinned');
  const pinnedFirst = searchParams.get('pinnedFirst') !== 'false';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const search = searchParams.get('search');

  const db = getDb();

  const conditions = [];
  if (board) conditions.push(eq(posts.boardType, board));
  if (category) conditions.push(eq(posts.category, category));
  if (pinned === 'true') conditions.push(eq(posts.isPinned, 1));
  if (pinned === 'false') conditions.push(eq(posts.isPinned, 0));
  if (search) conditions.push(like(posts.title, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // pinnedFirst: pinned DESC → boardType ASC (notice before rule) → date DESC
  const order = pinnedFirst
    ? [desc(posts.isPinned), asc(posts.boardType), desc(posts.date), desc(posts.postNumber)]
    : [desc(posts.date), desc(posts.postNumber)];

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(posts)
      .where(where)
      .orderBy(...order)
      .limit(limit)
      .offset((page - 1) * limit)
      .all(),
    db
      .select({ count: sql<number>`count(*)` })
      .from(posts)
      .where(where)
      .get(),
  ]);

  return NextResponse.json({
    posts: items,
    total: countResult?.count || 0,
    page,
    totalPages: Math.ceil((countResult?.count || 0) / limit),
  });
}
