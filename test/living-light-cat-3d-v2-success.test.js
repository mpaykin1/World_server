'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('Living Light Cat V2 accepted baseline is cross-chat discoverable',()=>{
  const rootDoc=read('LIGHT.md');
  const handoff=read('LIVING_LIGHT_CAT_3D_V2_SUCCESS.md');
  assert.match(rootDoc,/LIVING_LIGHT_CAT_3D_V2_SUCCESS\.md/);
  assert.match(rootDoc,/living-light-cat-3d-v2/);
  assert.match(handoff,/USER-APPROVED SUCCESS/);
  assert.match(handoff,/canonical editable V2 baseline/i);
  assert.match(handoff,/0e54df67f6edc8212e067f099998ca3c246b9175/);
  assert.match(handoff,/world-server\.mmmpaykin\.workers\.dev\/apps\/living-light-cat-3d-v2/);
});

test('V2 registry stores success URL and editable target without claiming catalog certification',()=>{
  const apps=JSON.parse(read('data/app-release-registry.json'));
  const cat=apps.apps['living-light-cat-3d-v2'];
  assert.equal(cat.userAcceptance.verdict,'SUCCESS');
  assert.equal(cat.userAcceptance.acceptedProductionSha,'0e54df67f6edc8212e067f099998ca3c246b9175');
  assert.equal(cat.userAcceptance.editableTarget,'apps/living-light-cat-3d-v2/');
  assert.equal(cat.visible,false);
});

test('LIGHT registry points future agents to V2 implementation evidence',()=>{
  const tech=JSON.parse(read('data/technology-registry.json'));
  const light=tech.technologies.LIGHT;
  assert.match(light.status,/V2.*user-approved/i);
  assert.ok(light.evidence.includes('LIVING_LIGHT_CAT_3D_V2_SUCCESS.md'));
  assert.ok(light.evidence.includes('apps/living-light-cat-3d-v2/cat-motion-library.js'));
});
