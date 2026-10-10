import { defineConfig, devices } from '@playwright/test';

/**
 * The e2e suite runs against its own API server and SQLite database on ports
 * of its own, so it never touches (or reuses) the development servers or the
 * development data. Override with E2E_PORT / E2E_API_PORT if these are taken.
 */
const PORT = Number(process.env.E2E_PORT ?? 5273);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
const APP_URL = `http://localhost:${PORT}`;
const DATABASE_PATH = process.env.E2E_DATABASE_PATH ?? '.e2e/e2e.db';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // Wide enough that the canvas keeps room for a few cards beside the sidebar and inspector.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1680, height: 1000 } },
    },
  ],
  webServer: [
    {
      // Create the auth + project tables in the e2e database, then serve the API.
      command: 'npm run auth:migrate && npm run auth-server',
      url: `http://localhost:${API_PORT}/api/auth/ok`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_PATH,
        AUTH_SERVER_PORT: String(API_PORT),
        VITE_APP_URL: APP_URL,
        BETTER_AUTH_URL: APP_URL,
        // Keep sent mail in memory so the password reset test can open the link.
        DEV_MAILBOX: '1',
      },
    },
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
