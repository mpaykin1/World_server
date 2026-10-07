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
  assert.match(adapter, /commit_chain_reaction_action/);
  assert.match(adapter, /publicState\(next\)/);
  assert.match(adapter, /"invite-member","revoke-member"/);
  assert.match(adapter, /"genie-options"/);
  assert.match(adapter, /engine\.genieOptions\(world\)/);
  assert.match(adapter, /"resident-at-address"/);
  assert.match(adapter, /engine\.address\(world,requested\.building,requested\.floor,requested\.flat\)/);
  assert.match(adapter, /resident:publicResident\(resident\)/);
  assert.doesNotMatch(adapter, /app_metadata\?\.chain_reaction_worlds/);
  assert.doesNotMatch(adapter, /user_metadata/);
});

test('private Chain Reaction migration makes CAS and provenance one closed transaction', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260923220423_chain_reaction_private_history.sql'), 'utf8');
  assert.match(migration, /chain_reaction_private_events enable row level security/i);
  assert.match(migration, /revoke all on table[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /where id = p_world_id[\s\S]+updated_at = p_expected_updated_at/i);
  assert.match(migration, /chain_reaction_world_members[\s\S]+for key share/i);
  assert.match(migration, /insert into public\.chain_reaction_private_events/i);
  assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /project->'intent'\) - 'comment'[\s\S]+jsonb_array_elements/i);
  assert.match(migration, /event - 'comment'\) - 'actorId'/i);
  assert.match(migration, /updated_at = greatest\(clock_timestamp\(\), updated_at \+ interval '1 microsecond'\)/i);
  assert.match(migration, /add constraint voxel_worlds_chain_reaction_public_privacy[\s\S]+not valid/i);
  assert.match(migration, /validate constraint voxel_worlds_chain_reaction_public_privacy/i);
  assert.match(migration, /public privacy backfill was incomplete/i);
});

test('legacy trusted grants are backfilled once and stale JWT claims cannot bypass revoke', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260923210643_chain_reaction_membership_control.sql'), 'utf8');
  const nodeAdapter = fs.readFileSync(path.join(root, 'lib', 'chain-reaction-api.js'), 'utf8');
  assert.match(migration, /raw_app_meta_data\s*->\s*'chain_reaction_worlds'/);
  assert.match(migration, /on conflict \(world_id, user_id\) do nothing/i);
  assert.doesNotMatch(nodeAdapter, /app_metadata\?\.chain_reaction_worlds/);
});

test('canonical Edge World Factory grants idempotent private creator membership', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/world-stack/index.ts'), 'utf8');
  assert.match(source, /const creator = await requireUser\(admin, req\)/);
  assert.match(source, /from\("chain_reaction_world_members"\)/);
  assert.match(source, /onConflict: "world_id,user_id"/);
  assert.match(source, /chainReaction: \{ role: "owner" \}/);
  assert.doesNotMatch(source, /app_metadata.*chain_reaction_worlds\s*=/);
});

test('Node and Edge expose equivalent privacy-redacted, revision-fenced game-state',()=>{
 const node=fs.readFileSync(path.join(root,'lib/chain-reaction-api.js'),'utf8');
 const edge=fs.readFileSync(path.join(root,'supabase/functions/world-emergence/chain-reaction.ts'),'utf8');
 for(const source of [node,edge]){
  assert.match(source,/game-state/);assert.match(source,/world:\s*publicState\(world\)/);
  assert.match(source,/body\.expectedRevision !== undefined|body\.expectedRevision!==undefined/);
  assert.match(source,/STALE_REVISION/);assert.match(source,/engine\.genieOptions\(world\)/);
  assert.match(source,/publicState\(\{\s*history:\s*world\.history\.slice/);
  assert.match(source,/world:\s*publicState\(next\)/);
 }
});

// Source parity for the explicit resident DTO, not merely a superficial game-state action.
test('Node and Edge both allowlist residents in every public world projection', () => {
  const node = fs.readFileSync(path.join(root, 'lib/chain-reaction-api.js'), 'utf8');
  const edge = fs.readFileSync(path.join(root, 'supabase/functions/world-emergence/chain-reaction.ts'), 'utf8');
  for (const source of [node, edge]) {
    assert.match(source, /safe\.residents\s*=\s*publicResidents\(safe\)/);
    assert.match(source, /engine\.residentDirectory\(/);
    for (const field of ['id','name','fictional','building','floor','flat'])
      assert.match(source, new RegExp('(?:\\b'+field+'\\s*:)'));
    assert.match(source, /world:\s*publicState\(world\)/);
    assert.match(source, /world:\s*publicState\(next\)/);
  }
});
