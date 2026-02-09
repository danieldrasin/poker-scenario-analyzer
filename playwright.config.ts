import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Poker Scenario Analyzer
 *
 * Usage:
 *   Local dev:  npx playwright test
 *   Live site:  TEST_URL=https://your-app.vercel.app LIVE_TEST=true npx playwright test
 */

const isLiveTest = process.env.TEST_URL?.includes('vercel') || process.env.LIVE_TEST === 'true';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  timeout: 60000,

  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-safari',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'iphone-14',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'ipad',
      use: { ...devices['iPad (gen 7)'] },
    },
  ],

  // Only start local dev server if not testing live URL
  ...(isLiveTest ? {} : {
    webServer: {
      command: 'npm run start:web',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
  }),
});
