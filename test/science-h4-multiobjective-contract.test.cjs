const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');

test('RUN_040 report exposes all H4 dimensions and cannot hide novelty regression',()=>{
 const r=JSON.parse(fs.readFileSync(path.join(root,'H4_REAL_HOLDOUT_MEMORY_ABLATION_REPORT.json'),'utf8'));
 for(const k of ['baselineMeanQuality','memoryMeanQuality','baselineErrors','memoryErrors','baselineNovelty','memoryNovelty','baselineMs','memoryMs']) assert.equal(typeof r[k],'number',k);
 assert.ok(r.qualityGain>0,'memory must show measured quality gain in this run');
 assert.ok(r.timeRatio<=2,'cost/time gate');
 assert.ok(r.memoryErrors<=r.baselineErrors,'error gate');
 assert.ok(r.noveltyDelta<0,'preserve observed novelty regression; do not rewrite it as a gain');
});

test('full H4 claim requires quality, cost, errors AND novelty',()=>{
 const r=JSON.parse(fs.readFileSync(path.join(root,'H4_REAL_HOLDOUT_MEMORY_ABLATION_REPORT.json'),'utf8'));
 const fullH4Pass=r.qualityGain>=0.15 && r.timeRatio<=2 && r.memoryErrors<=r.baselineErrors && r.noveltyDelta>=0;
 assert.equal(fullH4Pass,false,'RUN_040 must not be promoted to full multi-objective H4 PASS');
});
