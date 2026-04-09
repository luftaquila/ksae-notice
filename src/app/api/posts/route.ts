import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, and, sql, like } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { posts } from '@/lib/db/schema';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const board = searchParams.get('board'); // 'notice' | 'rule' | null (all)
  const category = searchParams.get('category'); // category text filter
  const pinned = searchParams.get('pinned'); // 'true' | 'false' | null
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  const db = getDb();

  const search = searchParams.get('search');

  const conditions = [];
  if (board) conditions.push(eq(posts.boardType, board));
  if (category) conditions.push(eq(posts.category, category));
  if (pinned === 'true') conditions.push(eq(posts.isPinned, 1));
  if (pinned === 'false') conditions.push(eq(posts.isPinned, 0));
  if (search) conditions.push(like(posts.title, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(posts)
      .where(where)
      .orderBy(desc(posts.isPinned), desc(posts.date), desc(posts.postNumber))
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
