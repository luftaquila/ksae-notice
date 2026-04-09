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
    ['registrationOpen', 'true'],
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
