'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assertPublicUrl,bodyLooksHealthy}=require('../scripts/verify-working-link.cjs');

test('verified-link gate rejects localhost/non-https final links',()=>{
  assert.throws(()=>assertPublicUrl('http://world.example/apps/x/'));
  assert.throws(()=>assertPublicUrl('https://localhost:3000/apps/x/'));
  assert.throws(()=>assertPublicUrl('https://deploy-preview-417--world-server.netlify.app/apps/x/'),'Netlify preview/permalink must never pass the final-link gate');
  assert.throws(()=>assertPublicUrl('https://6ac1ff8e5928250008b11f50--world-server.netlify.app/apps/x/'),'Netlify deploy permalinks are not stable final links');
  assert.doesNotThrow(()=>assertPublicUrl('https://world.example/apps/x/'));
});

test('verified-link gate rejects common dead-host markers',()=>{
  assert.equal(bodyLooksHealthy('<html>game ready</html>'),true);
  assert.equal(bodyLooksHealthy('404: NOT_FOUND'),false);
  assert.equal(bodyLooksHealthy('Site not found'),false);
  assert.equal(bodyLooksHealthy('DEPLOYMENT_NOT_FOUND'),false);
});
