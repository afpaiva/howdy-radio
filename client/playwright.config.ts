import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3003',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start both the server (mock mode) and the Vite dev server.
  webServer: [
    {
      command: 'bun --cwd server index.ts',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'bun run dev',
      url: 'http://localhost:3003',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});