#!/usr/bin/env node
/**
 * Krieger Knowledge staleness gate.
 * Usage: node scripts/kkrieger-knowledge-staleness.mjs <changed-file>...
 * Exits 1 when changed Krieger source overlaps a VERIFIED knowledge entry
 * that has not been explicitly marked NEEDS_REVERIFY.
 */
import fs from 'node:fs';

const indexPath = new URL('../docs/kkrieger/knowledge-index.json', import.meta.url);
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const changed = process.argv.slice(2).map(p => p.replaceAll('\\','/'));
if (!changed.length) {
  console.error('Usage: node scripts/kkrieger-knowledge-staleness.mjs <changed-file>...');
  process.exit(2);
}
const basename = p => p.split('/').pop();
const hits = [];
for (const entry of index.entries ?? []) {
  const refs = entry.files ?? [];
  const touched = changed.filter(c => refs.some(r => c === r || c.endsWith('/'+r) || basename(c) === basename(r)));
  if (touched.length && entry.status !== 'NEEDS_REVERIFY') hits.push({id:entry.id,status:entry.status,touched});
}
if (hits.length) {
  console.error('Krieger knowledge requires re-verification:');
  for (const h of hits) console.error(`- ${h.id} [${h.status}] <- ${h.touched.join(', ')}`);
  console.error('Mark affected knowledge entries NEEDS_REVERIFY, repeat source/runtime evidence, then restore an allowed evidence status.');
  process.exit(1);
}
console.log('Krieger knowledge staleness gate: OK');
