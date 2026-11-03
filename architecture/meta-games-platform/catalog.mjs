#!/usr/bin/env node
// Audited discovery without granting redistribution rights.
import { readFileSync } from 'node:fs';
const index = JSON.parse(readFileSync(new URL('./ASSET_INDEX.json', import.meta.url), 'utf8'));
export function validate(data = index) {
  if (data.schema_version !== 1 || data.coverage !== 'partial') throw Error('unsupported index schema');
  if (!Array.isArray(data.games) || !Array.isArray(data.reusable_assets) || !Array.isArray(data.review_candidates)) throw Error('invalid arrays');
  const ids = new Set();
  for (const item of [...data.games, ...data.reusable_assets, ...data.review_candidates]) {
    if (!/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)) throw Error('invalid or duplicate ID: ' + item.id);
    ids.add(item.id);
    const s = item.source || item.entry;
    if (s.repository !== 'mpaykin1/meta6' || !/^[a-f0-9]{40}$/.test(s.commit) || !/^[a-f0-9]{40}$/.test(s.git_blob_sha)) throw Error('unverified source: ' + item.id);
    if (!s.path || s.path.startsWith('/') || s.path.includes('..') || /[?#\\]/.test(s.path)) throw Error('unsafe path: ' + item.id);
    if (item.license_status === 'unverified' && (item.reuse_allowed || item.redistribution_allowed)) throw Error('unlicensed asset published');
  }
  if (data.reusable_assets.some(x => x.license_status !== 'verified' || x.reuse_allowed !== true || x.redistribution_allowed !== true || !x.license_id)) throw Error('unsafe license gate');
  for (const a of [...data.reusable_assets, ...data.review_candidates]) if (!data.games.some(g => g.id === a.game_id)) throw Error('unknown game: ' + a.id);
  return {ok:true,games:data.games.length,reusable_assets:data.reusable_assets.length,review_candidates:data.review_candidates.length};
}
export function listGames() { return index.games.map(({id,name,status,entry,play_url}) => ({id,name,status,entry,play_url})); }
export function inspectGame(id) { return index.games.find(g => g.id === id) || null; }
export function listAssets() { return index.reusable_assets.filter(x => x.license_status === 'verified' && x.reuse_allowed && x.redistribution_allowed); }
export function searchAssets(q) { const term = String(q || '').toLowerCase().trim(); return listAssets().filter(x => JSON.stringify([x.id,x.type,x.game_id]).toLowerCase().includes(term)); }
const commands = {validate:()=>validate(),games:listGames,'eligible-assets':listAssets,'review-candidates':()=>index.review_candidates,inspect:()=>inspectGame(process.argv[3]),search:()=>searchAssets(process.argv[3])};
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const cmd=commands[process.argv[2]]; if(!cmd) { console.error('Usage: node catalog.mjs validate|games|eligible-assets|review-candidates|inspect <id>|search <query>');process.exitCode=2; }
  else { try { console.log(JSON.stringify(cmd(),null,2)); } catch(e) { console.error(e.message); process.exitCode=1; } }
}
