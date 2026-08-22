// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000/apps/ai3d-voxel-city/',
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
