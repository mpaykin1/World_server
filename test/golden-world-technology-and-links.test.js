'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8').replace(/^\uFEFF/,'');
const registry=JSON.parse(read('data/app-release-registry.json'));
const policy=JSON.parse(read('data/ui-policy.json'));
const {isEphemeralNetlifyHost,looksBrokenPage,assertStableUserUrl}=require('../scripts/verify-user-facing-link');

test('Golden Standard requires every world to expose new technology visibly',()=>{
  assert.equal(policy.rules.newTechnologyVisibleInAllWorlds,true);
  assert.equal(policy.rules.newTechnologyVisibleWithinSeconds,60);
  assert.equal(policy.rules.worldTechnologyCoverageMode,'every-world-direct-or-canonical-gateway');
  const local=Object.entries(registry.apps).filter(([id,m])=>{
    const file=path.join(root,'apps',id,'index.html');
    return fs.existsSync(file)&&(m?.worldMenu?.show||['game','navigator','experience'].includes(m.kind));
  });
  for(const [id] of local)assert.match(read(`apps/${id}/index.html`),/\/shared\/benchmark-capability-runtime\.js/,`${id} missing shared capability runtime`);
});

test('every external catalog world enters through the canonical capability gateway',()=>{
  assert.ok((registry.externalWorlds||[]).length>=8);
  const shell=read('shared/golden-ui-shell.js');
  assert.match(shell,/function worldEntryUrl\(item\)/);
  assert.match(shell,/\/apps\/world-gateway\/\?world=/);
  assert.match(read('apps/world-gateway/index.html'),/benchmark-capability-runtime\.js/);
  assert.match(read('apps/world-gateway/client.js'),/WorldCapabilities\?\.trigger/);
});

test('Golden Standard forbids ephemeral preview links as final user links',()=>{
  assert.equal(policy.rules.stableCanonicalUserLinksOnly,true);
  assert.equal(policy.rules.verifyUserLinkImmediatelyBeforeDelivery,true);
  assert.equal(policy.rules.ephemeralPreviewLinksCanBeFinal,false);
  assert.equal(isEphemeralNetlifyHost('deploy-preview-92--world-server.netlify.app'),true);
  assert.equal(isEphemeralNetlifyHost('6aa0ecaba2cbcd000928b2a9--world-server.netlify.app'),true);
  assert.equal(isEphemeralNetlifyHost('world-server.netlify.app'),false);
  assert.throws(()=>assertStableUserUrl('https://deploy-preview-92--world-server.netlify.app/apps/catalog/'),/Ephemeral Netlify deploy/);
  assert.doesNotThrow(()=>assertStableUserUrl('https://world-server.netlify.app/apps/catalog/'));
});

test('Netlify Site not found response is a hard broken-link signature',()=>{
  assert.equal(looksBrokenPage('Site not found. Looks like you followed a broken link or entered a URL that doesn’t exist on Netlify.'),true);
  assert.equal(looksBrokenPage('<title>3D Каталог</title>'),false);
});
