'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVerdict, reviewPatch } = require('../scripts/independent-review-gate.cjs');
const { availableCloudflareModels, requestCloudflareReview } =
  require('../scripts/independent-review-cloudflare.cjs');
const cfg = { accountId: 'a'.repeat(32), token: 'cfut_' + 'x'.repeat(40), freePlanConfirmed: true };
const patch = 'diff --git a/a.js b/a.js\n@@ -1 +1 @@\n-old\n+new\n';
const pass = { verdict: 'PASS', findings: [],
  falsification_attempts: ['Reviewed input validation and negative case'] };
test('Cloudflare models need verified Free plan and a separate model family', () => {
  assert.deepEqual(availableCloudflareModels({ ...cfg, freePlanConfirmed: false }), []);
  assert.deepEqual(availableCloudflareModels({ ...cfg, accountId: 'not-an-id' }), []);
  assert.deepEqual(availableCloudflareModels({ ...cfg, token: '' }), []);
  const names = availableCloudflareModels(cfg);
  assert.deepEqual(names.map(x => x.family), ['z-ai', 'nvidia', 'google']);
  assert.equal(availableCloudflareModels({ ...cfg, builderModel: 'google/builder' }).length, 2);
});
test('Cloudflare envelope yields real structured model evidence', async () => {
  const model = availableCloudflareModels(cfg).find(x => x.family === 'google');
  let request;
  const result = await requestCloudflareReview(model, patch, {}, {
    ...cfg, systemPrompt: 'Independent adversarial review', parseVerdict,
    getJson: async (url, opts) => {
      request = { url, opts };
      return { success: true, result: { response: JSON.stringify(pass) } };
    }
  });
  assert.equal(result.provider, 'cloudflare');
  assert.equal(result.family, 'google');
  assert.equal(result.verdict, 'PASS');
  assert.equal(JSON.parse(request.opts.body).max_completion_tokens, 4096);
  assert.ok(request.url.includes('ai/run/@cf/google/gemma-4-26b-a4b-it'));
  assert.ok(!request.opts.body.includes(cfg.token));
});
test('Cloudflare 403/paid-only, empty or truncated response cannot approve', async () => {
  const model = availableCloudflareModels(cfg)[0];
  for (const envelope of [
    { success: false, errors: [{ code: 5035 }] },
    { success: true, result: { response: '' } },
    { success: true, result: { choices: [{ finish_reason: 'length',
      message: { content: JSON.stringify(pass) } }] } }
  ]) {
    const result = await requestCloudflareReview(model, patch, {}, {
      ...cfg, systemPrompt: 'review', parseVerdict, getJson: async () => envelope
    });
    assert.equal(result.verdict, 'INCONCLUSIVE');
  }
});
test('two Cloudflare Free families can review without OpenRouter key', async () => {
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: '', cloudflare: cfg,
    getCatalog: async () => { throw new Error('Catalog should not be used'); },
    reviewCloudflare: async model => ({ ...model, ...pass })
  });
  assert.equal(report.verdict, 'PASS');
  assert.deepEqual(report.reviewers.map(x => x.family), ['z-ai', 'nvidia']);
  assert.equal(report.requiresMaintainerDecision, true);
});
test('two distinct-family Cloudflare BLOCKs stop remaining calls', async () => {
  let requests = 0;
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'mock', cloudflare: cfg,
    reviewCloudflare: async model => {
      requests++;
      return { ...model, verdict: 'BLOCK', findings: [{ severity: 'critical' }],
        falsification_attempts: ['Exploit reproduced'] };
    },
    getCatalog: async () => { throw new Error('Must not call catalog after BLOCK'); }
  });
  assert.equal(report.verdict, 'BLOCK');
  assert.equal(report.decisiveFamilies, 2);
  assert.equal(report.disputed, false);
  assert.equal(requests, 2);
});
test('same model family on two providers cannot create fake independence', async () => {
  const candidates = { data: [{
    id: 'google/gemma-4-31b-it:free',
    pricing: { prompt: '0', completion: '0' }
  }] };
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'mock',
    cloudflare: cfg, getCatalog: async () => candidates,
    reviewCloudflare: async model => ({ ...model, verdict: model.family === 'google'
      ? 'PASS' : 'INCONCLUSIVE', findings: [], falsification_attempts:
      model.family === 'google' ? ['negative path'] : [] }),
    review: async model => ({ ...model, ...pass })
  });
  assert.equal(report.verdict, 'INCONCLUSIVE');
});
test('Cloudflare model-specific 429 tries remaining families then OpenRouter without fake PASS', async () => {
  const catalog = { data: ['google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free'].map(id => ({
      id, pricing: { prompt: '0', completion: '0' }
    })) };
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'mock',
    cloudflare: cfg, getCatalog: async () => catalog,
    reviewCloudflare: async model => ({ ...model, verdict: 'INCONCLUSIVE',
      reason: 'Cloudflare HTTP 429', falsification_attempts: [], findings: [] }),
    review: async model => ({ ...model, ...pass })
  });
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.reviewers.length, 5);
  assert.equal(report.reviewers.filter(x=>x.provider==='cloudflare').length,3);
  assert.equal(report.providerIssues.length, 1);
});

test('copied REST curl command is refused locally before any network request', async () => {
  const secret = 'cfut_' + 'S'.repeat(40);
  const pastedCommand = 'curl "https://api.cloudflare.com" -H "Authorization: Bearer ' + secret + '"';
  const model = { provider: 'cloudflare', family: 'google',
    id: '@cf/google/gemma-4-26b-a4b-it' };
  assert.deepEqual(availableCloudflareModels({ ...cfg, token: pastedCommand }), []);
  let calls = 0;
  const result = await requestCloudflareReview(model, patch, {}, {
    ...cfg, token: pastedCommand, parseVerdict, systemPrompt: 'review',
    getJson: async () => { calls++; throw new Error('must not call provider'); }
  });
  assert.equal(calls, 0);
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.reason, 'Invalid Workers AI token format');
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('unexpected fetch and upstream errors never echo an API key to artifacts', async () => {
  const model = availableCloudflareModels(cfg)[0];
  const probe = 'SENSITIVE_HEADER_MUST_NOT_APPEAR';
  for (const exception of [
    new TypeError('Headers.append: Bearer ' + cfg.token + ' ' + probe),
    new Error('Cloudflare HTTP 403: Authorization ' + cfg.token + ' ' + probe),
    new Error('provider reply ' + probe)
  ]) {
    const result = await requestCloudflareReview(model, patch, {}, {
      ...cfg, systemPrompt: 'review', parseVerdict,
      getJson: async () => { throw exception; }
    });
    assert.equal(result.verdict, 'INCONCLUSIVE');
    assert.equal(result.reason, 'Cloudflare request failed (details redacted)');
    assert.ok(!JSON.stringify(result).includes(cfg.token));
    assert.ok(!JSON.stringify(result).includes(probe));
  }
});

test('review report flags malformed Cloudflare token without exposing content', async () => {
  const pasted = 'curl -H "Authorization: Bearer cfut_' + 'Q'.repeat(40) + '"';
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: '',
    cloudflare: { ...cfg, token: pasted },
    getCatalog: async () => { throw new Error('should not fetch catalog'); }
  });
  assert.equal(report.verdict, 'INCONCLUSIVE');
  assert.match(report.providerIssues.join(' '), /token malformed/);
  assert.ok(!JSON.stringify(report).includes(pasted));
  assert.equal(report.reviewers.length, 0);
});

test('compact curl command and provider-text prefixes are not Workers AI tokens', async () => {
  const disguised = [
    'curl-HAuthorizationBearer-cfut_' + 'a'.repeat(40),
    'curl-HAuthorizationBearer' + 'a'.repeat(40),
    'Bearer' + 'b'.repeat(48), 'sk_' + 'c'.repeat(42)
  ];
  for (const token of disguised) {
    assert.equal(availableCloudflareModels({ ...cfg, token }).length, 0);
    const review = await requestCloudflareReview(
      { provider: 'cloudflare', family: 'google', id: '@cf/google/gemma-4-26b-a4b-it' },
      patch, {}, { ...cfg, token, systemPrompt: 'review', parseVerdict,
        getJson: async () => { throw new Error('NETWORK MUST NOT BE CALLED'); }
      });
    assert.equal(review.reason, 'Invalid Workers AI token format');
  }
});
test('allowlisted diagnostic text is strictly exact and cannot contain a key', () => {
  const { safeCloudflareError } = require('../scripts/independent-review-cloudflare.cjs');
  const secret = cfg.token;
  assert.equal(safeCloudflareError(new Error('Model did not return valid JSON '+ secret)),
    'Cloudflare request failed (details redacted)');
  assert.equal(safeCloudflareError(new Error('Missing structured review fields '+ secret)),
    'Cloudflare request failed (details redacted)');
});

test('one BLOCK and a distinct-family PASS stay blocked with recorded dissent', async () => {
  let calls = 0;
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: '', cloudflare: cfg,
    reviewCloudflare: async model => {
      calls++;
      return model.family === 'z-ai'
        ? { ...model, verdict: 'BLOCK', findings: [{
          file: 'lib/a.js', line: '9', severity: 'high',
          evidence: 'Claimed failing expression', reproduction: 'Run input x'
        }], falsification_attempts: ['Claimed test'] }
        : { ...model, ...pass };
    }
  });
  assert.equal(calls, 2);
  assert.equal(report.verdict, 'BLOCK');
  assert.equal(report.decisiveFamilies, 2);
  assert.equal(report.disputed, true);
  assert.equal(report.requiresMaintainerDecision, true);
  assert.match(report.blockers.join(' '), /reproduce findings/);
});
test('one BLOCK plus provider outages is never independent approval', async () => {
  let calls = 0;
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: '', cloudflare: cfg,
    reviewCloudflare: async model => {
      calls++;
      return model.family === 'z-ai'
        ? { ...model, verdict: 'BLOCK', findings: [{severity: 'high'}],
          falsification_attempts: ['Suspected failure'] }
        : { ...model, verdict: 'INCONCLUSIVE', findings: [],
          falsification_attempts: [], reason: 'Cloudflare request timed out' };
    }
  });
  assert.equal(calls, 3);
  assert.equal(report.verdict, 'BLOCK');
  assert.equal(report.decisiveFamilies, 1);
  assert.match(report.blockers.join(' '), /Single-family BLOCK/);
});
test('Cloudflare BLOCK seeks OpenRouter second family when Cloudflare second fails', async () => {
  let cfCalls = 0, orCalls = 0;
  const catalog = { data: [
    { id: 'google/gemma-4-31b-it:free', pricing: { prompt: '0', completion: '0' } },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', pricing: { prompt: '0', completion: '0' } }
  ] };
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'mock', cloudflare: cfg,
    reviewCloudflare: async model => {
      cfCalls++;
      return model.family === 'z-ai'
        ? { ...model, verdict: 'BLOCK', findings: [{ severity: 'high' }],
          falsification_attempts: ['Reproduction attempted'] }
        : { ...model, verdict: 'INCONCLUSIVE', findings: [],
          falsification_attempts: [], reason: 'Cloudflare request timed out' };
    },
    getCatalog: async () => catalog,
    review: async model => { orCalls++; return { ...model, ...pass }; }
  });
  assert.equal(cfCalls, 3);
  assert.equal(orCalls, 1);
  assert.equal(report.decisiveFamilies, 2);
  assert.equal(report.disputed, true);
  assert.equal(report.verdict, 'BLOCK');
});

test('oversized multi-file patch is split without dropping any changed byte',()=>{
  const {splitCloudflarePatch}=require('../scripts/independent-review-gate.cjs');
  const {MAX_PATCH_BYTES}=require('../scripts/independent-review-cloudflare.cjs');
  const file=name=>'diff --git a/'+name+' b/'+name+'\n@@ -1 +1 @@\n-old\n+'+'a'.repeat(9500)+'\n';
  const long=file('a.js')+file('b.js');
  const chunks=splitCloudflarePatch(long);
  assert.equal(chunks.length,2);
  assert.equal(chunks.join(''),long);
  assert.ok(chunks.every(chunk=>Buffer.byteLength(chunk)<=MAX_PATCH_BYTES));
  assert.equal(splitCloudflarePatch(file('one.js')+'z'.repeat(10000)),null);
});
test('two independent Cloudflare families must each PASS every exact patch chunk',async()=>{
  const file=name=>'diff --git a/'+name+' b/'+name+'\n@@ -1 +1 @@\n-old\n+'+'z'.repeat(9500)+'\n';
  const long=file('a.js')+file('b.js');
  const calls=[];
  const report=await reviewPatch({patch:long,base:'a'.repeat(40),head:'b'.repeat(40),key:'',cloudflare:cfg,
    reviewCloudflare:async(model,chunk,metadata)=>{
      calls.push({family:model.family,chunk,metadata});
      return {...model,...pass};
    },
    getCatalog:async()=>{throw Error('No paid or third-party fallback needed')}
  });
  assert.equal(report.verdict,'PASS');assert.equal(report.reviewers.length,2);
  assert.equal(calls.length,4);
  assert.deepEqual(report.reviewers.map(r=>r.reviewedChunks),[2,2]);
  assert.deepEqual(report.reviewers.map(r=>r.family),['z-ai','nvidia']);
  assert.equal(calls[0].metadata.chunkCount,2);
  assert.equal(calls[0].metadata.chunkSha256,report.reviewChunks[0].sha256);
  assert.equal(report.reviewChunks.reduce((sum,x)=>sum+x.bytes,0),Buffer.byteLength(long));
});
test('chunked independent review remains BLOCK on any chunk and INCONCLUSIVE if an entire family has not passed all',async()=>{
  const file=name=>'diff --git a/'+name+' b/'+name+'\n@@ -1 +1 @@\n-old\n+'+'v'.repeat(9500)+'\n';
  const long=file('a.js')+file('b.js');
  const block=await reviewPatch({patch:long,base:'a'.repeat(40),head:'b'.repeat(40),key:'',cloudflare:cfg,
    reviewCloudflare:async(model,_chunk,metadata)=>model.family==='z-ai'&&metadata.chunkIndex===2
      ? {...model,verdict:'BLOCK',findings:[{file:'b.js',line:'1',severity:'high',evidence:'bad branch',reproduction:'bad input'}],falsification_attempts:['reproduced']}
      : {...model,...pass}
  });
  assert.equal(block.verdict,'BLOCK');assert.equal(block.disputed,true);
  const incomplete=await reviewPatch({patch:long,base:'a'.repeat(40),head:'b'.repeat(40),key:'',cloudflare:cfg,
    reviewCloudflare:async(model,_chunk,metadata)=>metadata.chunkIndex===2&&model.family!=='nvidia'
      ? {...model,verdict:'INCONCLUSIVE',reason:'Cloudflare request timed out',findings:[],falsification_attempts:[]}
      : {...model,...pass}
  });
  assert.equal(incomplete.verdict,'INCONCLUSIVE');
  assert.equal(incomplete.reviewers.filter(r=>r.verdict==='PASS').length,1);
});

test('chunked BLOCK evidence survives long warnings in preceding PASS chunks',async()=>{
 const file=name=>'diff --git a/'+name+' b/'+name+'\n@@ -1 +1 @@\n-old\n+'+'u'.repeat(9500)+'\n';
 const long=file('a.js')+file('b.js');
 const report=await reviewPatch({patch:long,base:'a'.repeat(40),head:'b'.repeat(40),key:'',cloudflare:cfg,
  reviewCloudflare:async(model,_chunk,meta)=>{
   if(model.family==='z-ai'&&meta.chunkIndex===1)return {...model,...pass,
     findings:Array.from({length:12},()=>({file:'a.js',line:'1',severity:'low',evidence:'non-blocking warning'}))};
   if(model.family==='z-ai')return {...model,verdict:'BLOCK',findings:[{file:'b.js',line:'2',
     severity:'critical',evidence:'bad branch',reproduction:'bad input'}],falsification_attempts:['reproduced']};
   return {...model,...pass};
  }
 });
 assert.equal(report.verdict,'BLOCK');
 assert.ok(report.reviewers[0].findings.some(x=>x.file==='b.js'&&x.severity==='critical'));
 assert.ok(report.reviewers[0].falsification_attempts[0].startsWith('chunk 2:'));
});

test('oversized indivisible file never gets fake independent approval',async()=>{
 const long='diff --git a/large.js b/large.js\n@@ -1 +1 @@\n-old\n+'+'a'.repeat(20000)+'\n';
 let calls=0;
 const report=await reviewPatch({patch:long,base:'a'.repeat(40),head:'b'.repeat(40),key:'',cloudflare:cfg,
   reviewCloudflare:async()=>{calls++;return {...pass,family:'z-ai'};}
 });
 assert.equal(calls,0);
 assert.equal(report.verdict,'INCONCLUSIVE');
 assert.equal(report.reviewers.length,0);
 assert.ok(report.blockers.length>0);
 assert.match(report.providerIssues.join(' '),/safely partition/);
});


test('one-file under-budget and UTF-8 multi-file boundaries preserve exact bytes',()=>{
 const {splitCloudflarePatch}=require('../scripts/independent-review-gate.cjs');
 const {MAX_PATCH_BYTES}=require('../scripts/independent-review-cloudflare.cjs');
 const file=name=>'diff --git a/'+name+' b/'+name+'\n@@ -1 +1 @@\n-old\n+'+'🚀'.repeat(3000)+'\n';
 const small='diff --git a/one.js b/one.js\n@@ -1 +1 @@\n-old\n+new\n';
 assert.deepEqual(splitCloudflarePatch(small),[small]);
 const patch=file('one.js')+file('two.js');
 const chunks=splitCloudflarePatch(patch);
 assert.equal(chunks.length,2);
 assert.equal(chunks.join(''),patch);
 assert.ok(chunks.every(chunk=>Buffer.byteLength(chunk)<=MAX_PATCH_BYTES));
});
test('model-specific 429 after a PASS chunk does not prevent other full families',async()=>{
 const file=name=>'diff --git a/'+name+' b/'+name+'\n@@ -1 +1 @@\n-old\n+'+'z'.repeat(9500)+'\n';
 const patch=file('a.js')+file('b.js');
 const calls=[];
 const report=await reviewPatch({patch,base:'a'.repeat(40),head:'b'.repeat(40),key:'',cloudflare:cfg,
  reviewCloudflare:async(model,chunk,metadata)=>{
   calls.push([model.family,metadata.chunkIndex]);
   return model.family==='z-ai'&&metadata.chunkIndex===2
    ? {...model,verdict:'INCONCLUSIVE',reason:'Cloudflare HTTP 429',findings:[],falsification_attempts:[]}
    : {...model,...pass};
  }});
 assert.equal(report.verdict,'PASS');
 assert.equal(report.decisiveFamilies,2);
 assert.deepEqual(report.reviewers.map(r=>r.verdict),['INCONCLUSIVE','PASS','PASS']);
 assert.equal(calls.length,6);
});
