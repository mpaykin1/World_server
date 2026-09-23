'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('the canonical consequence engine exposes the same implementation to Node and Edge', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/_shared/world-consequence-engine.js'), 'utf8');
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  const edge = context.globalThis.WorldConsequenceEngine;
  const node = require('../lib/world-consequence-engine');
  assert.ok(edge);
  assert.deepEqual(JSON.parse(JSON.stringify(edge.createWorld('shared-seed'))), node.createWorld('shared-seed'));
  assert.equal(edge.interpretIntent('геотермальная энергия', 'geothermal').mechanism, 'geothermal');
});

test('Supabase Edge dispatches authenticated Chain Reaction before guest Voxel identity', () => {
  const entry = fs.readFileSync(path.join(root, 'supabase/functions/world-emergence/index.ts'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'supabase/functions/world-emergence/chain-reaction.ts'), 'utf8');
  assert.match(entry, /if\(isChainReactionAction\(action\)\)return await handleChainReaction\(admin,req,b,\{json\}\)/);
  assert.ok(entry.indexOf('isChainReactionAction(action)') < entry.indexOf('const who=await identity'));
  assert.match(adapter, /import "\.\.\/_shared\/world-consequence-engine\.js"/);
  assert.match(adapter, /chain_reaction_world_members/);
  assert.match(adapter, /\.eq\("updated_at",row\.updated_at\)/);
  assert.match(adapter, /actor\.app_metadata\?\.chain_reaction_worlds/);
  assert.doesNotMatch(adapter, /user_metadata/);
});

test('canonical Edge World Factory grants idempotent private creator membership', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/world-stack/index.ts'), 'utf8');
  assert.match(source, /const creator = await requireUser\(admin, req\)/);
  assert.match(source, /from\("chain_reaction_world_members"\)/);
  assert.match(source, /onConflict: "world_id,user_id"/);
  assert.match(source, /chainReaction: \{ role: "owner" \}/);
  assert.doesNotMatch(source, /app_metadata.*chain_reaction_worlds\s*=/);
});
