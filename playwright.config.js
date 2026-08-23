// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  timeout: 35000,
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
    { name:'desktop-chromium', use:{...devices['Desktop Chrome']} },
    { name:'mobile-chromium', use:{...devices['Pixel 7']} },
    { name:'mobile-webkit', use:{...devices['iPhone 13']} },
    { name:'tablet-chromium', use:{...devices['iPad (gen 7)'], browserName:'chromium'} }
  ]
});
