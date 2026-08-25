// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: 'apng-browser-compat.spec.js',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  projects: [
    { name: 'apng-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'apng-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'apng-webkit', use: { ...devices['Desktop Safari'] } }
  ]
});
