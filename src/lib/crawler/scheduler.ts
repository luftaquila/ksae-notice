import cron, { type ScheduledTask } from 'node-cron';
import { crawlLatest, crawlAll, needsInitialCrawl } from './index';
import { checkAndSendRenewalReminders } from '../subscription/renewal';

let crawlTask: ScheduledTask | null = null;
let renewalTask: ScheduledTask | null = null;

export async function initScheduler() {
  // Run initial crawl if DB is empty
  if (needsInitialCrawl()) {
    console.log('[Scheduler] Database empty, running initial full crawl...');
    await crawlAll();
  }

  // Schedule incremental crawl every 5 minutes, 7AM-7PM KST
  // cron: minute 0,5,10,...55 of hours 7-18 (18:55 is the last run before 19:00)
  crawlTask = cron.schedule('*/5 7-18 * * *', async () => {
    console.log(`[Scheduler] Running incremental crawl at ${new Date().toISOString()}`);
    try {
      await crawlLatest();
    } catch (error) {
      console.error('[Scheduler] Crawl error:', error);
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

  console.log('[Scheduler] Cron jobs scheduled.');
}

export function stopScheduler() {
  crawlTask?.stop();
  renewalTask?.stop();
  console.log('[Scheduler] Cron jobs stopped.');
}
