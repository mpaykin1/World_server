#!/usr/bin/env node
'use strict';
// Local desktop+mobile browser evidence for the original GLB art gallery.
const {spawn} = require('node:child_process');
const {mkdirSync} = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {chromium} = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const port = 32079;
const target = 'http://127.0.0.1:' + port + '/apps/voxel-art-lab/';
const out = path.join(os.tmpdir(), 'ws-voxel-art-browser-smoke');
mkdirSync(out, {recursive: true});
const proc = spawn(process.execPath, [path.join(root, 'server.js')], {
  cwd: root, env: {...process.env, PORT: String(port)}, stdio: 'ignore',
});
async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      const ok = await new Promise(resolve => {
        http.get(target, response => {
          response.resume(); resolve(response.statusCode === 200);
        }).on('error', () => resolve(false));
      });
      if (ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Server did not become ready: ' + target);
}
async function view(browser, name, viewport, isMobile, dpr) {
  const context = await browser.newContext({
    viewport, isMobile, deviceScaleFactor:dpr,
    hasTouch:isMobile,
  });
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  await page.goto(target, {waitUntil:'domcontentloaded'});
  await page.locator('#status').getByText(/barren.*КБ/).waitFor({timeout:30000});
  for (const kind of ['city','forest','volcano','energy','idea','river']) {
    await page.locator('button[data-kind="' + kind + '"]').click();
    await page.waitForFunction(type => document.getElementById('status').textContent.startsWith(type + ' ·'), kind,
      {timeout:20000});
    if (kind === 'energy') {
      await page.waitForTimeout(700);
      await page.screenshot({path:path.join(out,name+'-energy.png')});
    }
  }
  await page.locator('button[data-kind="city"]').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('city ·'));
  await page.screenshot({path:path.join(out,name+'-city.png')});
  const canvas = await page.locator('canvas').evaluate(node =>
    ({width:node.width,height:node.height,display: getComputedStyle(node).display}));
  if (canvas.width <= 0 || canvas.height <= 0) throw new Error('Canvas is empty');
  if (faults.length) throw new Error('Page errors: '+faults.join('; '));
  console.log('[VOXEL_ART_E2E]',name,'7 macro choices pass',canvas);
  await context.close();
}
(async () => {
  await ready();
  const browser = await chromium.launch({channel:'msedge',headless:true,
    args:['--disable-gpu-sandbox']});
  try {
    await view(browser,'desktop',{width:1365,height:768},false,1);
    await view(browser,'mobile',{width:390,height:844},true,1);
    console.log('[VOXEL_ART_E2E] PASS screenshots:',out);
  } finally {await browser.close();}
})().catch(error=>{console.error('[VOXEL_ART_E2E] FAIL',error);process.exitCode=1;})
  .finally(()=>proc.kill());
