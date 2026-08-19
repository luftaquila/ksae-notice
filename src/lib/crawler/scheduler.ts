import cron, { type ScheduledTask } from 'node-cron';
import { crawlLatest, crawlAll, needsInitialCrawl, cleanupStaleCrawlLogs } from './index';
import { checkAndSendRenewalReminders } from '../subscription/renewal';
import { expireStaleOrders } from '../payment/orders';

let crawlTask: ScheduledTask | null = null;
let renewalTask: ScheduledTask | null = null;
let orderCleanupTask: ScheduledTask | null = null;
let isCrawling = false;

export async function initScheduler() {
  // Run initial crawl if DB is empty
  if (needsInitialCrawl()) {
    console.log('[Scheduler] Database empty, running initial full crawl...');
    await crawlAll();
  }

  // Schedule incremental crawl every 5 minutes, 7AM-7PM KST
  // cron: minute 0,5,10,...55 of hours 7-18 (18:55 is the last run before 19:00)
  crawlTask = cron.schedule('*/5 7-18 * * *', async () => {
    if (isCrawling) {
      console.log('[Scheduler] Previous crawl still running, skipping');
      return;
    }
    isCrawling = true;
    try {
      cleanupStaleCrawlLogs();
      await crawlLatest();
    } catch (error) {
      console.error('[Scheduler] Crawl error:', error);
    } finally {
      isCrawling = false;
    }
  }, {
    timezone: 'Asia/Seoul',
  });

  // Schedule renewal reminder check daily at 9AM KST (only matters in December)
  renewalTask = cron.schedule('0 9 * 12 *', async () => {
    console.log(`[Scheduler] Checking renewal reminders at ${new Date().toISOString()}`);
    try {
      await checkAndSendRenewalReminders();
    } catch (error) {
      console.error('[Scheduler] Renewal check error:', error);
    }
  }, {
    timezone: 'Asia/Seoul',
  });

  // 결제창을 열었다 닫은 주문을 시간마다 정리한다. 남겨두면 pending 이 지급 누락의
  // 신호로 못 쓰이게 된다.
  orderCleanupTask = cron.schedule('7 * * * *', () => {
    try {
      const expired = expireStaleOrders();
      if (expired > 0) {
        console.log(`[Scheduler] Marked ${expired} abandoned payment orders as expired`);
      }
    } catch (error) {
      console.error('[Scheduler] Stale payment order cleanup error:', error);
    }
  }, {
    timezone: 'Asia/Seoul',
  });

  console.log('[Scheduler] Cron jobs scheduled.');
}

export function stopScheduler() {
  crawlTask?.stop();
  renewalTask?.stop();
  orderCleanupTask?.stop();
  console.log('[Scheduler] Cron jobs stopped.');
}
