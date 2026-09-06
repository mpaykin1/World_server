'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','world-cloud-ai.yml'),'utf8');

test('cloud AI fails over only across live zero-cost tool-capable models',()=>{
  assert.match(workflow,/\.pricing\.prompt == "0" and \.pricing\.completion == "0"/);
  assert.match(workflow,/supported_parameters[\s\S]*index\("tools"\)/);
  assert.match(workflow,/WORLD_FREE_MODELS/);
  assert.match(workflow,/for MODEL in "\$\{MODELS\[@\]\}"/);
  assert.match(workflow,/failed with exit \$\{STATUS\}; trying the next verified-free model/);
  assert.match(workflow,/All live approved zero-cost models failed\. Refusing paid fallback\./);
  assert.match(workflow,/echo "MODEL=\$\{MODEL\}" >> "\$\{GITHUB_ENV\}"/);
  assert.doesNotMatch(workflow,/MODEL: worldrouter\//);
});

test('failed model attempts cannot leak a partial patch into the next model',()=>{
  const loop=workflow.slice(workflow.indexOf('for MODEL in "${MODELS[@]}"'));
  assert.match(loop,/git reset --hard "\$\{START_HEAD\}"/);
  assert.match(loop,/git clean -fd/);
  assert.ok(loop.indexOf('git reset --hard') < loop.indexOf('opencode run'));
});

test('approved explicit candidates are free endpoints',()=>{
  const block=workflow.match(/APPROVED=\(([\s\S]*?)\n          \)/)?.[1]||'';
  const ids=[...block.matchAll(/"([^"]+)"/g)].map(m=>m[1]);
  assert.ok(ids.length>=4);
  for(const id of ids) assert.ok(id.endsWith(':free')||id==='openrouter/free',id);
});
