import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    // The service runs on KST and the expiry rules are calendar-based, so the
    // year-boundary cases only mean anything with the zone pinned.
    env: { TZ: 'Asia/Seoul' },
  },
});
