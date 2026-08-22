#!/usr/bin/env node
'use strict';
const { validateSceneDeliveryManifest } = require('../lib/ai3d-delivery-policy');
async function main() {
  const base = String(process.argv[2] || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) { console.error('Usage: node scripts/check-ai3d-public-scene.js https://<host>/apps/<scene>/'); process.exit(2); }
  if (base.includes('/apps/ai3d-reference-test')) throw new Error('diagnostic reference-test URL cannot be final scene URL');
  const page = await fetch(base + '/', { redirect: 'follow' });
  if (!page.ok) throw new Error(`scene page HTTP ${page.status}`);
  const html = await page.text();
  const manifestRes = await fetch(base + '/scene-delivery.json', { cache: 'no-store' });
  if (!manifestRes.ok) throw new Error(`scene-delivery.json HTTP ${manifestRes.status}`);
  const manifest = await manifestRes.json();
  const errors = validateSceneDeliveryManifest(manifest, { requireReadyQuality: true });
  if (errors.length) throw new Error(errors.join('; '));
  for (const hint of ['WASD','стрел','мыш']) if (!html.toLowerCase().includes(hint.toLowerCase())) throw new Error(`public page must visibly mention controls: ${hint}`);
  if (!html.includes('AI3D_PLAYABLE_SCENE')) throw new Error('public page missing AI3D_PLAYABLE_SCENE runtime marker');
  console.log(JSON.stringify({ ok:true, url:base+'/', referenceFidelity:manifest.referenceFidelity, multiViewGeometryStatus:manifest.multiViewGeometryStatus }, null, 2));
}
main().catch(error => { console.error(`PUBLIC SCENE CHECK FAIL: ${error.message}`); process.exit(1); });
