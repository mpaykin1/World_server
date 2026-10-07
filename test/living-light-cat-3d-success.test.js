'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('Living Light Cat 3D user-approved success is discoverable from LIGHT root',()=>{
  const light=read('LIGHT.md');
  const success=read('LIVING_LIGHT_CAT_3D_SUCCESS.md');
  assert.match(light,/LIVING_LIGHT_CAT_3D_SUCCESS\.md/);
  assert.match(light,/Living Light Cat 3D/);
  assert.match(light,/SUCCESS/);
  assert.match(success,/USER-APPROVED SUCCESS/);
  assert.match(success,/world-server\.mmmpaykin\.workers\.dev\/apps\/living-light-cat-3d/);
  assert.match(success,/f044aa498b94618bab4d2590b140d7aa4695fdc4/);
});

test('registries preserve the explicit user verdict without claiming catalog certification',()=>{
  const apps=JSON.parse(read('data/app-release-registry.json'));
  const tech=JSON.parse(read('data/technology-registry.json'));
  const cat=apps.apps['living-light-cat-3d'];
  assert.equal(cat.userAcceptance.verdict,'SUCCESS');
  assert.equal(cat.userAcceptance.acceptedProductionSha,'f044aa498b94618bab4d2590b140d7aa4695fdc4');
  assert.equal(cat.visible,false);
  assert.match(tech.technologies.LIGHT.status,/user-approved/i);
});
