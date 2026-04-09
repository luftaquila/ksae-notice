import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, asc, and, or, sql, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { posts } from '@/lib/db/schema';

function escapeLike(s: string): string {
  return s.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const board = searchParams.get('board');
  const category = searchParams.get('category');
  const categoriesParam = searchParams.get('categories');
  const pinned = searchParams.get('pinned');
  const pinnedFirst = searchParams.get('pinnedFirst') !== 'false';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100));
  const search = searchParams.get('search');

  const db = getDb();

  const conditions = [];

  if (categoriesParam) {
    const cats = categoriesParam.split(',').filter(Boolean);
    const hasRule = cats.includes('규정');
    const noticeCats = cats.filter(c => c !== '규정');

    const orConds = [];
    if (noticeCats.length > 0) {
      const has공통 = noticeCats.includes('공통');
      const catCondition = has공통
        ? or(inArray(posts.category, noticeCats), isNull(posts.category))
        : inArray(posts.category, noticeCats);
      orConds.push(and(eq(posts.boardType, 'notice'), catCondition));
    }
    if (hasRule) {
      orConds.push(eq(posts.boardType, 'rule'));
    }
    if (orConds.length === 1) {
      conditions.push(orConds[0]!);
    } else if (orConds.length > 1) {
      conditions.push(or(...orConds)!);
    }
  } else {
    if (board) conditions.push(eq(posts.boardType, board));
    if (category) conditions.push(eq(posts.category, category));
  }

  if (pinned === 'true') conditions.push(eq(posts.isPinned, 1));
  if (pinned === 'false') conditions.push(eq(posts.isPinned, 0));
  if (search) conditions.push(sql`${posts.title} LIKE ${'%' + escapeLike(search) + '%'} ESCAPE '!'`);

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
