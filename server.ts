import { createServer } from 'http';
import next from 'next';
import { runMigrations } from './src/lib/db/migrate';
import { initScheduler, stopScheduler } from './src/lib/crawler/scheduler';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  // Run migrations first
  console.log('[Server] Running database migrations...');
  runMigrations();

  await app.prepare();

  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.listen(port, hostname, () => {
    console.log(`[Server] Ready on http://${hostname}:${port}`);
  });

  // Initialize cron scheduler
  await initScheduler();

  // Graceful shutdown
  const shutdown = () => {
    console.log('[Server] Shutting down...');
    stopScheduler();
    server.close(() => {
      console.log('[Server] Closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
