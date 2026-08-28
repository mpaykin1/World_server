#!/usr/bin/env node
'use strict';
const { chromium, devices } = require('playwright');
const fs = require('fs');

const PROD_HOME = 'https://improve-world-home-improve-world.vercel.app/';
const PROD_API = 'https://world-server-improve-world.vercel.app';

async function testCleanBrowser(browserType, device) {
  const context = await browserType.newContext({
    ...device,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const results = {};

  // 1. Public anonymous access
  const resHome = await page.goto(PROD_HOME, { waitUntil: 'domcontentloaded' });
  results.publicAccess = resHome.status() === 200;
  const html = await page.content();
  results.noVercelAuth = !html.includes('Vercel Authentication') && !html.includes('Deployment Protection');
  results.hasImproveWorld = html.includes('IMPROVE WORLD');

  // 2. /api/config
  const apiRes = await page.request.get(`${PROD_API}/api/config`);
  results.apiConfig = apiRes.status() === 200;
  try {
    const json = await apiRes.json();
    results.supabaseConfig = !!json.supabaseUrl;
  } catch { results.supabaseConfig = false; }

  await context.close();
  return results;
}

(async () => {
  const browser = await chromium.launch();
  console.log('Testing desktop clean browser...');
  const desktop = await testCleanBrowser(browser, {});
  console.log('Desktop:', desktop);

  console.log('Testing mobile clean browser...');
  const mobile = await testCleanBrowser(browser, devices['Pixel 7']);
  console.log('Mobile:', mobile);

  await browser.close();

  const allPass = desktop.publicAccess && desktop.noVercelAuth && desktop.hasImproveWorld && desktop.apiConfig && desktop.supabaseConfig &&
                  mobile.publicAccess && mobile.noVercelAuth && mobile.hasImproveWorld && mobile.apiConfig;

  console.log('\n=== P0 SUMMARY ===');
  console.log(`Public Anonymous Access: ${desktop.publicAccess && desktop.hasImproveWorld ? 'PASS' : 'FAIL'}`);
  console.log(`Vercel Authentication: ${desktop.noVercelAuth ? 'OFF' : 'FAIL'}`);
  console.log(`/api/config: ${desktop.apiConfig ? 'PASS' : 'FAIL'}`);
  console.log(`Supabase real: ${desktop.supabaseConfig ? 'PASS' : 'FAIL'}`);
  console.log(`Mobile: ${mobile.publicAccess && mobile.hasImproveWorld ? 'PASS' : 'FAIL'}`);
  console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`);

  // Write report
  fs.writeFileSync('P0_PRODUCTION_REPORT.json', JSON.stringify({ at: new Date().toISOString(), desktop, mobile, allPass }, null, 2));
  process.exit(allPass ? 0 : 1);
})();
