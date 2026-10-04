'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  ERROR_MARKERS,
  parseArgs,
  assertPublicUrl,
  bodyLooksHealthy,
  providerForUrl,
  providerIdentityGate,
}=require('../scripts/verify-working-link.cjs');

test('host error pages are classified as broken even when the host responds with HTML',()=>{
  assert.equal(bodyLooksHealthy('Site not found\nLooks like you followed a broken link or entered a URL that doesn\'t exist on Netlify.'),false);
  assert.equal(bodyLooksHealthy('404: NOT_FOUND DEPLOYMENT_NOT_FOUND'),false);
  assert.equal(bodyLooksHealthy('<main><canvas></canvas></main>'),true);
  assert.ok(ERROR_MARKERS.includes('site not found'));
});

test('public-link parser defaults to three fresh HTTP checks and clamps retry options',()=>{
  const base=parseArgs(['node','verify','https://example.com/app/']);
  assert.equal(base.repeats,3);
  assert.equal(base.delayMs,900);
  const tuned=parseArgs(['node','verify','https://example.com/app/','--repeats=99','--delay-ms=90000','--game']);
  assert.equal(tuned.repeats,5);
  assert.equal(tuned.delayMs,5000);
  assert.equal(tuned.game,true);
});

test('provider detection distinguishes temporary hosting aliases from Cloudflare exact-head URLs',()=>{
  assert.equal(providerForUrl('https://deploy-preview-401--world-server.netlify.app/apps/demo/'),'netlify');
  assert.equal(providerForUrl('https://world-server-pr-401.example.workers.dev/apps/demo/'),'cloudflare');
  assert.equal(providerForUrl('https://example.vercel.app/apps/demo/'),'vercel');
  assert.equal(providerForUrl('https://example.org/apps/demo/'),'other');
});

test('non-Cloudflare host status alone can never prove an expected exact SHA',async()=>{
  await assert.rejects(
    providerIdentityGate('https://deploy-preview-401--world-server.netlify.app/apps/demo/','deadbeef'),
    /Exact revision proof unavailable for netlify URL/,
  );
  const generic=await providerIdentityGate('https://deploy-preview-401--world-server.netlify.app/apps/demo/','');
  assert.deepEqual(generic,{provider:'netlify',exactRevisionProof:false});
});

test('final link must be a real public HTTPS URL',()=>{
  assert.doesNotThrow(()=>assertPublicUrl('https://example.com/apps/demo/'));
  assert.throws(()=>assertPublicUrl('http://example.com/apps/demo/'),/HTTPS/);
  assert.throws(()=>assertPublicUrl('https://localhost:3000/apps/demo/'),/localhost/);
});
