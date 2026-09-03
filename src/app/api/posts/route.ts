import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, asc, and, or, sql, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { BOARDS, type BoardType } from '@/lib/constants';

// 공지 밖의 게시판은 라벨('규정', '경기결과', '양식')이 그대로 필터 값이다.
const BOARD_TYPE_BY_LABEL = new Map<string, BoardType>(
  BOARDS.filter((b) => b.type !== 'notice').map((b) => [b.label, b.type]),
);

// 고정글 우선 정렬에서 게시판 사이 순서는 BOARDS 순서다 (공지 → 규정 → 경기결과 → 양식).
const BOARD_ORDER = sql`CASE ${posts.boardType} ${sql.join(
  BOARDS.map((b, i) => sql`WHEN ${b.type} THEN ${i}`),
  sql` `,
)} ELSE ${BOARDS.length} END`;

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
    const boardTypes = cats.flatMap((c) => {
      const type = BOARD_TYPE_BY_LABEL.get(c);
      return type ? [type] : [];
    });
    const noticeCats = cats.filter((c) => !BOARD_TYPE_BY_LABEL.has(c));

    const orConds = [];
    if (noticeCats.length > 0) {
      const has공통 = noticeCats.includes('공통');
      const catCondition = has공통
        ? or(inArray(posts.category, noticeCats), isNull(posts.category))
        : inArray(posts.category, noticeCats);
      orConds.push(and(eq(posts.boardType, 'notice'), catCondition));
    }
    if (boardTypes.length > 0) {
      orConds.push(inArray(posts.boardType, boardTypes));
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

  // pinnedFirst: pinned DESC → board order (BOARDS) → date DESC
  const order = pinnedFirst
    ? [desc(posts.isPinned), asc(BOARD_ORDER), desc(posts.date), desc(posts.postNumber)]
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
