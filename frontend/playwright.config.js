import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e_tests',
  worker: 1,
  use: {
    baseURL: 'http://127.0.0.1:5000',
    trace: 'off'
  },

  webServer: {
    command: 'gunicorn --bind 0.0.0.0:5000 backend.wsgi:app',
    cwd: '..',
    url: 'http://127.0.0.1:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes
  },
});