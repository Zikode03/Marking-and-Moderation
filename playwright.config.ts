import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:5198',
    headless: true,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 5198 --strictPort',
    port: 5198,
    reuseExistingServer: false,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
