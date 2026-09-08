import { defineConfig, devices } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  // The server needs CORS headers (NODE_ENV=development) for the browser to
  // make cross-origin auth requests from port 3003 to port 3000.
  // Use a custom healthCheck that sends an Origin header to avoid the server's
  // CORS bug (crashes when req.headers.origin is undefined).
  webServer: [
    {
      command: 'bun index.ts',
      cwd: resolve(__dirname, '../server'),
      healthCheck: 'curl -H "Origin: http://localhost:3003" http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'bun run dev',
      url: 'http://localhost:3003',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});