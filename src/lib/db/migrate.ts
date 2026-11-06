import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/ksae.db';

export function runMigrations() {
  const sqlite = new Database(DATABASE_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: './drizzle' });

  // Seed default settings if not present
  const defaults: [string, string][] = [
    ['maxSubscribers', '50'],
    // 'true' 면 정원 없음. maxSubscribers 값은 그대로 남아 끄면 다시 쓰인다.
    ['unlimitedSubscribers', 'false'],
    // 내년 구독(갱신)을 파는 첫 달. 이 달 1일부터 12월 31일까지 판다.
    ['renewalOpenMonth', '12'],
    ['registrationOpen', 'true'],
    ['maxEmailsPerUserPerDay', '2'],
    // 연간 구독료. 카드 최소 승인금액이 1,000원이라 그 밑으로는 내릴 수 없다.
    ['subscriptionPrice', '1000'],
    // Brevo 잔량 중 새 글 알림에 쓰지 않고 남겨 두는 몫(테스트 메일·갱신 안내). 넘치는 알림은 다음 날로.
    ['brevoReserve', '30'],
    // 게시글 제목이 바뀐 것(수정)도 알리는지. 'false' 면 새 글만 보낸다.
    ['notifyPostUpdates', 'true'],
    // 전자상거래법 제10조·제12조 표시사항. /policy 가 이 값을 그대로 렌더한다.
    // 관리자 화면에서 덮어쓸 수 있고, 비워두면 "미등록"으로 표시된다.
    ['bizName', '오병준'],
    ['bizOwner', '오병준'],
    ['bizRegNo', '486-21-02172'],
    ['bizMailOrderNo', '제2025-대전서구-2265호'],
    ['bizAddress', '대전광역시 유성구 계룡로46번길 61, 204호'],
    ['bizTel', '010-9479-3691'],
    ['bizEmail', 'mail@luftaquila.io'],
  ];

  for (const [key, value] of defaults) {
    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (!existing) {
      db.insert(schema.settings).values({ key, value }).run();
    }
  }

  sqlite.close();
  console.log('Migrations completed and default settings seeded.');
}

// Run directly if called as a script
if (require.main === module) {
  runMigrations();
}
