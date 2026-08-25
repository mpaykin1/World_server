// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const externalBaseURL = String(process.env.PLAYWRIGHT_BASE_URL || '').trim();
const localBaseURL = 'http://localhost:3000';

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  timeout: 35000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: externalBaseURL || localBaseURL,
    trace: 'on-first-retry',
  },
  webServer: externalBaseURL ? undefined : {
    command: 'node server.js',
    url: `${localBaseURL}/apps/ai3d-voxel-city/`,
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
  projects: [
    { name:'desktop-chromium', use:{...devices['Desktop Chrome']} },
    { name:'mobile-chromium', use:{...devices['Pixel 7']} },
    { name:'mobile-webkit', use:{...devices['iPhone 13']} },
    { name:'tablet-chromium', use:{...devices['iPad (gen 7)'], browserName:'chromium'} }
  ]
});
